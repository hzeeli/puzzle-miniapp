'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameService, RUN_TTL_MS, MAX_MOVES } = require('../cloudfunctions/gameApi/service');
const { createRepository } = require('../cloudfunctions/gameApi/repository');
const Journey = require('../shared/journey');
const Rules = require('../shared/rules');
const {replay: storyReplay} = require('../shared/story-replay');
const {STORY_START,STORY_END} = require('../cloudfunctions/gameApi/story-rank-key');
const { CONSENT_VERSION } = require('../shared/profile-options');

const copy = (value) => value === undefined ? undefined : structuredClone(value);
const solvedMoves = [{ from: 0, to: 1 }, { from: 2, to: 3 }];

function memoryRepository() {
  let data = { players: new Map(), runs: new Map(), bestScores: new Map() }, queue = Promise.resolve();
  const order = (a, b) => a.durationMs - b.durationMs || a.achievedAt - b.achievedAt || a.playerId.localeCompare(b.playerId);
  const documents = (state) => ({
    async get(collection, id) { return state[collection].has(id) ? { _id: id, ...copy(state[collection].get(id)) } : null; },
    async put(collection, id, value) {
      if (repo.failPut === collection) { repo.failPut = null; throw new Error('模拟数据库写入失败'); }
      const { _id, ...record } = value;
      state[collection].set(id, copy(record));
    },
    async remove(collection, id) { state[collection].delete(id); },
  });
  const repo = {
    failPut: null, failCleanup: false,
    get: (collection, id) => documents(data).get(collection, id),
    async transaction(work) {
      let release;
      const before = queue;
      queue = new Promise((resolve) => { release = resolve; });
      await before;
      const draft = { players: new Map(copy([...data.players])), runs: new Map(copy([...data.runs])), bestScores: new Map(copy([...data.bestScores])) };
      try { const result = await work(documents(draft)); data = draft; return result; }
      finally { release(); }
    },
    async topStory() {
      return [...data.bestScores].filter(([key])=>key>=STORY_START && key<STORY_END)
        .sort(([a],[b])=>a<b?-1:1).slice(0,10).map(([,row])=>copy(row));
    },
    async storyRank(key) { return [...data.bestScores.keys()].filter(k=>k>=STORY_START && k<key).length+1; },
    async listBest(owner) { return [...data.bestScores.values()].filter((score) => score.owner === owner).map(copy); },
    async topScores(levelId, levelVersion) {
      return [...data.bestScores.values()].filter((score) => score.levelId === levelId && score.levelVersion === levelVersion).sort(order).slice(0, 10).map(copy);
    },
    async rankOf(score) { return [...data.bestScores.values()].filter((item) => item.levelId === score.levelId && item.levelVersion === score.levelVersion && order(item, score) < 0).length + 1; },
    async removeOwned(collection, owner, playerId) {
      if (repo.failCleanup) { repo.failCleanup = false; throw new Error('模拟清理中断'); }
      for (const [key, value] of data[collection]) if (value.owner === owner && value.playerId === playerId) data[collection].delete(key);
    },
    all: (collection) => [...data[collection].values()].map(copy),
  };
  return repo;
}
function setup() {
  const repo = memoryRepository(); let now = 100000, sequence = 0, replayCalls = 0;
  const levels = {
    legacyLevels: Array.from({length:10}, (_,i) => ({id:i+1,version:3})),
    levels: Array.from({length:12}, (_,i) => ({id:i+1,version:4})),
  };
  levels.getLevel = (id,version) => [...levels.legacyLevels,...levels.levels].find(l => l.id === id && l.version === version) || null;
  const rules = {
    replay(level, moves) {
      replayCalls++;
      for (let i = 0; i < moves.length; i++) if (!solvedMoves[i] || moves[i].from !== solvedMoves[i].from || moves[i].to !== solvedMoves[i].to) return { ok: false };
      return { ok: true, state: { solved: moves.length === 2 } };
    },
    isSolved: (state) => state.solved,
  };
  const service = createGameService({ repository: repo, levels, rules, journey: Journey, storyReplay, clock: () => now,
    id: () => `player-${String(++sequence).padStart(8, '0')}`, appId: 'wx-test' });
  const context = (user) => ({ openid: user, appid: 'wx-test' });
  const call = (action, payload = {}, user = 'alice') => service.handle({ action, payload }, context(user));
  const bootstrap = (user = 'alice') => call('bootstrap', { consentVersion: CONSENT_VERSION }, user);
  const start = async (requestId = 'request-one', levelId = 1, user = 'alice') => {
    const result = await call('startRun', { levelId, requestId }, user); assert.equal(result.ok, true, JSON.stringify(result)); return result.data;
  };
  const finish = (run, user = 'alice', extra = {}) => call('finishRun', { runId: run.runId, moves: solvedMoves, ...extra }, user);
  return { repo, levels, service, call, bootstrap, start, finish, context, setTime: (value) => { now = value; }, advance: (delta) => { now += delta; }, time: () => now, replayCalls: () => replayCalls };
}
function error(result, code) { assert.equal(result.ok, false); assert.equal(result.error.code, code); }

// 事务仓库使用串行提交与回滚；每项检查从接口输入验证外部行为。
test('可信身份来自调用上下文，伪造身份与未同意隐私的请求不能创建用户', async () => {
  const s = setup();
  error(await s.service.handle({ action: 'bootstrap', payload: { consentVersion: CONSENT_VERSION, openid: 'alice' } }, {}), 'NOT_AUTHENTICATED');
  error(await s.service.handle({ action: 'bootstrap', payload: { consentVersion: CONSENT_VERSION } }, { openid: 'alice', appid: 'wrong-app' }), 'NOT_AUTHENTICATED');
  error(await s.call('bootstrap', {}), 'CONSENT_REQUIRED');
  error(await s.call('startRun', { levelId: 1, requestId: 'request-one' }), 'PROFILE_REQUIRED');
  assert.equal(s.repo.all('players').length, 0);
});
test('重复建立档案不改变公开身份，并且不向客户端暴露openid', async () => {
  const s = setup(), a = await s.bootstrap(), b = await s.bootstrap(), c = await s.bootstrap('bob');
  assert.deepEqual(a.data.publicProfile, b.data.publicProfile);
  assert.notEqual(a.data.publicProfile.id, c.data.publicProfile.id);
  assert.equal(a.data.unlockedLevel, 1);
  assert.equal(JSON.stringify(a).includes('alice'), false);
  assert.equal(JSON.stringify(a).includes('openid'), false);
  assert.equal(s.repo.all('players').length, 2);
});
test('全部十关开放，推荐进度不会阻止直接挑战后面的关卡', async () => {
  const s = setup(); await s.bootstrap();
  const run = await s.start('request-level-ten', 10);
  assert.equal(run.levelId, 10);
  error(await s.call('startRun', { levelId: 11, requestId: 'request-eleven' }), 'LEVEL_NOT_FOUND');
  error(await s.call('startRun', { levelId: '1', requestId: 'request-string' }), 'INVALID_ARGUMENT');
});
test('并发的同一个开始请求只创建一个会话，不重复起表', async () => {
  const s = setup(); await s.bootstrap();
  const results = await Promise.all(Array.from({ length: 12 }, () => s.start('same-request')));
  assert.equal(new Set(results.map((run) => run.runId)).size, 1);
  assert.equal(s.repo.all('runs').length, 1);
  s.advance(5000);
  const retried = await s.start('same-request');
  assert.equal(retried.startedAt, results[0].startedAt);
  assert.equal(retried.serverNow, s.time());
  error(await s.call('startRun', { levelId: 2, requestId: 'same-request' }), 'REQUEST_CONFLICT');
});
test('新的挑战放弃旧活跃会话；重复旧request不会恢复旧局', async () => {
  const s = setup(); await s.bootstrap();const first = await s.start();
  s.advance(1000); const second = await s.start('request-two');
  assert.notEqual(first.runId, second.runId);
  assert.equal(s.repo.all('runs').filter((run) => run.status === 'active').length, 1);
  error(await s.finish(first), 'RUN_NOT_ACTIVE');
  const retry = await s.start('request-one'); assert.equal(retry.status, 'abandoned');
  const state = await s.bootstrap(); assert.equal(state.data.activeRun.runId, second.runId);
});
test('恢复挑战校验所有权、版本和24小时有效期', async () => {
  const s = setup(); await s.bootstrap();await s.bootstrap('bob');const run = await s.start();
  s.advance(3000);
  const resumed = await s.call('resumeRun', { runId: run.runId });assert.equal(resumed.data.startedAt, run.startedAt);
  error(await s.call('resumeRun', { runId: run.runId }, 'bob'), 'RUN_FORBIDDEN');
  s.levels.legacyLevels[0].version = 0;
  error(await s.call('resumeRun', { runId: run.runId }), 'LEVEL_CHANGED');
  s.levels.legacyLevels[0].version = 3;s.advance(RUN_TTL_MS);
  error(await s.call('resumeRun', { runId: run.runId }), 'RUN_EXPIRED');
  assert.equal((await s.bootstrap()).data.activeRun, null);
});
test('空日志、超长日志、非法移动和未完成局面都不记成绩', async () => {
  const s = setup(); await s.bootstrap();const run = await s.start();s.advance(6000);
  for (const moves of [[], Array(MAX_MOVES + 1).fill({ from: 0, to: 1 }), [{ from: .5, to: 1 }], [{ from: 3, to: 999 }]]) {
    error(await s.call('finishRun', { runId: run.runId, moves }), 'INVALID_MOVES');
  }
  error(await s.call('finishRun', { runId: run.runId, moves: [solvedMoves[0]] }), 'UNSOLVED_RUN');
  assert.equal(s.repo.all('bestScores').length, 0);
  assert.equal(s.repo.all('runs')[0].status, 'active');
});
test('耗时由服务端墙钟计算，客户端伪造时间、身份和成功标记均无效', async () => {
  const s = setup(); await s.bootstrap();const run = await s.start();s.advance(7350);
  const result = await s.finish(run, 'alice', { elapsedMs: 1, durationMs: 1, success: true, openid: 'bob' });
  assert.equal(result.ok, true);assert.equal(result.data.durationMs, 7350);
  assert.equal(result.data.bestMs, 7350);assert.equal(result.data.rank, 1);assert.equal(result.data.unlockedLevel, 2);
});
test('其他用户不能代提交会话；未经历正向时间的挑战被拒', async () => {
  const s = setup();await s.bootstrap();await s.bootstrap('bob');const run = await s.start();
  error(await s.finish(run, 'bob'), 'RUN_FORBIDDEN');
  error(await s.finish(run), 'INVALID_DURATION');
  assert.equal(s.repo.all('bestScores').length, 0);
});
test('并发和后续重复结算幂等，原始耗时不随重试改变', async () => {
  const s = setup();await s.bootstrap();const run = await s.start();s.advance(6000);
  const results = await Promise.all([s.finish(run), s.finish(run), s.finish(run)]);
  assert.ok(results.every((item) => item.ok));assert.equal(s.repo.all('bestScores').length, 1);
  assert.equal(s.repo.all('runs')[0].moveCount, 2);
  s.advance(9000);const before = s.replayCalls(), retry = await s.finish(run);
  assert.equal(retry.data.durationMs, 6000);assert.equal(s.replayCalls(), before);
  assert.equal(retry.data.isPersonalBest, true);
});
test('同一玩家每关仅保存最好成绩，较慢或同耗时不覆盖达成时间', async () => {
  const s = setup();await s.bootstrap();let run = await s.start();s.advance(5000);await s.finish(run);
  const first = s.repo.all('bestScores')[0];
  for (const [request, duration] of [['second-run', 8000], ['same-time', 5000]]) {
    run = await s.start(request);s.advance(duration);const result = await s.finish(run);
    assert.equal(result.data.isPersonalBest, false);assert.equal(result.data.bestMs, 5000);
    assert.equal(s.repo.all('bestScores')[0].achievedAt, first.achievedAt);
  }
  run = await s.start('faster-run');s.advance(3000);const improved = await s.finish(run);
  assert.equal(improved.data.isPersonalBest, true);assert.equal(improved.data.bestMs, 3000);
  assert.equal(s.repo.all('bestScores').length, 1);
});
test('排行榜只返回前十个不同玩家并按耗时稳定排序', async () => {
  const s = setup();
  for (let i = 0; i < 12; i++) {
    const user = `user-${i}`;await s.bootstrap(user);const run = await s.start('rank-request', 1, user);s.advance(12000 - i * 500);await s.finish(run, user);
  }
  const result = await s.call('leaderboard', { levelId: 1 }, 'user-0');
  assert.equal(result.data.entries.length, 10);assert.equal(new Set(result.data.entries.map((item) => item.id)).size, 10);
  assert.equal(result.data.ownBest.rank, 12);
  assert.deepEqual(result.data.entries.map((item) => item.durationMs), [6500,7000,7500,8000,8500,9000,9500,10000,10500,11000]);
  for (const entry of result.data.entries) {assert.equal('owner' in entry, false);assert.equal('openid' in entry, false);assert.equal('runId' in entry, false);}
});
test('相同毫秒与达成时间使用公开ID稳定排序', async () => {
  const s = setup();await s.bootstrap();await s.bootstrap('bob');
  const a = await s.start('tie-request', 1, 'alice'),b = await s.start('tie-request', 1, 'bob');s.advance(4000);
  await Promise.all([s.finish(a),s.finish(b,'bob')]);
  const result = await s.call('leaderboard', { levelId: 1 });
  assert.ok(result.data.entries[0].id < result.data.entries[1].id);
});
test('预置资料更新请求作为不支持的操作拒绝，不修改匿名档案', async () => {
  const s = setup();await s.bootstrap();
  const before = s.repo.all('players');
  error(await s.call('updateProfile', { avatarId: 'leaf', nicknameId: 'forest' }), 'INVALID_ACTION');
  assert.deepEqual(s.repo.all('players'), before);
});
test('未声明版本的旧客户端与显式 v4 客户端能并行开局、续玩和独立排名', async () => {
  const s=setup();await s.bootstrap();
  const old=await s.start('classic-round',10);assert.equal(old.levelVersion,3);
  s.advance(1000);
  const current=await s.call('startRun',{levelId:12,levelVersion:4,requestId:'atelier-round'});
  assert.equal(current.data.levelVersion,4);
  error(await s.call('startRun',{levelId:10,levelVersion:4,requestId:'classic-round'}),'REQUEST_CONFLICT');
  error(await s.call('startRun',{levelId:1,levelVersion:5,requestId:'future-round'}),'LEVEL_CHANGED');
  assert.equal((await s.call('resumeRun',{runId:old.runId})).data.levelVersion,3);
  assert.equal((await s.call('resumeRun',{runId:current.data.runId})).data.levelVersion,4);
  s.advance(3000);
  assert.equal((await s.finish(current.data)).data.unlockedLevel,12);
  assert.equal((await s.finish(old)).data.unlockedLevel,10);
  const v4=await s.call('bootstrap',{levelVersion:4,consentVersion:CONSENT_VERSION});
  assert.deepEqual(v4.data.bestScores.map(row=>row.levelVersion),[4]);
  assert.deepEqual(v4.data.legacyBestScores.map(row=>row.levelVersion),[3]);
  assert.deepEqual((await s.bootstrap()).data.bestScores.map(row=>row.levelVersion),[3]);
  assert.equal((await s.call('leaderboard',{levelId:10,levelVersion:4})).data.entries.length,0);
  assert.equal((await s.call('leaderboard',{levelId:10})).data.entries.length,1);
  await s.call('deleteAccount',{confirm:true});assert.equal(s.repo.all('bestScores').length,0);
});
test('结算事务中断时全部回滚，重试不会留下半条榜单', async () => {
  const s = setup();await s.bootstrap();const run = await s.start();s.advance(4000);s.repo.failPut = 'runs';
  const failed = await s.finish(run);error(failed, 'SERVICE_UNAVAILABLE');assert.equal(failed.error.retryable, true);
  assert.equal(s.repo.all('bestScores').length, 0);assert.equal(s.repo.all('runs')[0].status, 'active');
  assert.equal((await s.finish(run)).ok, true);
});
test('删除须确认，失败后可重试，删除中禁止新写入且只清理自己', async () => {
  const s = setup();await s.bootstrap();await s.bootstrap('bob');
  const a = await s.start('delete-request', 1, 'alice'),b = await s.start('delete-request', 1, 'bob');s.advance(5000);
  await s.finish(a);await s.finish(b,'bob');
  error(await s.call('deleteAccount', {}), 'CONFIRM_REQUIRED');s.repo.failCleanup = true;
  error(await s.call('deleteAccount', { confirm: true }), 'SERVICE_UNAVAILABLE');
  error(await s.bootstrap(), 'ACCOUNT_DELETING');
  error(await s.call('startRun', { levelId: 1, requestId: 'during-deletion' }), 'ACCOUNT_DELETING');
  assert.equal((await s.call('leaderboard', { levelId: 1 }, 'bob')).data.entries.length, 1);
  const deleted = await s.call('deleteAccount', { confirm: true });assert.equal(deleted.data.deleted, true);
  assert.equal(s.repo.all('players').length, 1);assert.equal(s.repo.all('runs').length, 1);assert.equal(s.repo.all('bestScores').length, 1);
  assert.equal((await s.call('deleteAccount', { confirm: true })).ok, true);
});
test('并发删除的迟到清理不会删除同一微信身份重新创建的档案和成绩', async () => {
  const s = setup();
  const original = await s.bootstrap();
  const removeOwned = s.repo.removeOwned;
  let cleanupCount = 0, secondEntered, releaseSecond;
  const secondReady = new Promise((resolve) => { secondEntered = resolve; });
  const secondGate = new Promise((resolve) => { releaseSecond = resolve; });
  s.repo.removeOwned = async (...args) => {
    if (args[0] === 'runs') {
      cleanupCount++;
      if (cleanupCount === 1) await secondReady;
      else if (cleanupCount === 2) { secondEntered(); await secondGate; }
    }
    return removeOwned(...args);
  };
  const firstDelete = s.call('deleteAccount', { confirm: true });
  const secondDelete = s.call('deleteAccount', { confirm: true });
  assert.equal((await firstDelete).ok, true);
  const recreated = await s.bootstrap();
  assert.notEqual(recreated.data.publicProfile.id, original.data.publicProfile.id);
  const run = await s.start('new-account-run'); s.advance(5000);
  assert.equal((await s.finish(run)).ok, true);
  releaseSecond();
  assert.equal((await secondDelete).ok, true);
  assert.equal(s.repo.all('players').length, 1);
  assert.equal(s.repo.all('runs').length, 1);
  assert.equal(s.repo.all('bestScores').length, 1);
  const retained = await s.bootstrap();
  assert.deepEqual(retained.data.publicProfile, recreated.data.publicProfile);
  assert.equal(retained.data.bestScores[0].durationMs, 5000);
});
test('云仓库批量清理仅匹配原档案，文档ID被新档案复用也不会被误删', async () => {
  const records = new Map([
    ['reused-score', { owner: 'alice', playerId: 'old-profile' }],
    ['old-score', { owner: 'alice', playerId: 'old-profile' }],
    ['other-score', { owner: 'bob', playerId: 'other-profile' }],
  ]);
  let requests = 0;
  const db = { collection: () => ({ where: (filter) => ({
    async remove() {
      requests++;
      for (const [key, value] of records) {
        if (Object.entries(filter).every(([field, expected]) => value[field] === expected)) {
          records.delete(key);
          if (key === 'reused-score') records.set(key, { owner: 'alice', playerId: 'new-profile' });
          return { stats: { removed: 1 } };
        }
      }
      return { stats: { removed: 0 } };
    },
  }) }) };
  await createRepository(db).removeOwned('bestScores', 'alice', 'old-profile');
  assert.equal(requests, 3);
  assert.deepEqual([...records.keys()].sort(), ['other-score', 'reused-score']);
  assert.equal(records.get('reused-score').playerId, 'new-profile');
});
test('原型键、不支持的action及错误参数只返回稳定公共错误', async () => {
  const s = setup();
  for (const action of ['constructor','__proto__','admin']) error(await s.call(action), 'INVALID_ACTION');
  error(await s.call('bootstrap', []), 'INVALID_ARGUMENT');
  error(await s.call('bootstrap', null), 'INVALID_ARGUMENT');
});

test('正式十二关解法通过真实共享规则进入服务端结算，逐关仅保留本人最佳', async () => {
  const realLevels = require('../shared/levels');
  const realRules = require('../shared/rules');
  const solutions = require('./fixtures/level-solutions.json');
  assert.equal(realLevels.levels.length, 12);assert.equal(solutions.length, 12);
  const repo = memoryRepository();let now = 2000000;
  const service = createGameService({ repository: repo, levels: realLevels, rules: realRules,
    clock: () => now, id: () => 'production-rules-player', appId: 'wx-real-rules' });
  const call = (action, payload) => service.handle({ action, payload }, { openid: 'trusted-real-rules-user', appid: 'wx-real-rules' });
  assert.equal((await call('bootstrap', { consentVersion: CONSENT_VERSION, levelVersion: 4 })).ok, true);
  for (const solution of solutions) {
    const level = realLevels.getLevel(solution.levelId);assert.equal(level.version, solution.version);
    const started = await call('startRun', { levelId: level.id, levelVersion: 4, requestId: `actual-level-${level.id}` });
    assert.equal(started.ok, true, JSON.stringify(started));
    const duration = 10000 + solution.moves.length * 500;now += duration;
    const completed = await call('finishRun', { runId: started.data.runId, moves: solution.moves });
    assert.equal(completed.ok, true, `第${level.id}关: ${JSON.stringify(completed)}`);
    assert.equal(completed.data.durationMs, duration);assert.equal(completed.data.rank, 1);
    const ranking = await call('leaderboard', { levelId: level.id, levelVersion: 4 });
    assert.equal(ranking.data.entries.length, 1);assert.equal(ranking.data.entries[0].durationMs, duration);
  }
  const state = await call('bootstrap', { consentVersion: CONSENT_VERSION, levelVersion: 4 });
  assert.equal(state.data.bestScores.length, 12);assert.equal(state.data.activeRun, null);assert.equal(state.data.unlockedLevel, 12);
  assert.equal(repo.all('bestScores').length, 12);
});

test('正式关卡校验拒绝伪造终局与缺少最后一步的动作日志', async () => {
  const realLevels = require('../shared/levels'), realRules = require('../shared/rules');
  const solution = require('./fixtures/level-solutions.json').find((item) => item.levelId === 1);
  const repo = memoryRepository();let now = 3000000;
  const service = createGameService({ repository: repo, levels: realLevels, rules: realRules,
    clock: () => now, id: () => 'real-check-player', appId: 'wx-real-rules' });
  const call = (action, payload) => service.handle({ action, payload }, { openid: 'trusted-rule-check', appid: 'wx-real-rules' });
  await call('bootstrap', { consentVersion: CONSENT_VERSION, levelVersion: 4 });
  const started = await call('startRun', { levelId: 1, levelVersion: 4, requestId: 'invalid-actual-level' });now += 10000;
  const incomplete = await call('finishRun', { runId: started.data.runId, moves: solution.moves.slice(0, -1), success: true, state: { solved: true, completed: [0, 1], board: Array(16).fill(-1) } });
  error(incomplete, 'UNSOLVED_RUN');
  const illegal = await call('finishRun', { runId: started.data.runId, moves: [{ from: 0, to: 999 }], durationMs: 1 });
  error(illegal, 'INVALID_MOVES');
  assert.equal(repo.all('bestScores').length, 0);assert.equal(repo.all('runs')[0].status, 'active');
});

test('同一第八关两册真实棋面各自重放，旧局结算重试不会引用新版名次', async () => {
  const levels=require('../shared/levels'),rules=require('../shared/rules');
  const oldMoves=require('./fixtures/level-solutions-v3.json').find(s=>s.levelId===8).moves;
  const newMoves=require('./fixtures/level-solutions.json').find(s=>s.levelId===8).moves;
  const repo=memoryRepository();let now=500000;
  const service=createGameService({repository:repo,levels,rules,clock:()=>now,id:()=>'dual-player',appId:'wx-dual'});
  const call=(action,payload)=>service.handle({action,payload},{openid:'single-player',appid:'wx-dual'});
  await call('bootstrap',{consentVersion:CONSENT_VERSION,levelVersion:4});
  const old=await call('startRun',{levelId:8,requestId:'legacy-eight'});now+=1000;
  const current=await call('startRun',{levelId:8,levelVersion:4,requestId:'atelier-eight'});now+=10000;
  const invalid=await call('finishRun',{runId:current.data.runId,moves:oldMoves});
  assert.equal(invalid.ok,false);
  const classic=await call('finishRun',{runId:old.data.runId,moves:oldMoves});assert.equal(classic.ok,true,JSON.stringify(classic));
  now+=5000;
  const atelier=await call('finishRun',{runId:current.data.runId,moves:newMoves});assert.equal(atelier.ok,true,JSON.stringify(atelier));
  assert.deepEqual((await call('leaderboard',{levelId:8})).data.entries.map(e=>e.durationMs),[11000]);
  assert.deepEqual((await call('leaderboard',{levelId:8,levelVersion:4})).data.entries.map(e=>e.durationMs),[15000]);
  assert.deepEqual((await call('finishRun',{runId:old.data.runId,moves:oldMoves})).data,classic.data);
});

function storyProof(index, version=3, tools=false) {
  const level=Journey.buildLevel(Journey.storySession(index,version));
  let state=Rules.createState(level);
  const moves=[],toolHistory=[];
  if(tools && state.hidden.length){
    const result=Rules.applyBreeze(state);
    assert.equal(result.ok,true);
    toolHistory.push({id:'breeze',at:0});
    state=result.state;
  }
  if(tools)toolHistory.push({id:'snap',at:0});
  while(!Rules.isSolved(state) && moves.length<120){
    const move=Rules.findHint(state);
    assert.ok(move);
    moves.push(move);
    state=Rules.applyMove(state,move.from,move.to).state;
  }
  assert.equal(Rules.isSolved(state),true);
  return {level:index,sessionVersion:version,moves,toolHistory};
}
async function storyAccount(s,user) {
  const result=await s.call('storyBootstrap',{consentVersion:CONSENT_VERSION},user);
  assert.equal(result.ok,true);
  assert.equal(result.data.rankingVersion,1);
  return result.data.publicProfile.id;
}

test('主线只能按云端已验证的前缀接续，离线重传和跨设备重复提交均幂等',async()=>{
  const s=setup(),first=storyProof(1),second=storyProof(2,3,true);
  error(await s.call('storyBootstrap',{}),'CONSENT_REQUIRED');
  error(await s.call('storyLeaderboard'),'PROFILE_REQUIRED');
  const playerId=await storyAccount(s,'alice');
  const submit=proof=>s.call('submitStoryClear',{playerId,...proof},'alice');
  assert.deepEqual((await s.call('storyLeaderboard')).data,{rankingVersion:1,entries:[],own:null});
  error(await submit(second),'PREVIOUS_REQUIRED');
  error(await submit({...first,moves:[] ,finished:true}),'UNSOLVED_RUN');
  error(await submit({...first,moves:[{from:0,to:16}]}),'INVALID_MOVES');
  error(await submit({...first,toolHistory:[{id:'snap',at:0},{id:'snap',at:0}]}),'INVALID_MOVES');
  error(await submit({...first,playerId:'wrong-profile'}),'PROFILE_CHANGED');
  error(await submit({...first,sessionVersion:999}),'INVALID_ARGUMENT');
  const race=await Promise.all([submit(first),submit(first)]);
  assert.ok(race.every(r=>r.ok && r.data.highestLevel===1));
  s.advance(37);
  s.repo.failPut='players';
  error(await submit(second),'SERVICE_UNAVAILABLE');
  assert.deepEqual((await s.call('storyLeaderboard')).data.own,{level:1,rank:1,achievedAt:100000});
  assert.equal((await submit({...second,score:98765,durationMs:-8,achievedAt:1})).data.highestLevel,2);
  assert.equal((await submit(first)).data.highestLevel,2);
  assert.deepEqual((await s.call('storyLeaderboard')).data.own,{level:2,rank:1,achievedAt:100037});
  assert.equal(s.repo.all('bestScores').length,1);
  assert.equal((await s.call('bootstrap',{consentVersion:CONSENT_VERSION})).data.bestScores.length,0);
});

test('主线总榜前十去重，最高关优先，同关按服务器达成时间和公开身份稳定排序',async()=>{
  const s=setup(),first=storyProof(1),second=storyProof(2),users=[];
  for(let i=0;i<13;i++){
    const user='u'+i,playerId=await storyAccount(s,user);
    users.push({user,playerId});
    s.advance(1);
    assert.ok((await s.call('submitStoryClear',{...first,playerId},user)).ok);
  }
  s.advance(100);
  for(const {user,playerId} of [users[10],users[9],users[12]]){
    assert.ok((await s.call('submitStoryClear',{...second,playerId},user)).ok);
  }
  const a=(await s.call('storyLeaderboard',{},'u11')).data;
  assert.equal(a.entries.length,10);assert.equal(new Set(a.entries.map(e=>e.id)).size,10);
  assert.deepEqual(a.entries.slice(0,3).map(e=>e.id),[9,10,12].map(i=>users[i].playerId));
  assert.equal(a.own.rank,13);assert.ok(a.entries.every(e=>!e.isSelf && !('owner' in e)));
  const leader=(await s.call('storyLeaderboard',{},'u9')).data;
  assert.ok(leader.entries[0].isSelf);assert.equal(leader.own.rank,1);
  assert.ok((await s.call('deleteAccount',{confirm:true},'u9')).ok);
  const reopened=await storyAccount(s,'u9');
  assert.notEqual(reopened,users[9].playerId);
  error(await s.call('submitStoryClear',{...first,playerId:users[9].playerId},'u9'),'PROFILE_CHANGED');
  assert.deepEqual((await s.call('storyLeaderboard',{},'u9')).data.own,null);
  assert.equal((await s.call('storyLeaderboard',{},'u11')).data.own.rank,12);
});

test('新编排前百关及后续关全部从可信种子重放，本地雾片工具与旧在局日志均可验证',async()=>{
  const s=setup(),playerId=await storyAccount(s,'long-run');
  const classic=storyProof(1,1);
  assert.equal((await s.call('submitStoryClear',{...classic,playerId},'long-run')).data.highestLevel,1);
  let sawBreeze=false;
  for(let i=2;i<=101;i++){
    const proof=storyProof(i,3,!sawBreeze);
    if(proof.toolHistory.some(t=>t.id==='breeze'))sawBreeze=true;
    const result=await s.call('submitStoryClear',{...proof,playerId},'long-run');
    assert.ok(result.ok,JSON.stringify({i,result}));
    assert.equal(result.data.highestLevel,i);
  }
  assert.ok(sawBreeze);
  assert.equal((await s.call('storyLeaderboard',{},'long-run')).data.entries[0].level,101);
  assert.equal(s.repo.all('bestScores').length,1);
});
