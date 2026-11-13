'use strict';
const cloud = require('wx-server-sdk');
const { createMaintenance } = require('./service');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const handle = createMaintenance({ db: cloud.database() });

exports.main = async (event) => {
  const result = await handle(event, cloud.getWXContext());
  console.log('历史挑战清理', result);
  return result;
};
