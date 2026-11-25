'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWechatProfileVerifier, avatarUrl, PROFILE_REVIEW_TTL_MS } = require('../cloudfunctions/gameApi/wechat-profile');
const { createGameService } = require('../cloudfunctions/gameApi/service');
const { CONSENT_VERSION } = require('../cloudfunctions/gameApi/shared/profile-options');

const NOW = Date.UTC(2026, 10, 14, 4);
const trusted = { openid: 'trusted-wechat-user', appid: 'wx-profile-test' };
const avatar = 'https://thirdwx.qlogo.cn/mmopen/test-avatar/132';
const pass = () => ({ errCode: 0, result: { suggest: 'pass' } });
const openProfile = () => ({ openId: trusted.openid, nickName: '小林🌻', avatarUrl: avatar,
  watermark: { appid: trusted.appid, timestamp: Math.floor(NOW / 1000) }, gender: 1, city: '不应保存的地区' });

function verifierFixture(data = openProfile()) {
  const calls = [];
  const cloud = {
    getOpenData: async args => { calls.push(['open', args]);return { list: [{ cloudID: args.list[0], data }] }; },
    openapi: { wxa: { game: { contentSpam: {
      msgSecCheck: async args => { calls.push(['text', args]);return pass(); },
      mediaCheckSync: async args => { calls.push(['image', args]);return pass(); },
    } } } },
  };
  return { cloud, calls, verify: createWechatProfileVerifier(cloud) };
}
function serviceFixture(verifyWechatProfile) {
  const data = { players: new Map(), runs: new Map(), bestScores: new Map() };
  const copy = value => value ? structuredClone(value) : null;
  let sequence = 0;
  const repo = {
    async get(c, id) { return copy(data[c].get(id)); },
    async put(c, id, value) { data[c].set(id, copy(value)); },
    async remove(c, id) { data[c].delete(id); },
    async transaction(work) { return work(repo); },
    async listBest(owner) { return [...data.bestScores.values()].filter(row => row.owner === owner); },
    async topScores() { return [...data.bestScores.values()]; },
    async rankOf() { return 1; },
    async removeOwned(c, owner, playerId) { for (const [key, row] of data[c]) if (row.owner === owner && row.playerId === playerId) data[c].delete(key); },
  };
  const level = { id: 1, version: 3 };
  const service = createGameService({ repository: repo, levels: { legacyLevels:[level], levels:[{...level,version:4}], getLevel: () => level },
    rules: {}, verifyWechatProfile, clock: () => NOW, id: () => 'profile-' + (++sequence), appId: trusted.appid });
  const call = (action, payload = {}) => service.handle({ action, payload }, trusted);
  return { data, call, bootstrap: () => call('bootstrap', { consentVersion: CONSENT_VERSION }) };
}

test('只从CloudID获得微信资料，验证身份后用小游戏专用同步接口检查昵称头像', async () => {
  const f = verifierFixture();const result = await f.verify('verified-cloud-id', trusted, {}, NOW);
  assert.deepEqual(result, { ok: true, data: { nickname: '小林🌻', avatarUrl: avatar, wechatCheckedAt: NOW } });
  assert.deepEqual(f.calls[0], ['open', { list: ['verified-cloud-id'] }]);
  assert.deepEqual(f.calls.find(([name]) => name === 'text')[1], { openid: trusted.openid, version: 2, scene: 1, content: '小林🌻' });
  assert.deepEqual(f.calls.find(([name]) => name === 'image')[1], { openid: trusted.openid, version: 2, scene: 1, media_type: 2, media_url: avatar });
  assert.equal(JSON.stringify(result).includes('不应保存'), false);assert.equal('openId' in result.data, false);
});

test('其他用户、其他AppID、过期或未来凭证及不安全资料不会进入内容审核和存储', async () => {
  const invalid = [
    { ...openProfile(), openId: 'another-user' },
    { ...openProfile(), watermark: { appid: 'other-app', timestamp: NOW / 1000 } },
    { ...openProfile(), watermark: { appid: trusted.appid, timestamp: NOW / 1000 - 301 } },
    { ...openProfile(), watermark: { appid: trusted.appid, timestamp: NOW / 1000 + 61 } },
    { ...openProfile(), nickName: '不合法\n昵称' },
    { ...openProfile(), avatarUrl: 'https://example.com/avatar.png' },
  ];
  for (const data of invalid) {
    const f = verifierFixture(data), result = await f.verify('cloud-id', trusted, {}, NOW);
    assert.equal(result.ok, false);assert.deepEqual(f.calls.map(([name]) => name), ['open']);
  }
});

test('微信头像域名精确匹配且使用HTTPS，拒绝伪子域、凭据、端口和任意路径', () => {
  assert.equal(avatarUrl('http://wx.qlogo.cn/mmopen/sample/132'), 'https://wx.qlogo.cn/mmopen/sample/132');
  assert.equal(avatarUrl(''), '');
  for (const value of ['https://wx.qlogo.cn.evil.test/mmopen/x', 'https://user@wx.qlogo.cn/mmopen/x',
    'https://wx.qlogo.cn:8443/mmopen/x', 'https://wx.qlogo.cn/redirect?url=https://example.com',
    'https://wx.qlogo.cn/mmopen/x#fragment', 'data:image/png;base64,AAAA']) assert.equal(avatarUrl(value), null);
});

test('无头像的微信用户仍可同步真实昵称，不伪造头像或创建远程副本', async () => {
  const f = verifierFixture({ ...openProfile(), avatarUrl: '' });
  const result = await f.verify('cloud-id', trusted, {}, NOW);
  assert.equal(result.ok, true);assert.equal(result.data.avatarUrl, '');assert.deepEqual(f.calls.map(([name]) => name), ['open', 'text']);
});

test('资料审核拦截、未开通或返回不完整时均不发布新资料', async () => {
  for (const method of ['msgSecCheck', 'mediaCheckSync']) {
    const f = verifierFixture();f.cloud.openapi.wxa.game.contentSpam[method] = async () => ({ errCode: 0, result: { suggest: 'risky' } });
    assert.equal((await f.verify('cloud-id', trusted, {}, NOW)).error.code, 'PROFILE_NOT_APPROVED');
  }
  const unavailable = verifierFixture();unavailable.cloud.openapi.wxa.game.contentSpam.msgSecCheck = async () => { throw { errCode: 750031 }; };
  const result = await unavailable.verify('cloud-id', trusted, {}, NOW);assert.equal(result.error.code, 'PROFILE_REVIEW_UNAVAILABLE');assert.equal(result.error.retryable, true);
  const missing = verifierFixture();missing.cloud.openapi.wxa.game.contentSpam.msgSecCheck = async () => ({ errCode: 0 });
  assert.equal((await missing.verify('cloud-id', trusted, {}, NOW)).ok, false);
});

test('相同资料二十四小时内复用审核结果但仍验证CloudID，资料变化或到期重新审核', async () => {
  const previous = { profileSource: 'wechat', nickname: '小林🌻', avatarUrl: avatar, wechatCheckedAt: NOW - 1000 };
  const cached = verifierFixture();assert.equal((await cached.verify('cloud-id', trusted, previous, NOW)).ok, true);
  assert.deepEqual(cached.calls.map(([name]) => name), ['open']);
  const changed = verifierFixture({ ...openProfile(), nickName: '新的微信昵称' });await changed.verify('cloud-id', trusted, previous, NOW);
  assert.equal(changed.calls.length, 3);
  const expired = verifierFixture();await expired.verify('cloud-id', trusted, { ...previous, wechatCheckedAt: NOW - PROFILE_REVIEW_TTL_MS }, NOW);
  assert.equal(expired.calls.length, 3);
});

test('客户端伪造的姓名头像被忽略，只保存经CloudID验证与审核的公开字段', async () => {
  const f = verifierFixture(), s = serviceFixture(f.verify);await s.bootstrap();
  assert.equal((await s.call('syncWechatProfile', { nickname: '伪造', avatarUrl: avatar })).ok, false);
  const result = await s.call('syncWechatProfile', { cloudID: 'cloud-id', nickname: '伪造', avatarUrl: 'https://evil.test/x', openid: 'other-user' });
  assert.equal(result.ok, true);assert.equal(result.data.publicProfile.nickname, '小林🌻');assert.equal(result.data.publicProfile.profileSource, 'wechat');assert.equal(result.data.publicProfile.avatarUrl, avatar);
  const player = [...s.data.players.values()][0];
  assert.equal(player.nickname, '小林🌻');assert.equal('cloudID' in player, false);assert.equal('openId' in player, false);assert.equal('gender' in player, false);assert.equal('city' in player, false);
  assert.equal(JSON.stringify(result).includes(trusted.openid), false);
});

test('排行榜读取已验证微信资料，删号后头像昵称与本人记录一起清除', async () => {
  const f = verifierFixture(), s = serviceFixture(f.verify);await s.bootstrap();await s.call('syncWechatProfile', { cloudID: 'cloud-id' });
  const player = [...s.data.players.values()][0];s.data.bestScores.set('score', { owner: player.owner, playerId: player.playerId, levelId: 1, levelVersion: 3, durationMs: 5000, achievedAt: NOW });
  const board = await s.call('leaderboard', { levelId: 1 });assert.equal(board.data.entries[0].nickname, '小林🌻');assert.equal(board.data.entries[0].avatarUrl, avatar);
  assert.equal((await s.call('deleteAccount', { confirm: true })).ok, true);assert.equal(s.data.players.size, 0);assert.equal(s.data.bestScores.size, 0);
});

test('微信头像昵称重新验证同步后，已有排行榜立即展示新资料且成绩保持不变', async () => {
  const data = openProfile(), f = verifierFixture(data), s = serviceFixture(f.verify);await s.bootstrap();
  assert.equal((await s.call('syncWechatProfile', { cloudID: 'first-profile' })).ok, true);
  const player = [...s.data.players.values()][0];
  const score = { owner: player.owner, playerId: player.playerId, levelId: 1, levelVersion: 3, durationMs: 5000, achievedAt: NOW };
  s.data.bestScores.set('score', structuredClone(score));
  const before = await s.call('leaderboard', { levelId: 1 });assert.equal(before.data.entries[0].nickname, '小林🌻');
  data.nickName = '新的微信昵称';data.avatarUrl = 'https://thirdwx.qlogo.cn/mmopen/new-avatar/132';
  assert.equal((await s.call('syncWechatProfile', { cloudID: 'updated-profile' })).ok, true);
  const after = await s.call('leaderboard', { levelId: 1 }), entry = after.data.entries[0];
  assert.equal(entry.id, player.playerId);assert.equal(entry.nickname, data.nickName);assert.equal(entry.avatarUrl, data.avatarUrl);assert.equal(entry.profileSource, 'wechat');
  assert.equal(entry.durationMs, score.durationMs);assert.equal(entry.achievedAt, score.achievedAt);assert.equal(entry.rank, before.data.entries[0].rank);
  assert.deepEqual(s.data.bestScores.get('score'), score);
});

test('审核中的旧资料请求不能写入删除后重建的账号', async () => {
  let finish;const pending = new Promise(resolve => { finish = resolve; });
  const s = serviceFixture(() => pending);await s.bootstrap();
  const syncing = s.call('syncWechatProfile', { cloudID: 'cloud-id' });await new Promise(setImmediate);
  await s.call('deleteAccount', { confirm: true });await s.bootstrap();
  finish({ ok: true, data: { nickname: '旧微信资料', avatarUrl: avatar, wechatCheckedAt: NOW } });
  const result = await syncing;assert.equal(result.ok, false);assert.equal(result.error.code, 'PROFILE_REQUIRED');
  const player = [...s.data.players.values()][0];assert.equal(player.profileSource, 'guest');assert.equal(player.avatarUrl, '');
});

test('三个校验阶段的异常日志只包含阶段、错误码和请求ID白名单', async () => {
  for (const stage of ['openData', 'nickname', 'avatar']) {
    const f = verifierFixture(), entries = [];
    const failure = { errCode: -604101, requestId: 'request-123', trace_id: 'trace-456',
      cloudID: 'private-cloud-id', nickName: '私密昵称', avatarUrl: avatar,
      event: { cloudID: 'private-cloud-id' }, context: trusted,
      errMsg: '不能记录的完整原始错误 private-cloud-id 私密昵称 ' + avatar };
    const reject = async () => { throw failure; };
    if (stage === 'openData') f.cloud.getOpenData = reject;
    else f.cloud.openapi.wxa.game.contentSpam[stage === 'nickname' ? 'msgSecCheck' : 'mediaCheckSync'] = reject;
    const result = await createWechatProfileVerifier(f.cloud, entry => entries.push(entry))('private-cloud-id', trusted, {}, NOW);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, stage === 'openData' ? 'WECHAT_PROFILE_UNAVAILABLE' : 'PROFILE_REVIEW_UNAVAILABLE');
    assert.deepEqual(entries, [{ stage, code: -604101, requestId: 'request-123', traceId: 'trace-456' }]);
    for (const secret of ['private-cloud-id', '私密昵称', avatar, trusted.openid, failure.errMsg]) assert.equal(JSON.stringify(entries).includes(secret), false);
  }
});

test('内容审核非零响应保留对应阶段和原始错误码，不记录响应中的用户资料', async () => {
  for (const stage of ['nickname', 'avatar']) {
    const f = verifierFixture(), entries = [];
    f.cloud.openapi.wxa.game.contentSpam[stage === 'nickname' ? 'msgSecCheck' : 'mediaCheckSync'] = async () => ({
      errcode: 750031, request_id: 'request-789', traceId: 'trace-abc', errMsg: '私密错误', nickname: '私密昵称', avatarUrl: avatar,
    });
    const result = await createWechatProfileVerifier(f.cloud, entry => entries.push(entry))('cloud-id', trusted, {}, NOW);
    assert.equal(result.error.code, 'PROFILE_REVIEW_UNAVAILABLE');
    assert.deepEqual(entries, [{ stage, code: 750031, requestId: 'request-789', traceId: 'trace-abc' }]);
  }
});

test('CloudID换取返回逐项错误时记录错误码，异常日志字段不能夹带自由文本或URL', async () => {
  const f = verifierFixture(), entries = [];
  f.cloud.getOpenData = async () => ({ list: [{ cloudID: 'private-cloud-id', errCode: -601006, traceId: 'trace-safe', errMsg: 'private-cloud-id已过期' }] });
  const verify = createWechatProfileVerifier(f.cloud, entry => entries.push(entry));
  assert.equal((await verify('private-cloud-id', trusted, {}, NOW)).error.code, 'WECHAT_PROFILE_INVALID');
  assert.deepEqual(entries, [{ stage: 'openData', code: -601006, traceId: 'trace-safe' }]);
  entries.length = 0;
  f.cloud.getOpenData = async () => { throw { code: { nickname: '私密昵称' }, requestId: avatar, traceId: '不能写入的自由文本', errMsg: '私密原始错误' }; };
  await verify('private-cloud-id', trusted, {}, NOW);
  assert.deepEqual(entries, [{ stage: 'openData', code: 'UNKNOWN' }]);
});

test('审核返回结构不完整有明确诊断码，成功验证不输出失败日志', async () => {
  const f = verifierFixture(), entries = [], verify = createWechatProfileVerifier(f.cloud, entry => entries.push(entry));
  assert.equal((await verify('cloud-id', trusted, {}, NOW)).ok, true);assert.deepEqual(entries, []);
  f.cloud.openapi.wxa.game.contentSpam.msgSecCheck = async () => ({ errCode: 0, trace_id: 'trace-invalid' });
  assert.equal((await verify('cloud-id', trusted, {}, NOW)).error.code, 'PROFILE_REVIEW_UNAVAILABLE');
  assert.deepEqual(entries, [{ stage: 'nickname', code: 'INVALID_REVIEW_RESPONSE', traceId: 'trace-invalid' }]);
});
