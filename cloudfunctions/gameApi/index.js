'use strict';
const cloud = require('wx-server-sdk');
const { createRepository } = require('./repository');
const { createGameService } = require('./service');
const { createWechatProfileVerifier } = require('./wechat-profile');
const levels = require('./shared/levels');
const rules = require('./shared/rules');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database({ throwOnNotFound: false });
const service = createGameService({
  repository: createRepository(db), levels, rules,
  verifyWechatProfile: createWechatProfileVerifier(cloud, (entry) => console.warn('微信资料校验失败', entry)),
  appId: 'wxc2add44d840ca728',
  logger: (entry) => console.error('gameApi 调用失败', entry),
});

exports.main = async (event) => {
  const context = cloud.getWXContext();
  return service.handle(event, { openid: context.OPENID, appid: context.APPID });
};
