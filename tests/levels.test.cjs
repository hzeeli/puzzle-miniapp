'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { levels, getLevel } = require('../shared/levels');
const R = require('../shared/rules');
const proofs = require('./fixtures/level-solutions.json');
const { solve, measure, validate } = require('../scripts/generate-levels.cjs');

function tokens(state) {
  return [...state.board.filter(t => t >= 0), ...state.queues.flat(), ...state.completed.flatMap(p => [0, 1, 2, 3].map(q => p * 4 + q))].sort((a, b) => a - b);
}
function availablePhotos(board) {
  const counts = new Map();
  board.filter(t => t >= 0).forEach(t => counts.set(Math.floor(t / 4), (counts.get(Math.floor(t / 4)) || 0) + 1));
  return [...counts.values()].filter(n => n === 4).length;
}

test('十关使用真实的十二张素材、独立版本和不同难度结构', () => {
  validate(levels, proofs);
  assert.deepEqual(levels.map(l => l.photoIds.length), [4, 4, 4, 8, 8, 8, 8, 8, 8, 8]);
  assert.deepEqual(levels.slice(3).map(l => l.difficulty.initialAvailablePhotos), [4, 3, 3, 2, 2, 1, 1]);
  let previous = 0;
  for (const level of levels) {
    assert.equal(getLevel(level.id), level);
    assert.ok(level.difficulty.verifiedMoves > previous);
    assert.ok(!('referenceSolution' in level));
    assert.deepEqual(tokens(R.createState(level)), Array.from({ length: level.photoIds.length * 4 }, (_, i) => i));
    previous = level.difficulty.verifiedMoves;
  }
  assert.equal(getLevel('1'), null); assert.equal(getLevel(0), null); assert.equal(getLevel(11), null);
});

test('前三关以完整棋盘呈现玩法，首关首步完成并练习双图反馈', () => {
  for (const level of levels.slice(0, 3)) {
    const state = R.createState(level);
    assert.equal(state.board.filter(t => t >= 0).length, 16);
    assert.ok(state.queues.every(q => q.length === 0));
  }
  for (const level of levels.slice(0, 2)) assert.deepEqual(level.photoIds, ['photo-01', 'photo-05', 'photo-06', 'photo-09']);
  const first = R.createState(levels[0]);
  assert.equal(R.groups(first.board).filter(g => g.length === 3).length, 4);
  const proof = proofs.find(p => p.levelId === 1);
  assert.ok(proof.moves.length >= 2 && proof.moves.length <= 3);
  const move = proof.moves[0], result = R.applyMove(first, move.from, move.to);
  assert.equal(result.state.completed.length, 2);
  assert.ok(result.events.some(e => e.type === 'complete' && e.photoIndices.length === 2));
});

test('第二关的教学解包含横向与纵向连块整体移动', () => {
  const level = levels[1], proof = proofs.find(p => p.levelId === 2);
  assert.ok(proof.moves.length >= 5 && proof.moves.length <= 6);
  let state = R.createState(level), horizontal = false, vertical = false;
  for (const move of proof.moves) {
    const group = R.groups(state.board).find(g => g.includes(move.from));
    if (group.length > 1) {
      horizontal ||= group.every(i => Math.floor(i / 4) === Math.floor(group[0] / 4));
      vertical ||= group.every(i => i % 4 === group[0] % 4);
    }
    state = R.applyMove(state, move.from, move.to).state;
  }
  assert.equal(horizontal, true); assert.equal(vertical, true); assert.ok(R.isSolved(state));
});

test('穷举每列所有库存前缀，排除所有可见照片同时缺片的补牌死局', () => {
  for (const level of levels.slice(3)) {
    const q = level.queues;
    for (let a = 0; a <= q[0].length; a++) for (let b = 0; b <= q[1].length; b++)
      for (let c = 0; c <= q[2].length; c++) for (let d = 0; d <= q[3].length; d++) {
        const consumed = [a, b, c, d];
        const reserve = q.flatMap((column, i) => column.slice(consumed[i]));
        if (!reserve.length) continue;
        const incomplete = new Set(reserve.map(t => Math.floor(t / 4))).size;
        const occupiedIfNoComplete = incomplete * 4 - reserve.length;
        const columnsWithReserve = q.filter((column, i) => column.length > consumed[i]).length;
        assert.ok(occupiedIfNoComplete < columnsWithReserve * 4, '关卡 ' + level.id + '，库存前缀 ' + consumed);
      }
  }
});

for (const level of levels) test('第 ' + level.id + ' 关完整解法、操作指标与每步事件守恒', () => {
  const proof = proofs.find(p => p.levelId === level.id && p.version === level.version);
  assert.deepEqual(proof.metrics, measure(level, proof.moves));
  const replay = R.replay(level, proof.moves);
  assert.equal(replay.ok, true); assert.equal(replay.solved, true);
  let state = R.createState(level); const all = tokens(state);
  for (const move of proof.moves) {
    const before = structuredClone(state), out = R.applyMove(state, move.from, move.to);
    assert.equal(out.ok, true); assert.deepEqual(state, before);
    assert.equal(out.events[0].type, 'move');
    for (const event of out.events) {
      assert.deepEqual(tokens(event.before), all); assert.deepEqual(tokens(event.after), all);
    }
    state = out.state;
  }
  assert.ok(R.isSolved(state)); assert.equal(state.moves, proof.moves.length);
});

for (const level of levels) test('第 ' + level.id + ' 关随机合法操作后仍可完成，源组与牌张保持完整', () => {
  for (let run = 0; run < 12; run++) {
    let seed = 8192 + level.id * 65537 + run * 1009;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    let state = R.createState(level); const all = tokens(state), moves = [];
    for (let n = 0; n < 40 && !R.isSolved(state); n++) {
      let result = null, move;
      for (let attempt = 0; attempt < 256; attempt++) {
        move = { from: Math.floor(random() * 16), to: Math.floor(random() * 16) };
        const candidate = R.applyMove(state, move.from, move.to);
        if (candidate.ok) { result = candidate; break; }
      }
      assert.ok(result, '随机操作必须找到合法移动');
      const source = R.groups(state.board).find(g => g.includes(move.from));
      const moved = result.events[0].after.board;
      for (const a of source) for (const b of source) {
        const nextA = moved.indexOf(state.board[a]), nextB = moved.indexOf(state.board[b]);
        assert.equal(nextB % 4 - nextA % 4, b % 4 - a % 4);
        assert.equal(Math.floor(nextB / 4) - Math.floor(nextA / 4), Math.floor(b / 4) - Math.floor(a / 4));
      }
      for (const event of result.events) assert.deepEqual(tokens(event.after), all);
      state = result.state; moves.push(move);
      assert.ok(R.isSolved(state) || availablePhotos(state.board) > 0, '不能出现只有牌库里才有缺片的死局');
    }
    const recovery = solve(state);
    assert.ok(recovery, '关卡 ' + level.id + ' 随机场景 ' + run + ' 应能继续求解');
    assert.ok(R.replay(level, moves.concat(recovery)).solved);
  }
});
