'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const R = require('../shared/rules');

const root = path.join(__dirname, '..');
const levelPath = path.join(root, 'shared/levels-data.json');
const proofPath = path.join(root, 'tests/fixtures/level-solutions.json');
// 图数、初始齐片和库存先满足守恒，再按手工目标筛选固定种子。
const plans = [
  ['午后初见','交换两片，给午后的照片拼上最后一角。',[1,5,6,9],4,2,8,2,3,5,0,0,1],
  ['甜甜的早晨','连好的相纸可以一起移动。',[1,5,6,9],4,4,6,5,7,10,0,0,6],
  ['窗外好天气','沿着窗框和叶脉，整理散开的四张照片。',[1,2,5,8],4,8,2,8,11,15,0,0,2],
  ['一日小旅行','拼好一张照片，上方的胶卷会送来新的碎片。',[1,2,5,6,4,7,8,9],4,9,3,14,18,24,0,0,5],
  ['显影的信','移动暗片，或在它旁边接合相纸，让画面显影。',[2,7,4,5],4,5,4,6,8,12,2,0,7],
  ['慢慢喝杯咖啡','拼好杯沿，让旁边的暗片一起见光。',[3,10,5,6,9,1,7,12],3,16,2,17,22,29,3,0,3],
  ['花园来信','沿着花瓣和山脊，冲印花园的明信片。',[9,2,7,5,4,8,12,1],3,9,3,15,20,26,2,0,9],
  ['黄金定位','钉住的角无法移动，把同图的其余三片拼到它身边。',[4,5,2,12,8,9],4,9,4,11,15,20,0,1,4],
  ['猫咪的午睡','先辨认猫咪的毛色，再为钉住的相纸补齐四角。',[8,11,3,10,9,6,2,12],2,20,1,18,24,32,2,1,8],
  ['窗边的光','围着定位钉拼图，借窗框的接缝照亮暗片。',[10,3,9,6,8,11,5,12],2,24,1,20,26,35,3,1,10],
  ['暗房双锚','两张相纸各有一枚钉，选一侧开始装帧。',[11,8,3,10,9,6,12,7],2,28,1,21,28,37,0,2,11],
  ['拾光终章','点亮暗片、解开双钉，完成最后一卷。',[12,3,6,9,8,11,10,1],2,34,0,23,31,42,4,2,12]
].map(([title,description,photos,full,swaps,edges,targetMoves,goldMoves,parMoves,hidden,pins,featured]) =>
  ({title,description,photos,full,swaps,edges,targetMoves,goldMoves,parMoves,hidden,pins,featured}));
const photoId = n => 'photo-' + String(n).padStart(2,'0');
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
function edges(board, hidden) {
  let count = 0;
  for (let a = 0; a < 16; a++) for (let b = a + 1; b < 16; b++) if (R.joined(board, a, b, hidden)) count++;
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
  if (plan.photos.length === 6) {
    for (let p = 4; p < 6; p++) queues[p - 4] = shuffled([0,1,2,3], random).map(q => p * 4 + q);
  }
  for (let i = 0; i < plan.swaps; i++) {
    const from = Math.floor(random() * 16);
    let to = Math.floor(random() * 15); if (to >= from) to++;
    [board[from], board[to]] = [board[to], board[from]];
  }
  const pinnedTokens = [], reserved = new Set();
  for (const t of shuffled(board, random)) {
    if (pinnedTokens.length === plan.pins) break;
    const p = Math.floor(t / 4);
    if (p >= plan.full || pinnedTokens.some(pin => Math.floor(pin / 4) === p)) continue;
    const i = board.indexOf(t), x = i % 4 - t % 2, y = Math.floor(i / 4) - Math.floor(t % 4 / 2);
    if (x < 0 || x > 2 || y < 0 || y > 2) continue;
    const frame = [0,1,4,5].map(offset => y * 4 + x + offset);
    if (frame.some(cell => reserved.has(cell))) continue;
    pinnedTokens.push(t);
    frame.forEach(cell => reserved.add(cell));
  }
  const hiddenTokens = shuffled(board.filter(t => !pinnedTokens.includes(t)), random).slice(0,plan.hidden);
  return { board, queues, hiddenTokens, pinnedTokens };
}
function solve(state) {
  const moves = [], seen = new Set(), limit = state.photoCount * 4 + (state.hidden || []).length + 1;
  for (let i = 0; i < limit; i++) {
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
    const source = R.groups(state.board, state.hidden).find(g => g.includes(move.from));
    if (source.length > 1) {
      groupMoves++;
      if (source.every(i => Math.floor(i / 4) === Math.floor(source[0] / 4))) horizontalGroupMoves++;
      if (source.every(i => i % 4 === source[0] % 4)) verticalGroupMoves++;
    }
    const result = R.applyMove(state, move.from, move.to), moved = result.events[0].after.board;
    if (R.groups(state.board, state.hidden).some(g => !g.includes(move.from) && g.some(a => g.some(b => R.joined(state.board, a, b, state.hidden) && !R.joined(moved, moved.indexOf(state.board[a]), moved.indexOf(state.board[b]), state.hidden))))) splitMoves++;
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
  assert.equal(levels.length, plans.length); assert.equal(proofs.length, plans.length);
  levels.forEach((level, index) => {
    assert.equal(level.id, index + 1); assert.equal(level.version, 4);
    const plan = plans[index];
    assert.deepEqual(level.photoIds, plan.photos.map(photoId));
    assert.deepEqual([level.hiddenTokens.length,level.pinnedTokens.length], [plan.hidden,plan.pins]);
    assert.equal(level.chapter, Math.floor(index / 4) + 1);
    assert.ok(level.photoIds.includes(level.featuredPhotoId));
    assert.ok(level.goldMoves < level.parMoves && level.goldMoves >= level.difficulty.verifiedMoves);
    assert.equal(new Set(level.photoIds).size, level.photoIds.length);
    level.photoIds.forEach(id => {
      assert.match(id, /^photo-(0[1-9]|1[0-2])$/);
      assert.ok(fs.statSync(path.join(root, 'game/assets/photos', id + '.jpg')).size > 10000, '照片缺失或为空：' + id);
    });
    const state = R.createState(level);
    assert.ok(state.board.every(t => t >= 0), '开局必须铺满棋盘：' + level.id);
    if (index < 3) assert.ok(state.queues.every(q => q.length === 0), '教学关不设置备用牌：' + level.id);
    assert.ok(R.groups(state.board, state.hidden).every(g => g.length < 4));
    validateReserve(level);
    const proof = proofs.find(p => p.levelId === level.id && p.version === level.version);
    assert.ok(proof); assert.ok(R.replay(level, proof.moves).solved);
    assert.deepEqual(proof.metrics, measure(level, proof.moves));
    assert.equal(level.difficulty.verifiedMoves, proof.moves.length);
    assert.equal(level.difficulty.initialEdges, edges(level.board, level.hiddenTokens));
    assert.equal(level.difficulty.initialAvailablePhotos, countAvailable(level.board));
  });
}
function generate() {
  const levels = [], proofs = [];
  for (let index = 0; index < plans.length; index++) {
    const plan = plans[index]; let selected = null;
    for (let attempt = 0; attempt < 12000; attempt++) {
      const seed = 260929 + index * 100003 + attempt * 7919;
      const level = { id: index + 1, version: 4, chapter: Math.floor(index / 4) + 1, title: plan.title, description: plan.description, photoIds: plan.photos.map(photoId), featuredPhotoId: photoId(plan.featured), goldMoves: plan.goldMoves, parMoves: plan.parMoves, ...layout(plan, rng(seed)) };
      if (index === 0) level.board = [0, 1, 4, 5, 2, 7, 6, 3, 8, 9, 12, 13, 10, 15, 14, 11];
      if (level.pinnedTokens.length !== plan.pins || R.groups(level.board, level.hiddenTokens).some(g => g.length === 4) || edges(level.board, level.hiddenTokens) !== plan.edges) continue;
      const moves = solve(R.createState(level));
      if (!moves || moves.length !== plan.targetMoves) continue;
      if (index === 4) {
        const first = R.applyMove(R.createState(level), moves[0].from, moves[0].to);
        if (!first.events.some(e => e.type === 'reveal' && e.tokens.some(t => t !== level.board[moves[0].from]))) continue;
      }
      const metrics = measure(level, moves);
      if (index === 1 && (!metrics.horizontalGroupMoves || !metrics.verticalGroupMoves)) continue;
      level.difficulty = { rank: level.id, shuffleSwaps: plan.swaps, initialEdges: edges(level.board, level.hiddenTokens), initialAvailablePhotos: countAvailable(level.board), reserveCount: level.queues.flat().length, verifiedMoves: moves.length };
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
    console.log('十二关版本、素材文件、独立牌库和完整解法校验通过。');
  } else generate();
}
module.exports = { solve, measure, validateReserve, validate };
