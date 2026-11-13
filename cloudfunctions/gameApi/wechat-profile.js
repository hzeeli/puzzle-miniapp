'use strict';

const PROFILE_REVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const CLOUD_ID_TTL_MS = 5 * 60 * 1000;
const AVATAR_HOSTS = new Set(['wx.qlogo.cn', 'thirdwx.qlogo.cn']);

function error(code, message, retryable = false) {
  return { ok: false, error: { code, message, retryable } };
}
function avatarUrl(value) {
  if (value === '') return '';
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !AVATAR_HOSTS.has(url.hostname) ||
        url.username || url.password || url.port || url.hash || !/^\/mm(?:open|head)\//.test(url.pathname)) return null;
    url.protocol = 'https:';
    return url.toString();
  } catch (_) { return null; }
}
function errorCode(value) {
  return value && (value.errCode === undefined ? value.errcode === undefined ? value.code : value.errcode : value.errCode);
}
function createWechatProfileVerifier(cloud, logger = () => {}) {
  function report(stage, failure, overrideCode) {
    const rawCode = overrideCode === undefined ? errorCode(failure) : overrideCode;
    const code = Number.isSafeInteger(rawCode) || typeof rawCode === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(rawCode) ? rawCode : 'UNKNOWN';
    const entry = { stage, code };
    for (const [field, names] of [['requestId', ['requestId', 'request_id', 'requestID']], ['traceId', ['traceId', 'trace_id']]]) {
      const id = names.map(name => failure && failure[name]).find(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value));
      if (id) entry[field] = id;
    }
    logger(entry);
  }
  async function review(stage, request) {
    try { return { stage, value: await request() }; }
    catch (failure) { report(stage, failure);throw failure; }
  }
  return async (cloudID, context, previous, now) => {
    let opened;
    try { opened = await cloud.getOpenData({ list: [cloudID] }); }
    catch (failure) { report('openData', failure);return error('WECHAT_PROFILE_UNAVAILABLE', '微信资料凭证已失效或暂不可用，请重新获取', true); }
    const item = opened && opened.list && opened.list[0];
    const openFailure = errorCode(item) ? item : opened;
    if (errorCode(openFailure)) report('openData', openFailure);
    const data = item && item.cloudID === cloudID && item.data;
    if (!data || data.openId !== context.openid || !data.watermark || data.watermark.appid !== context.appid) {
      return error('WECHAT_PROFILE_INVALID', '无法验证这份微信资料，请重新授权获取');
    }
    const timestamp = data.watermark.timestamp;
    if (!Number.isSafeInteger(timestamp) || timestamp * 1000 > now + 60000 || now - timestamp * 1000 > CLOUD_ID_TTL_MS) {
      return error('WECHAT_PROFILE_EXPIRED', '微信资料凭证已过期，请重新获取');
    }
    const nickname = data.nickName;
    const url = avatarUrl(data.avatarUrl);
    if (typeof nickname !== 'string' || !nickname.trim() || Array.from(nickname).length > 128 ||
        /[\u0000-\u001f\u007f-\u009f]/.test(nickname) || url === null) {
      return error('WECHAT_PROFILE_INVALID', '微信头像或昵称格式暂不支持，请重新获取');
    }
    const unchanged = previous.profileSource === 'wechat' && previous.nickname === nickname && previous.avatarUrl === url;
    if (unchanged && Number.isFinite(previous.wechatCheckedAt) && previous.wechatCheckedAt <= now && now - previous.wechatCheckedAt < PROFILE_REVIEW_TTL_MS) {
      return { ok: true, data: { nickname, avatarUrl: url, wechatCheckedAt: previous.wechatCheckedAt } };
    }
    let checks;
    try {
      checks = await Promise.all([
        review('nickname', () => cloud.openapi.wxa.game.contentSpam.msgSecCheck({ openid: context.openid, version: 2, scene: 1, content: nickname })),
        ...(url ? [review('avatar', () => cloud.openapi.wxa.game.contentSpam.mediaCheckSync({ openid: context.openid, version: 2, scene: 1, media_type: 2, media_url: url }))] : []),
      ]);
    } catch (_) { return error('PROFILE_REVIEW_UNAVAILABLE', '微信资料安全检查暂不可用，请稍后重新获取', true); }
    for (const { stage, value: check } of checks) {
      const code = check && (check.errCode === undefined ? check.errcode : check.errCode);
      if (code !== 0 || !check.result || typeof check.result.suggest !== 'string') {
        report(stage, check, code === 0 || code === undefined || code === null ? 'INVALID_REVIEW_RESPONSE' : undefined);
        return error('PROFILE_REVIEW_UNAVAILABLE', '微信资料安全检查暂不可用，请稍后重新获取', true);
      }
      if (check.result.suggest !== 'pass') return error('PROFILE_NOT_APPROVED', '微信资料未通过安全检查，已保留原有资料');
    }
    return { ok: true, data: { nickname, avatarUrl: url, wechatCheckedAt: now } };
  };
}

module.exports = { createWechatProfileVerifier, avatarUrl, PROFILE_REVIEW_TTL_MS };
