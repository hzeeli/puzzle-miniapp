'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const R = require('../shared/rules');

const root = path.join(__dirname, '..');
const levelPath = path.join(root, 'shared/levels-data.json');
const proofPath = path.join(root, 'tests/fixtures/level-solutions.json');
const plans = [
  { title: '午后初见', description: '把小狗、海边、蛋糕和花朵接完整，留住四个美好片刻。', photos: [1, 5, 6, 9], full: 4, swaps: 2, targetMoves: 2, maxEdges: 8, focus: '单片置换、双图完成与即时反馈' },
  { title: '甜甜的早晨', description: '把横着和竖着连好的图片一起移动，拼出四个日常片刻。', photos: [1, 5, 6, 9], full: 4, swaps: 4, targetMoves: 5, maxEdges: 6, focus: '横向、纵向连块的整体移动' },
  { title: '窗外好天气', description: '试着把连好的两片一起搬到新位置。', photos: [1, 2, 5, 8], full: 4, swaps: 8, targetMoves: 8, maxEdges: 2, focus: '满棋盘交换与整体移动' },
  { title: '一日小旅行', description: '完成一张照片，新风景就会从上方来到。', photos: [1, 2, 5, 6, 4, 7, 8, 9], full: 4, swaps: 9, targetMoves: 14, maxEdges: 4, focus: '独立牌堆与下落补片' },
  { title: '花园来信', description: '先沿着完整的线索拼图，给尚未到来的碎片留个位置。', photos: [1, 5, 7, 2, 4, 8, 12, 9], full: 3, swaps: 12, targetMoves: 16, maxEdges: 3, focus: '在多张未齐照片中寻找完整线索' },
  { title: '慢慢喝杯咖啡', description: '两份早餐有相似的颜色，杯子和盘子的弧线会帮你。', photos: [3, 10, 5, 6, 9, 1, 7, 12], full: 3, swaps: 16, targetMoves: 17, maxEdges: 2, focus: '相近早餐题材与局部轮廓辨认' },
  { title: '猫咪的午睡', description: '同一抹橘色里藏着两位小伙伴，留意毛色和椅背。', photos: [8, 11, 3, 10, 9, 6, 2, 12], full: 2, swaps: 20, targetMoves: 18, maxEdges: 1, focus: '相似背景、连块拆分与重组' },
  { title: '窗边的光', description: '看清花叶、窗框和桌面的延伸，耐心整理交错的画面。', photos: [3, 9, 10, 6, 8, 11, 5, 12], full: 2, swaps: 24, targetMoves: 20, maxEdges: 1, focus: '多组相近色调与跨区搬移' },
  { title: '细节收藏家', description: '从四散的小线索开始，让下一张照片慢慢显现。', photos: [8, 11, 3, 10, 9, 6, 12, 7], full: 1, swaps: 28, targetMoves: 22, maxEdges: 0, focus: '仅一张初始齐片照片与后续预拼' },
  { title: '一拼成画', description: '花、早餐和猫咪交织在一起，完成最后一页生活相册。', photos: [10, 3, 6, 9, 8, 11, 12, 1], full: 1, swaps: 34, targetMoves: 23, maxEdges: 0, focus: '少量线索、相似构图与连续整理' }
];

function rng(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function shuffled(values, random) {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function countAvailable(board) {
  const counts = new Map();
  board.filter(t => t >= 0).forEach(t => counts.set(Math.floor(t / 4), (counts.get(Math.floor(t / 4)) || 0) + 1));
  return [...counts.values()].filter(n => n === 4).length;
}
function edges(board) {
  let count = 0;
  for (let a = 0; a < 16; a++) for (let b = a + 1; b < 16; b++) if (R.joined(board, a, b)) count++;
  return count;
}
function layout(plan, random) {
  const board = Array(16).fill(-1), queues = [[], [], [], []];
  const anchors = [0, 2, 8, 10], pending = [];
  for (let p = 0; p < plan.full; p++) for (let q = 0; q < 4; q++) board[anchors[p] + q % 2 + Math.floor(q / 2) * 4] = p * 4 + q;
  if (plan.photos.length === 8) {
    const visible = 4 - plan.full;
    for (let c = 0; c < 4; c++) {
      const p = plan.full + c, quadrants = shuffled([0, 1, 2, 3], random);
      pending.push(...quadrants.slice(0, visible).map(q => p * 4 + q));
      queues[c].push(...quadrants.slice(visible).map(q => p * 4 + q));
    }
    for (let p = plan.full + 4; p < 8; p++) queues[p - plan.full - 4].push(...shuffled([0, 1, 2, 3], random).map(q => p * 4 + q));
    for (let i = 0; i < 16; i++) if (board[i] < 0) board[i] = pending.shift();
  }
  for (let i = 0; i < plan.swaps; i++) {
    const from = Math.floor(random() * 16);
    let to = Math.floor(random() * 15); if (to >= from) to++;
    [board[from], board[to]] = [board[to], board[from]];
  }
  return { board, queues };
}
function solve(state) {
  const moves = [], seen = new Set();
  for (let i = 0; i < state.photoCount * 4; i++) {
    if (R.isSolved(state)) return moves;
    const key = R.stateKey(state); if (seen.has(key)) return null; seen.add(key);
    const move = R.findHint(state); if (!move) return null;
    const result = R.applyMove(state, move.from, move.to); if (!result.ok) return null;
    moves.push(move); state = result.state;
  }
  return R.isSolved(state) ? moves : null;
}
function measure(level, moves) {
  let state = R.createState(level), groupMoves = 0, horizontalGroupMoves = 0, verticalGroupMoves = 0, splitMoves = 0, refillEvents = 0;
  const availability = [countAvailable(state.board)];
  for (const move of moves) {
    const source = R.groups(state.board).find(g => g.includes(move.from));
    if (source.length > 1) {
      groupMoves++;
      if (source.every(i => Math.floor(i / 4) === Math.floor(source[0] / 4))) horizontalGroupMoves++;
      if (source.every(i => i % 4 === source[0] % 4)) verticalGroupMoves++;
    }
    const result = R.applyMove(state, move.from, move.to), moved = result.events[0].after.board;
    if (R.groups(state.board).some(g => !g.includes(move.from) && g.some(a => g.some(b => R.joined(state.board, a, b) && !R.joined(moved, moved.indexOf(state.board[a]), moved.indexOf(state.board[b])))))) splitMoves++;
    refillEvents += result.events.filter(e => e.type === 'refill').length;
    state = result.state;
    if (result.events.some(e => e.type === 'complete')) availability.push(countAvailable(state.board));
  }
  return { verifiedMoves: moves.length, groupMoves, horizontalGroupMoves, verticalGroupMoves, splitMoves, refillEvents, availability };
}
function validateReserve(level) {
  const owners = new Map();
  level.queues.forEach((queue, column) => {
    const seen = new Set(); let previous = null;
    for (const token of queue) {
      const p = Math.floor(token / 4);
      assert.ok(!owners.has(p) || owners.get(p) === column, '同图库存不能跨列：' + level.id);
      owners.set(p, column);
      if (p !== previous) { assert.ok(!seen.has(p), '同图库存必须连续：' + level.id); seen.add(p); previous = p; }
    }
    const pictures = [...seen];
    pictures.slice(1).forEach(p => assert.equal(queue.filter(t => Math.floor(t / 4) === p).length, 4, '队列后续图必须齐片：' + level.id));
  });
}
function validate(levels, proofs) {
  assert.equal(levels.length, 10); assert.equal(proofs.length, 10);
  levels.forEach((level, index) => {
    assert.equal(level.id, index + 1); assert.equal(level.version, 3);
    assert.equal(level.photoIds.length, index < 3 ? 4 : 8);
    assert.equal(new Set(level.photoIds).size, level.photoIds.length);
    level.photoIds.forEach(id => {
      assert.match(id, /^photo-(0[1-9]|1[0-2])$/);
      assert.ok(fs.statSync(path.join(root, 'game/assets/photos', id + '.jpg')).size > 10000, '照片缺失或为空：' + id);
    });
    const state = R.createState(level);
    assert.ok(state.board.every(t => t >= 0), '开局必须铺满棋盘：' + level.id);
    if (index < 3) assert.ok(state.queues.every(q => q.length === 0), '教学关不设置备用牌：' + level.id);
    assert.ok(R.groups(state.board).every(g => g.length < 4));
    validateReserve(level);
    const proof = proofs.find(p => p.levelId === level.id && p.version === level.version);
    assert.ok(proof); assert.ok(R.replay(level, proof.moves).solved);
    assert.deepEqual(proof.metrics, measure(level, proof.moves));
    assert.equal(level.difficulty.verifiedMoves, proof.moves.length);
    assert.equal(level.difficulty.initialEdges, edges(level.board));
    assert.equal(level.difficulty.initialAvailablePhotos, countAvailable(level.board));
  });
}
function generate() {
  const levels = [], proofs = [];
  for (let index = 0; index < plans.length; index++) {
    const plan = plans[index]; let selected = null;
    for (let attempt = 0; attempt < 1200; attempt++) {
      const seed = 260929 + index * 100003 + attempt * 7919;
      const level = { id: index + 1, version: 3, title: plan.title, description: plan.description, photoIds: plan.photos.map(p => 'photo-' + String(p).padStart(2, '0')), ...layout(plan, rng(seed)) };
      if (index === 0) level.board = [0, 1, 4, 5, 2, 7, 6, 3, 8, 9, 12, 13, 10, 15, 14, 11];
      if (R.groups(level.board).some(g => g.length === 4) || edges(level.board) > plan.maxEdges || edges(level.board) < [8, 4, 1, 3, 2, 1, 1, 0, 0, 0][index]) continue;
      const moves = solve(R.createState(level));
      if (!moves || moves.length !== plan.targetMoves) continue;
      const metrics = measure(level, moves);
      if (index === 1 && (!metrics.horizontalGroupMoves || !metrics.verticalGroupMoves)) continue;
      level.difficulty = { rank: level.id, focus: plan.focus, shuffleSwaps: plan.swaps, initialEdges: edges(level.board), initialAvailablePhotos: countAvailable(level.board), reserveCount: level.queues.flat().length, verifiedMoves: moves.length };
      selected = level;
      proofs.push({ levelId: level.id, version: level.version, seed, metrics, moves });
      break;
    }
    assert.ok(selected, '无法找到满足设计约束的关卡：' + (index + 1));
    levels.push(selected);
    console.log('关卡', selected.id, '验证解', selected.difficulty.verifiedMoves, '初始接边', selected.difficulty.initialEdges, '可齐片照片', selected.difficulty.initialAvailablePhotos);
  }
  validate(levels, proofs);
  fs.writeFileSync(levelPath, JSON.stringify(levels, null, 2) + '\n');
  fs.writeFileSync(proofPath, JSON.stringify(proofs, null, 2) + '\n');
}

if (require.main === module) {
  if (process.argv.includes('--check')) {
    validate(JSON.parse(fs.readFileSync(levelPath, 'utf8')), JSON.parse(fs.readFileSync(proofPath, 'utf8')));
    console.log('十关版本、素材文件、独立牌库和完整解法校验通过。');
  } else generate();
}
module.exports = { solve, measure, validateReserve, validate };
