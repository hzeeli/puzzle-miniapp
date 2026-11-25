'use strict';

// 旧竞速记录使用十六进制散列 ID。独立前缀和定长数字允许主线榜复用内置主键索引。
const STORY_START = 'S', STORY_END = 'T';
const sortable = n => n.toString(36).padStart(11, '0');
function storyRankKey(level, achievedAt, playerId) {
  return STORY_START + sortable(Number.MAX_SAFE_INTEGER - level) + '-' + sortable(achievedAt) + '-' + playerId;
}
module.exports = {storyRankKey, STORY_START, STORY_END};
