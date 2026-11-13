'use strict';

const CONSENT_VERSION = '2026-11-14-wechat-profile';
const AVATAR_OPTIONS = Object.freeze([
  { id: 'sunflower', label: '向日葵', color: '#F7BD4B' },
  { id: 'cat', label: '小猫', color: '#EDB38B' },
  { id: 'dog', label: '小狗', color: '#B88D69' },
  { id: 'bird', label: '小鸟', color: '#77B7DD' },
  { id: 'cloud', label: '白云', color: '#B3CCEC' },
  { id: 'leaf', label: '绿叶', color: '#82B89D' },
]);
const NICKNAME_OPTIONS = Object.freeze([
  { id: 'traveler', label: '拼图旅人' },
  { id: 'sunshine', label: '向阳小画家' },
  { id: 'cloud', label: '云朵收藏家' },
  { id: 'garden', label: '花园漫游者' },
  { id: 'coffee', label: '咖啡与拼图' },
  { id: 'starlight', label: '拾光玩家' },
  { id: 'forest', label: '森林来信' },
  { id: 'breeze', label: '微风画室' },
]);
const ERROR_CODES = Object.freeze({
  INVALID_ACTION: 'INVALID_ACTION', INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED', CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  PROFILE_REQUIRED: 'PROFILE_REQUIRED', ACCOUNT_DELETING: 'ACCOUNT_DELETING',
  LEVEL_NOT_FOUND: 'LEVEL_NOT_FOUND', LEVEL_CHANGED: 'LEVEL_CHANGED',
  RUN_NOT_FOUND: 'RUN_NOT_FOUND', RUN_FORBIDDEN: 'RUN_FORBIDDEN', RUN_NOT_ACTIVE: 'RUN_NOT_ACTIVE',
  RUN_EXPIRED: 'RUN_EXPIRED', INVALID_MOVES: 'INVALID_MOVES', UNSOLVED_RUN: 'UNSOLVED_RUN',
  INVALID_DURATION: 'INVALID_DURATION', REQUEST_CONFLICT: 'REQUEST_CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  CONFIRM_REQUIRED: 'CONFIRM_REQUIRED', SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
});
module.exports = { CONSENT_VERSION, AVATAR_OPTIONS, NICKNAME_OPTIONS, ERROR_CODES };
