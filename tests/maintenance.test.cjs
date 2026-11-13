'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMaintenance, RETENTION_MS, MAX_DELETIONS } = require('../cloudfunctions/maintenance/service');
const { triggers } = require('../cloudfunctions/maintenance/config.json');

const NOW = Date.UTC(2026, 10, 13, 19, 20);
const event = { Type: 'Timer', TriggerName: triggers[0].name };
const context = { SOURCE: 'wx_trigger' };

function setup(rows = []) {
  const records = new Map(rows.map((row) => [row._id, structuredClone(row)]));
  let calls = 0;
  const db = {
    beforeRemove: null,
    command: {
      lt: (expected) => (value) => typeof value === 'number' && value < expected,
      in: (expected) => (value) => expected.includes(value),
    },
    collection(name) {
      calls++;
      assert.equal(name, 'runs', '清理函数只能访问会话集合');
      return { where(filter) {
        let limit = Infinity;
        const matching = () => [...records.values()].filter((row) => Object.entries(filter)
          .every(([field, expected]) => typeof expected === 'function' ? expected(row[field]) : row[field] === expected));
        const query = {
          orderBy() { return query; },
          limit(value) { limit = value; return query; },
          field() { return query; },
          async get() { return { data: matching().sort((a, b) => a.startedAt - b.startedAt).slice(0, limit).map((row) => structuredClone(row)) }; },
          async remove() {
            if (db.beforeRemove) await db.beforeRemove();
            const found = matching();
            for (const row of found) records.delete(row._id);
            return { stats: { removed: found.length } };
          },
        };
        return query;
      } };
    },
  };
  return { db, records, calls: () => calls, run: createMaintenance({ db, clock: () => NOW }) };
}

test('客户端伪造定时事件、间接调用和缺失可信来源均被拒，且不访问数据库', async () => {
  const s = setup();
  for (const source of ['wx_client', 'wx_devtools', 'wx_http', 'wx_client,scf', 'wx_trigger,scf', undefined]) {
    const result = await s.run({ ...event, SOURCE: 'wx_trigger', context }, { SOURCE: source });
    assert.equal(result.ok, false);assert.equal(result.error.code, 'FORBIDDEN');
  }
  assert.equal((await s.run(event, null)).ok, false);
  assert.equal((await s.run({ ...event, TriggerName: 'other-trigger' }, context)).ok, false);
  assert.equal((await s.run({ ...event, Type: 'HTTP' }, context)).ok, false);
  assert.equal(s.calls(), 0);
});

test('只清理服务器时间七天前的会话，保留临界值、新会话和二十四小时内活跃局', async () => {
  const cutoff = NOW - RETENTION_MS;
  const s = setup([
    { _id: 'old-finished', startedAt: cutoff - 2, status: 'finished' },
    { _id: 'old-abandoned', startedAt: cutoff - 1, status: 'abandoned' },
    { _id: 'old-active', startedAt: cutoff - 100, status: 'active' },
    { _id: 'boundary', startedAt: cutoff, status: 'finished' },
    { _id: 'recent', startedAt: NOW - 23 * 60 * 60 * 1000, status: 'active' },
    { _id: 'newest', startedAt: NOW, status: 'active' },
  ]);
  const result = await s.run({ ...event, Time: '2099-01-01T00:00:00Z', cutoffAt: NOW + RETENTION_MS }, context);
  assert.deepEqual(result, { ok: true, cutoffAt: cutoff, selected: 3, removed: 3, limitReached: false });
  assert.deepEqual([...s.records.keys()].sort(), ['boundary', 'newest', 'recent']);
});

test('单次最多删除一千条，下一次从剩余过期会话继续且重复触发幂等', async () => {
  const s = setup(Array.from({ length: MAX_DELETIONS + 37 }, (_, i) => ({ _id: `old-${i}`, startedAt: NOW - RETENTION_MS - i - 1 })));
  const first = await s.run(event, context);
  assert.equal(first.removed, MAX_DELETIONS);assert.equal(first.limitReached, true);assert.equal(s.records.size, 37);
  const second = await s.run(event, context);
  assert.equal(second.removed, 37);assert.equal(second.limitReached, false);assert.equal(s.records.size, 0);
  assert.equal((await s.run(event, context)).removed, 0);
});

test('查询后旧会话ID被新的挑战复用时，删除再次检查时间避免误删', async () => {
  const s = setup([{ _id: 'reused', startedAt: NOW - RETENTION_MS - 1 }]);
  s.db.beforeRemove = async () => { s.records.set('reused', { _id: 'reused', startedAt: NOW });s.db.beforeRemove = null; };
  const result = await s.run(event, context);
  assert.equal(result.removed, 0);assert.equal(s.records.get('reused').startedAt, NOW);
});

test('数据库中断向平台抛错以便重试，不将失败清理报告为成功', async () => {
  const s = setup([{ _id: 'old', startedAt: NOW - RETENTION_MS - 1 }]);
  s.db.beforeRemove = async () => { throw new Error('模拟数据库中断'); };
  await assert.rejects(s.run(event, context), /模拟数据库中断/);
  assert.equal(s.records.size, 1);
  s.db.beforeRemove = null;
  assert.equal((await s.run(event, context)).removed, 1);
});
