'use strict';

const levels = require('./levels-data.json');
const legacyLevels = require('./levels-v3.json');

function getLevel(id, version = 4) {
  if (!Number.isInteger(id)) return null;
  const catalog = version === 4 ? levels : version === 3 ? legacyLevels : [];
  return catalog.find(level => level.id === id) || null;
}

module.exports = { levels, legacyLevels, getLevel };
