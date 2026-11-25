'use strict';
const crypto = require('node:crypto');
const {storyRankKey} = require('./story-rank-key');
const { CONSENT_VERSION, AVATAR_OPTIONS, NICKNAME_OPTIONS } = require('./shared/profile-options');

const RUN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MOVES = 2000;
const START_COOLDOWN_MS = 800;
const COLLECTIONS = { players: 'players', runs: 'runs', scores: 'bestScores' };

class GameError extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}
const fail = (code, message, retryable) => { throw new GameError(code, message, retryable); };
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const scoreId = (owner, levelId, version) => hash(`${owner}\0${levelId}\0${version}`);
function validString(value, min = 1, max = 100) {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}
function publicProfile(player) {
  return { id: player.playerId, nickname: player.nickname, nicknameId: player.nicknameId, avatarId: player.avatarId,
    avatarUrl: player.profileSource === 'wechat' ? player.avatarUrl || '' : '', profileSource: player.profileSource === 'wechat' ? 'wechat' : 'guest' };
}
function bestSummary(score) {
  return { levelId: score.levelId, levelVersion: score.levelVersion, durationMs: score.durationMs, achievedAt: score.achievedAt };
}

function createGameService({ repository: repo, levels, rules, journey, storyReplay, verifyWechatProfile, clock = Date.now, id = crypto.randomUUID, appId, logger = () => {} }) {
  const editions = new Map([
    [3, { list: levels.legacyLevels, active: 'activeRunId', unlocked: 'unlockedLevel' }],
    [4, { list: levels.levels, active: 'activeRunIdV4', unlocked: 'unlockedLevelV4' }],
  ]);
  function editionFor(version = 3) {
    const edition = editions.get(version);
    if (!edition) fail('LEVEL_CHANGED', '云端暂不支持这个关卡版本');
    return edition;
  }
  function levelFor(value, version = 3) {
    if (!Number.isInteger(value)) fail('INVALID_ARGUMENT', '关卡参数不正确');
    editionFor(version);
    const level = levels.getLevel(value, version);
    if (!level) fail('LEVEL_NOT_FOUND', '这道关卡暂不可用');
    return level;
  }
  function identity(context) {
    if (!context || !validString(context.openid, 1, 128) || !validString(context.appid, 1, 64) ||
        (appId && context.appid !== appId)) fail('NOT_AUTHENTICATED', '无法确认微信身份，请重新进入游戏');
    return hash(`${context.appid}\0${context.openid}`);
  }
  async function playerFor(source, owner) {
    const player = await source.get(COLLECTIONS.players, owner);
    if (!player) fail('PROFILE_REQUIRED', '请先同意隐私说明并开启云端挑战');
    if (player.status === 'deleting') fail('ACCOUNT_DELETING', '个人记录正在清理，请稍后重试', true);
    if (player.consentVersion !== CONSENT_VERSION) fail('CONSENT_REQUIRED', '请阅读并同意最新隐私说明');
    return player;
  }
  function validateRun(run, owner, player, now) {
    if (!run) fail('RUN_NOT_FOUND', '未找到这次挑战');
    if (run.owner !== owner) fail('RUN_FORBIDDEN', '无法访问这次挑战');
    const edition = editionFor(run.levelVersion);
    if (run.status !== 'active' || player[edition.active] !== run.runId) fail('RUN_NOT_ACTIVE', '这次挑战已结束，请重新开始');
    if (now - run.startedAt > RUN_TTL_MS) fail('RUN_EXPIRED', '这次排名挑战已超过24小时，可保留本地进度继续练习');
    const level = levels.getLevel(run.levelId, run.levelVersion);
    if (!level || run.levelVersion !== level.version) fail('LEVEL_CHANGED', '关卡已更新，请重新开始排名挑战');
    return level;
  }
  function runSummary(run, now) {
    return { runId: run.runId, levelId: run.levelId, levelVersion: run.levelVersion,
      startedAt: run.startedAt, serverNow: now, status: run.status };
  }
  async function currentBest(owner, level) {
    return repo.get(COLLECTIONS.scores, scoreId(owner, level.id, level.version));
  }
  async function openPlayer(owner) {
    const now = clock(), playerId = id();
    return repo.transaction(async (tx) => {
      let value = await tx.get(COLLECTIONS.players, owner);
      if (value && value.status === 'deleting') fail('ACCOUNT_DELETING', '个人记录正在清理，请稍后重试', true);
      if (!value) {
        const nickname = NICKNAME_OPTIONS[parseInt(owner.slice(0, 2), 16) % NICKNAME_OPTIONS.length];
        value = { owner, playerId, nicknameId: nickname.id,
          nickname: `${nickname.label}·${playerId.replace(/-/g, '').slice(-4).toUpperCase()}`,
          avatarId: AVATAR_OPTIONS[parseInt(owner.slice(2, 4), 16) % AVATAR_OPTIONS.length].id, profileSource: 'guest', avatarUrl: '',
          unlockedLevel: 1, activeRunId: null, status: 'active', createdAt: now,
          consentVersion: CONSENT_VERSION, consentedAt: now, updatedAt: now };
        await tx.put(COLLECTIONS.players, owner, value);
      } else if (value.consentVersion !== CONSENT_VERSION) {
        value = { ...value, consentVersion: CONSENT_VERSION, consentedAt: now, updatedAt: now };
        await tx.put(COLLECTIONS.players, owner, value);
      }
      return value;
    });
  }
  const actions = {
    async bootstrap(payload, owner) {
      if (payload.consentVersion !== CONSENT_VERSION) fail('CONSENT_REQUIRED', '请先阅读并同意隐私说明');
      const version = payload.levelVersion === undefined ? 3 : payload.levelVersion;
      const edition = editionFor(version), levelList = edition.list;
      const player = await openPlayer(owner);
      const summaries = async (list) => {
        const keys = list.map(level => ({ levelId: level.id, levelVersion: level.version }));
        const scores = await repo.listBest(owner, keys);
        return scores.filter(score => keys.some(key => key.levelId === score.levelId && key.levelVersion === score.levelVersion))
          .sort((a,b) => a.levelId - b.levelId).map(bestSummary);
      };
      const [bestScores, legacyBestScores] = await Promise.all([
        summaries(levelList), version === 4 ? summaries(levels.legacyLevels) : [],
      ]);
      const now = clock();
      let activeRun = null;
      if (player[edition.active]) {
        const run = await repo.get(COLLECTIONS.runs, player[edition.active]);
        if (run && run.owner === owner && run.status === 'active' && now - run.startedAt <= RUN_TTL_MS &&
          levelList.some((level) => level.id === run.levelId && level.version === run.levelVersion)) activeRun = runSummary(run, clock());
      }
      return { publicProfile: publicProfile(player), levelVersion: version, unlockedLevel: player[edition.unlocked] || 1, bestScores, ...(version === 4 ? { legacyBestScores } : {}), activeRun, serverNow: now };
    },
    async storyBootstrap(payload, owner) {
      if (payload.consentVersion !== CONSENT_VERSION) fail('CONSENT_REQUIRED', '请先阅读并同意隐私说明');
      const player = await openPlayer(owner);
      return {rankingVersion: 1, publicProfile: publicProfile(player), highestLevel: player.storyScore?.level || 0};
    },
    async submitStoryClear(payload, owner) {
      const {level, sessionVersion, moves, toolHistory = [], playerId} = payload;
      if (!Number.isSafeInteger(level) || level < 1 || !Number.isSafeInteger(level * 8) ||
          !(sessionVersion === 3 || sessionVersion === 1 && level <= 60) || !validString(playerId, 1, 128)) {
        fail('INVALID_ARGUMENT', '关卡或档案版本无效');
      }
      if (!Array.isArray(moves) || moves.length > MAX_MOVES || !Array.isArray(toolHistory) || toolHistory.length > 5) {
        fail('INVALID_MOVES', '通关记录格式不正确');
      }
      const checkFrontier = player => {
        if (player.playerId !== playerId) fail('PROFILE_CHANGED', '云档案已变化，请重新连接');
        const previous = player.storyScore?.level || 0;
        if (level > previous + 1) fail('PREVIOUS_REQUIRED', '请先同步前一关的通关记录');
        return previous;
      };
      const previous = checkFrontier(await playerFor(repo, owner));
      if (level <= previous) return {highestLevel: previous};
      const board = journey.buildLevel(journey.storySession(level, sessionVersion));
      const result = storyReplay(board, moves, toolHistory);
      if (!result.ok) fail('INVALID_MOVES', '操作与本关棋盘不一致');
      if (!result.solved) fail('UNSOLVED_RUN', '本关尚未拼完');
      return repo.transaction(async tx => {
        const player = await playerFor(tx, owner), current = checkFrontier(player);
        if (level <= current) return {highestLevel: current};
        const achievedAt = clock();
        const key = storyRankKey(level, achievedAt, playerId);
        if (player.storyScore) await tx.remove(COLLECTIONS.scores, player.storyScore.key);
        await tx.put(COLLECTIONS.scores, key, {owner, playerId, level, achievedAt});
        await tx.put(COLLECTIONS.players, owner, {...player, storyScore:{level, achievedAt, key}, updatedAt:achievedAt});
        return {highestLevel: level};
      });
    },
    async storyLeaderboard(payload, owner) {
      const player = await playerFor(repo, owner), scores = await repo.topStory();
      const entries = (await Promise.all(scores.map(async score => {
        const p = score.owner === owner ? player : await repo.get(COLLECTIONS.players, score.owner);
        if (!p || p.status !== 'active' || p.playerId !== score.playerId) return null;
        return {...publicProfile(p), level:score.level, achievedAt:score.achievedAt, isSelf:score.owner === owner};
      }))).filter(Boolean).map((entry, i) => ({...entry, rank:i+1}));
      const self = entries.find(entry => entry.isSelf);
      const score = self || player.storyScore;
      const own = score ? {level:score.level, achievedAt:score.achievedAt, rank:self ? self.rank : await repo.storyRank(score.key)} : null;
      return {rankingVersion: 1, entries, own};
    },
    async startRun(payload, owner) {
      const level = levelFor(payload.levelId, payload.levelVersion);
      const edition = editionFor(level.version);
      if (!validString(payload.requestId, 8, 96) || !/^[a-zA-Z0-9_-]+$/.test(payload.requestId)) fail('INVALID_ARGUMENT', '挑战请求标识不正确');
      const runId = hash(`${owner}\0${payload.requestId}`), now = clock();
      const run = await repo.transaction(async (tx) => {
        const player = await playerFor(tx, owner);
        const existing = await tx.get(COLLECTIONS.runs, runId);
        if (existing) {
          if (existing.levelId !== level.id || existing.levelVersion !== level.version) fail('REQUEST_CONFLICT', '这个请求标识已用于其他关卡');
          return existing;
        }
        if (player.lastStartedAt !== undefined && now - player.lastStartedAt < START_COOLDOWN_MS) fail('TOO_MANY_REQUESTS', '开始得太快啦，请稍后再试', true);
        if (player[edition.active]) {
          const previous = await tx.get(COLLECTIONS.runs, player[edition.active]);
          if (previous && previous.status === 'active') await tx.put(COLLECTIONS.runs, previous.runId, { ...previous, status: 'abandoned', closedAt: now });
        }
        const value = { runId, owner, playerId: player.playerId, levelId: level.id, levelVersion: level.version,
          startedAt: now, status: 'active', requestId: payload.requestId };
        await tx.put(COLLECTIONS.runs, runId, value);
        await tx.put(COLLECTIONS.players, owner, { ...player, [edition.active]: runId, lastStartedAt: now, updatedAt: now });
        return value;
      });
      return runSummary(run, clock());
    },
    async resumeRun(payload, owner) {
      if (!validString(payload.runId, 64, 64) || !/^[a-f0-9]+$/.test(payload.runId)) fail('INVALID_ARGUMENT', '挑战标识不正确');
      const player = await playerFor(repo, owner), run = await repo.get(COLLECTIONS.runs, payload.runId), now = clock();
      validateRun(run, owner, player, now);
      return runSummary(run, now);
    },
    async finishRun(payload, owner) {
      if (!validString(payload.runId, 64, 64) || !/^[a-f0-9]+$/.test(payload.runId)) fail('INVALID_ARGUMENT', '挑战标识不正确');
      if (!Array.isArray(payload.moves) || payload.moves.length === 0 || payload.moves.length > MAX_MOVES ||
        payload.moves.some((move) => !move || !Number.isInteger(move.from) || !Number.isInteger(move.to) || move.from < 0 || move.to < 0)) {
        fail('INVALID_MOVES', '操作记录不完整，请重试同步');
      }
      const now = clock();
      const run = await repo.get(COLLECTIONS.runs, payload.runId);
      if (!run) fail('RUN_NOT_FOUND', '未找到这次挑战');
      if (run.owner !== owner) fail('RUN_FORBIDDEN', '无法提交其他玩家的挑战');
      const player = await playerFor(repo, owner);
      // 已结算会话直接重用结果，网络重试不再次计算耗时或更新榜单。
      if (run.status !== 'finished') {
        const level = validateRun(run, owner, player, now);
        const replayed = rules.replay(level, payload.moves);
        if (!replayed.ok) fail('INVALID_MOVES', '操作记录与关卡规则不一致');
        if (!rules.isSolved(replayed.state)) fail('UNSOLVED_RUN', '这道关卡还没有完成');
      }
      const result = await repo.transaction(async (tx) => {
        const currentPlayer = await playerFor(tx, owner), currentRun = await tx.get(COLLECTIONS.runs, payload.runId);
        if (!currentRun) fail('RUN_NOT_FOUND', '未找到这次挑战');
        if (currentRun.owner !== owner) fail('RUN_FORBIDDEN', '无法提交其他玩家的挑战');
        if (currentRun.status === 'finished') return currentRun.result;
        const level = validateRun(currentRun, owner, currentPlayer, now);
        const durationMs = now - currentRun.startedAt;
        if (!Number.isSafeInteger(durationMs) || durationMs <= 0) fail('INVALID_DURATION', '挑战计时异常，请重新开始');
        const bestId = scoreId(owner, level.id, level.version), previous = await tx.get(COLLECTIONS.scores, bestId);
        const isPersonalBest = !previous || durationMs < previous.durationMs;
        if (isPersonalBest) await tx.put(COLLECTIONS.scores, bestId, { owner, playerId: currentPlayer.playerId,
          levelId: level.id, levelVersion: level.version, durationMs, achievedAt: now, runId: currentRun.runId });
        const edition = editionFor(level.version);
        const unlockedLevel = Math.min(edition.list.length, Math.max(currentPlayer[edition.unlocked] || 1, level.id + 1));
        const value = { durationMs, isPersonalBest, unlockedLevel, bestMs: isPersonalBest ? durationMs : previous.durationMs };
        await tx.put(COLLECTIONS.runs, currentRun.runId, { ...currentRun, status: 'finished', finishedAt: now,
          moveCount: payload.moves.length, moves: payload.moves.map(({ from, to }) => ({ from, to })), result: value });
        await tx.put(COLLECTIONS.players, owner, { ...currentPlayer, [edition.unlocked]: unlockedLevel, [edition.active]: null, updatedAt: now });
        return value;
      });
      const currentLevel = levelFor(run.levelId, run.levelVersion), best = await currentBest(owner, currentLevel);
      return { ...result, rank: best ? await repo.rankOf(best) : null };
    },
    async leaderboard(payload, owner) {
      const level = levelFor(payload.levelId, payload.levelVersion);
      const [scores, best] = await Promise.all([repo.topScores(level.id, level.version), currentBest(owner, level)]);
      const entries = [];
      for (const score of scores) {
        const player = await repo.get(COLLECTIONS.players, score.owner);
        if (!player || player.status !== 'active') continue;
        entries.push({ rank: entries.length + 1, ...publicProfile(player), durationMs: score.durationMs,
          achievedAt: score.achievedAt, isSelf: score.owner === owner });
      }
      return { levelVersion: level.version, entries, ownBest: best ? { ...bestSummary(best), rank: await repo.rankOf(best) } : null, serverNow: clock() };
    },
    async syncWechatProfile(payload, owner, context) {
      if (!validString(payload.cloudID, 1, 1024)) fail('INVALID_ARGUMENT', '请通过微信官方按钮获取头像昵称');
      const previous = await playerFor(repo, owner);
      if (!verifyWechatProfile) fail('WECHAT_PROFILE_UNAVAILABLE', '微信资料同步暂不可用', true);
      const checked = await verifyWechatProfile(payload.cloudID, context, previous, clock());
      if (!checked.ok) fail(checked.error.code, checked.error.message, checked.error.retryable);
      const player = await repo.transaction(async (tx) => {
        const current = await playerFor(tx, owner);
        if (current.playerId !== previous.playerId) fail('PROFILE_REQUIRED', '账号资料已变化，请重新进入我的页面');
        const value = { ...current, nickname: checked.data.nickname, avatarUrl: checked.data.avatarUrl,
          nicknameId: null, avatarId: 'cloud', profileSource: 'wechat', wechatCheckedAt: checked.data.wechatCheckedAt, updatedAt: clock() };
        await tx.put(COLLECTIONS.players, owner, value);
        return value;
      });
      return { publicProfile: publicProfile(player) };
    },
    async deleteAccount(payload, owner) {
      if (payload.confirm !== true) fail('CONFIRM_REQUIRED', '请确认删除个人云端记录');
      const deletionId = id();
      const deletion = await repo.transaction(async (tx) => {
        const player = await tx.get(COLLECTIONS.players, owner);
        if (!player) return null;
        if (player.status === 'deleting') return { id: player.deletionId, playerId: player.playerId };
        await tx.put(COLLECTIONS.players, owner, { ...player, status: 'deleting', deletionId, updatedAt: clock() });
        // 当前榜单与删除状态一并提交，清理历史会话期间不会留下不可见名次。
        if (player.storyScore) await tx.remove(COLLECTIONS.scores, player.storyScore.key);
        for (const level of [...levels.legacyLevels, ...levels.levels]) {
          const bestId = scoreId(owner, level.id, level.version);
          if (await tx.get(COLLECTIONS.scores, bestId)) await tx.remove(COLLECTIONS.scores, bestId);
        }
        return { id: deletionId, playerId: player.playerId };
      });
      if (!deletion) return { deleted: true };
      await repo.removeOwned(COLLECTIONS.runs, owner, deletion.playerId);
      await repo.removeOwned(COLLECTIONS.scores, owner, deletion.playerId);
      await repo.transaction(async (tx) => {
        const player = await tx.get(COLLECTIONS.players, owner);
        if (player && player.status === 'deleting' && player.deletionId === deletion.id) await tx.remove(COLLECTIONS.players, owner);
      });
      return { deleted: true };
    },
  };
  return {
    async handle(event, context) {
      try {
        const owner = identity(context);
        if (!event || typeof event.action !== 'string' || !Object.hasOwn(actions, event.action)) fail('INVALID_ACTION', '不支持的操作');
        const payload = event.payload === undefined ? {} : event.payload;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('INVALID_ARGUMENT', '请求参数不正确');
        return { ok: true, data: await actions[event.action](payload, owner, context) };
      } catch (error) {
        if (error instanceof GameError) return { ok: false, error: { code: error.code, message: error.message, retryable: error.retryable } };
        logger({ action: event && event.action, code: error.code || error.name || 'UNKNOWN' });
        return { ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: '云端暂时繁忙，请稍后重试', retryable: true } };
      }
    },
  };
}
module.exports = { createGameService, GameError, RUN_TTL_MS, MAX_MOVES, scoreId };
