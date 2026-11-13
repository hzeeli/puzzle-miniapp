'use strict';
const { triggers } = require('./config.json');

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DELETIONS = 1000;
const BATCH_SIZE = 100;

function createMaintenance({ db, clock = Date.now }) {
  return async (event, context) => {
    if (!context || context.SOURCE !== 'wx_trigger' || !event ||
        event.Type !== 'Timer' || event.TriggerName !== triggers[0].name) {
      return { ok: false, error: { code: 'FORBIDDEN', message: '仅允许指定的定时触发器执行' } };
    }
    const cutoffAt = clock() - RETENTION_MS;
    const _ = db.command;
    let selected = 0, removed = 0;
    while (selected < MAX_DELETIONS) {
      const batch = await db.collection('runs').where({ startedAt: _.lt(cutoffAt) })
        .orderBy('startedAt', 'asc').limit(Math.min(BATCH_SIZE, MAX_DELETIONS - selected))
        .field({ _id: true }).get();
      if (batch.data.length === 0) break;
      const ids = batch.data.map((run) => run._id);
      selected += ids.length;
      // 同一文档 ID 可能被新挑战复用，删除时仍需匹配原始时间范围。
      const result = await db.collection('runs')
        .where({ _id: _.in(ids), startedAt: _.lt(cutoffAt) }).remove();
      removed += result.stats.removed;
    }
    return { ok: true, cutoffAt, selected, removed, limitReached: selected === MAX_DELETIONS };
  };
}

module.exports = { createMaintenance, RETENTION_MS, MAX_DELETIONS };
