'use strict';

const SIZE = 4;
const MAX_MOVES = 2000;
const photo = token => Math.floor(token / 4);
const col = index => index % SIZE;
const row = index => Math.floor(index / SIZE);
const clone = state => ({ ...state, board: state.board.slice(), queues: state.queues.map(q => q.slice()), completed: state.completed.slice() });

function joined(board, a, b) {
  const x = board[a], y = board[b];
  return x >= 0 && y >= 0 && photo(x) === photo(y) &&
    col(b) - col(a) === y % 2 - x % 2 &&
    row(b) - row(a) === Math.floor(y % 4 / 2) - Math.floor(x % 4 / 2) &&
    Math.abs(col(b) - col(a)) + Math.abs(row(b) - row(a)) === 1;
}

function groups(board) {
  const seen = new Set(), result = [];
  for (let i = 0; i < 16; i++) {
    if (board[i] < 0 || seen.has(i)) continue;
    const group = [i]; seen.add(i);
    for (let k = 0; k < group.length; k++) {
      for (let j = 0; j < 16; j++) {
        if (!seen.has(j) && joined(board, group[k], j)) { seen.add(j); group.push(j); }
      }
    }
    result.push(group);
  }
  return result;
}

function translate(board, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 15 || to < 0 || to > 15 || from === to || board[from] < 0) return null;
  const source = groups(board).find(g => g.includes(from));
  const dx = col(to) - col(from), dy = row(to) - row(from), delta = dy * SIZE + dx;
  if (source.some(i => col(i) + dx < 0 || col(i) + dx > 3 || row(i) + dy < 0 || row(i) + dy > 3)) return null;
  const destination = source.map(i => i + delta), out = board.slice();
  source.forEach(i => { out[i] = -1; });
  for (const i of destination) {
    if (source.includes(i)) continue;
    let vacancy = i - delta;
    while (destination.includes(vacancy)) vacancy -= delta;
    out[vacancy] = board[i];
  }
  source.forEach(i => { out[i + delta] = board[i]; });
  return out;
}

function fall(board) {
  const out = board.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups(out).reverse()) {
      if (group.every(i => row(i) < 3 && (out[i + 4] < 0 || group.includes(i + 4)))) {
        const values = group.map(i => out[i]);
        group.forEach(i => { out[i] = -1; });
        group.forEach((i, k) => { out[i + 4] = values[k]; });
        changed = true;
      }
    }
  }
  return out;
}

function createState(level) {
  if (!level || !Number.isInteger(level.id) || !Number.isInteger(level.version) || !Array.isArray(level.photoIds) || level.photoIds.length < 1 || !Array.isArray(level.board) || level.board.length !== 16 || !Array.isArray(level.queues) || level.queues.length !== 4 || level.queues.some(q => !Array.isArray(q))) throw new TypeError('INVALID_LEVEL');
  const tokens = level.board.filter(t => t !== -1).concat(...level.queues);
  if (tokens.length !== level.photoIds.length * 4 || new Set(tokens).size !== tokens.length || tokens.some(t => !Number.isInteger(t) || t < 0 || t >= tokens.length) || level.board.some(t => !Number.isInteger(t) || t < -1)) throw new TypeError('INVALID_LEVEL_TOKENS');
  return { levelId: level.id, version: level.version, photoCount: level.photoIds.length, board: level.board.slice(), queues: level.queues.map(q => q.slice()), completed: [], moves: 0 };
}

function applyMove(state, from, to) {
  if (state.moves >= MAX_MOVES) return { ok: false, reason: 'TOO_MANY_MOVES', state, events: [] };
  const moved = translate(state.board, from, to);
  if (!moved) return { ok: false, reason: 'INVALID_MOVE', state, events: [] };
  let next = clone(state), events = [];
  function transition(type, mutate, data = {}) {
    const before = clone(next);
    mutate(next);
    events.push({ type, before, after: clone(next), ...data });
  }
  transition('move', s => { s.board = moved; s.moves++; }, { from, to });
  for (;;) {
    const full = groups(next.board).filter(g => g.length === 4);
    if (!full.length) break;
    const photoIndices = full.map(g => photo(next.board[g[0]]));
    transition('complete', s => { full.flat().forEach(i => { s.board[i] = -1; }); s.completed.push(...photoIndices); }, { photoIndices });
    const fallen = fall(next.board);
    if (fallen.some((t, i) => t !== next.board[i])) transition('fall', s => { s.board = fallen; });
    if (next.board.some((t, i) => t < 0 && next.queues[col(i)].length)) {
      transition('refill', s => {
        for (let c = 0; c < 4; c++) for (let r = 3; r >= 0; r--) {
          if (s.board[r * 4 + c] < 0 && s.queues[c].length) s.board[r * 4 + c] = s.queues[c].shift();
        }
      });
    }
  }
  return { ok: true, state: next, events };
}

function isSolved(state) {
  if (!state || !Array.isArray(state.board) || !Array.isArray(state.queues) || !Array.isArray(state.completed) || state.queues.some(q => !Array.isArray(q))) return false;
  return Number.isInteger(state.photoCount) && state.photoCount > 0 && state.completed.length === state.photoCount && new Set(state.completed).size === state.photoCount && state.completed.every(p => Number.isInteger(p) && p >= 0 && p < state.photoCount) && state.board.length === 16 && state.board.every(t => t === -1) && state.queues.length === 4 && state.queues.every(q => q.length === 0);
}

function replay(level, moves) {
  let state;
  try { state = createState(level); } catch (_) { return { ok: false, solved: false, error: 'INVALID_LEVEL' }; }
  if (!Array.isArray(moves)) return { ok: false, solved: false, state, error: 'INVALID_MOVES' };
  if (moves.length > MAX_MOVES) return { ok: false, solved: false, state, error: 'TOO_MANY_MOVES' };
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    if (!move || !Number.isInteger(move.from) || !Number.isInteger(move.to)) return { ok: false, solved: false, state, error: 'INVALID_MOVE', failedAt: i };
    const result = applyMove(state, move.from, move.to);
    if (!result.ok) return { ok: false, solved: false, state, error: result.reason, failedAt: i };
    state = result.state;
  }
  return { ok: true, solved: isSolved(state), state };
}

function quality(board) { return groups(board).reduce((sum, g) => sum + (g.length - 1) ** 2, 0); }
function stateKey(state) { return state.board.join(',') + '|' + state.queues.map(q => q.join(',')).join('/'); }
function candidates(state) {
  const seen = new Set(), result = [];
  for (const group of groups(state.board)) for (let to = 0; to < 16; to++) {
    const from = group[0], applied = applyMove(state, from, to);
    if (!applied.ok) continue;
    const key = stateKey(applied.state);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ from, to, state: applied.state, value: (applied.state.completed.length - state.completed.length) * 100 + quality(applied.state.board) });
  }
  return result.sort((a, b) => b.value - a.value);
}
function findHint(state) {
  if (isSolved(state)) return null;
  const available = Array.from({ length: state.photoCount }, (_, p) => p)
    .filter(p => [0, 1, 2, 3].every(q => state.board.includes(p * 4 + q)));
  let best = null;
  // 固定整图锚点后，每次只搬未对齐的组，已对齐象限不会被后续组覆盖。
  for (const p of available) for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    let next = state;
    const moves = [], anchor = y * SIZE + x;
    for (let step = 0; step < 4; step++) {
      const pending = groups(next.board)
        .filter(g => photo(next.board[g[0]]) === p && g.some(i => i !== anchor + next.board[i] % 2 + SIZE * Math.floor(next.board[i] % 4 / 2)))
        .sort((a, b) => b.length - a.length);
      if (!pending.length) break;
      const from = pending[0][0], token = next.board[from];
      const to = anchor + token % 2 + SIZE * Math.floor(token % 4 / 2);
      const result = applyMove(next, from, to);
      if (!result.ok) break;
      moves.push({ from, to }); next = result.state;
      if (next.completed.length > state.completed.length) {
        const value = (next.completed.length - state.completed.length) * 100 + quality(next.board);
        if (!best || moves.length < best.moves.length || (moves.length === best.moves.length && value > best.value)) best = { moves, value };
        break;
      }
    }
  }
  return best ? best.moves[0] : null;
}

module.exports = { SIZE, MAX_MOVES, createState, groups, joined, applyMove, isSolved, replay, findHint, quality, candidates, stateKey };
