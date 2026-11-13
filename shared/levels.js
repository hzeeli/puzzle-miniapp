'use strict';
const levels = require('./levels-data.json');
function getLevel(id) { return Number.isInteger(id) ? levels.find(level => level.id === id) || null : null; }
module.exports = { levels, getLevel };
