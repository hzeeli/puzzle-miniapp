'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../shared/rules');
const emptyQueues = () => [[], [], [], []];
function state(entries, photoCount = 3) {
  const board = Array(16).fill(-1);
  for (const [i, token] of entries) board[i] = token;
  return { levelId: 1, version: 1, photoCount, board, queues: emptyQueues(), completed: [], moves: 0 };
}
function allTokens(s) {
  return [...s.board.filter(t => t >= 0), ...s.queues.flat(), ...s.completed.flatMap(p => [p*4,p*4+1,p*4+2,p*4+3])].sort((a,b)=>a-b);
}

test('正确边缘立即形成二片与 L 形三片，错误方向或照片不融合', () => {
  const a=state([[0,0],[2,1],[8,2],[15,3],[3,7]]);
  const b=R.applyMove(a,2,1);
  assert.equal(b.ok,true);assert.deepEqual(R.groups(b.state.board).find(g=>g.includes(0)),[0,1]);
  const c=R.applyMove(b.state,8,4);
  assert.deepEqual(R.groups(c.state.board).find(g=>g.includes(0)),[0,1,4]);
  assert.equal(R.joined([1,0],0,1),false);
  assert.equal(R.joined([0,5],0,1),false);
});

test('L 形整体重叠平移并保持被置换碎片守恒', () => {
  const a=state([[0,0],[1,1],[4,2],[2,8],[5,20]]);
  const b=R.applyMove(a,0,1);
  assert.equal(b.ok,true);
  assert.deepEqual(b.events[0].after.board.slice(0,6),[8,0,1,-1,20,2]);
  assert.deepEqual(allTokens(a),allTokens(b.state));
  assert.deepEqual(R.groups(b.state.board).find(g=>g.includes(1)),[1,2,5]);
});

test('拖动融合块任意成员均移动整个块，支持跨行跨列', () => {
  const a=state([[0,0],[1,1],[4,2],[15,9]]);
  const b=R.applyMove(a,4,9);
  assert.equal(b.ok,true);assert.deepEqual(b.state.board.filter(t=>[0,1,2].includes(t)),[0,1,2]);
  assert.equal(b.state.board[5],0);assert.equal(b.state.board[6],1);assert.equal(b.state.board[9],2);
  const c=R.applyMove(state([[0,0],[15,7]]),0,15);
  assert.equal(c.state.board[15],0);assert.equal(c.state.board[0],7);
});

test('录屏中的单片覆盖会拆开目标横向连块，并把被覆盖片换回源格', () => {
  const a=state([[0,4],[1,5],[10,0]]);
  const b=R.applyMove(a,10,0);
  assert.equal(b.ok,true);
  assert.equal(b.state.board[0],0);assert.equal(b.state.board[1],5);assert.equal(b.state.board[10],4);
  assert.deepEqual(R.groups(b.state.board).map(g=>g.length),[1,1,1]);
  assert.deepEqual(allTokens(b.state),allTokens(a));
});

test('源连块保持整体，覆盖目标的一部分后按新邻接重算连接', () => {
  const a=state([[0,0],[1,1],[8,8],[12,10]]);
  const b=R.applyMove(a,8,1);
  assert.equal(b.ok,true);
  assert.equal(b.state.board[0],0);assert.equal(b.state.board[8],1);
  assert.deepEqual(R.groups(b.state.board).find(g=>g.includes(1)),[1,5]);
  assert.deepEqual(allTokens(b.state),allTokens(a));
});

test('越界、同格与不合法坐标不改变状态', () => {
  const a=state([[0,0],[1,1],[10,8]]);
  for(const move of [[0,3],[1,12],[0,0],[-1,2],[0,16],[0,1.5],[null,1]]) {
    const out=R.applyMove(a,...move);assert.equal(out.ok,false);assert.equal(out.state,a);assert.deepEqual(out.events,[]);
  }
});

test('跨列融合组下落时保持刚体，不因其中一列空出就拆开', () => {
  const a=state([[8,0],[9,1],[12,2],[15,3],[5,4],[6,5],[10,8],[14,9]]);
  const b=R.applyMove(a,15,13);
  assert.equal(b.ok,true);assert.deepEqual(b.state.completed,[0]);
  assert.equal(b.state.board[5],4);assert.equal(b.state.board[6],5);
  assert.ok(R.joined(b.state.board,5,6));
});

test('一次交换可以同时拼完整两张照片并清空关卡', () => {
  const a=state([[0,0],[1,1],[4,2],[5,7],[2,4],[3,5],[6,6],[7,3]],2);
  const b=R.applyMove(a,5,7);
  assert.equal(b.ok,true);assert.deepEqual(b.events[1].photoIndices,[0,1]);
  assert.equal(R.isSolved(b.state),true);assert.deepEqual(allTokens(b.state),allTokens(a));
});

test('提示为四片齐全的照片提供有限步内可完成的合法动作', () => {
  let a=state([[0,0],[3,1],[12,2],[15,3]],1);
  for(let n=0;n<4&&!R.isSolved(a);n++) {
    const before=structuredClone(a),hint=R.findHint(a);
    assert.ok(hint);assert.deepEqual(a,before);
    const next=R.applyMove(a,hint.from,hint.to);assert.equal(next.ok,true);a=next.state;
  }
  assert.ok(R.isSolved(a));assert.equal(R.findHint(a),null);
  assert.equal(R.findHint(state([[0,0],[1,4]],2)),null);
});

test('移动到空格不会触发下落、发牌或无关棋子位移', () => {
  const a=state([[0,0],[8,7]],3);a.queues=[[1],[],[],[]];
  const b=R.applyMove(a,0,1);
  assert.deepEqual(b.events.map(e=>e.type),['move']);
  assert.equal(b.state.board[8],7);assert.deepEqual(b.state.queues,a.queues);
});

test('整图完成后先清空再下落与补牌，动画快照独立', () => {
  const a=state([[8,0],[9,1],[12,2],[15,3],[0,4],[4,6],[3,5],[7,7]],3);
  a.queues=[[8],[9],[10],[11]];
  const original=structuredClone(a),out=R.applyMove(a,15,13);
  assert.equal(out.ok,true);
  assert.deepEqual(out.events.slice(0,4).map(e=>e.type),['move','complete','fall','refill']);
  assert.deepEqual(out.events[1].photoIndices,[0]);
  assert.equal(out.events[1].after.board[8],-1);
  assert.equal(out.events[2].after.board[8],4);
  assert.equal(out.events[2].after.board[12],6);
  assert.equal(out.events[3].after.board[4],8);
  assert.deepEqual(allTokens(a),allTokens(out.state));
  assert.deepEqual(a,original);
  out.state.board[0]=999;
  assert.notEqual(out.events.at(-1).after.board[0],999);
});

test('云端复放拒绝非法轨迹与超长轨迹，不接受空伪造胜利', () => {
  const level={id:1,version:1,photoIds:['photo-01'],board:[0,1,-1,-1,2,-1,-1,3,...Array(8).fill(-1)],queues:emptyQueues()};
  const success=R.replay(level,[{from:7,to:5}]);
  assert.equal(success.ok,true);assert.equal(success.solved,true);assert.equal(success.state.moves,1);
  const invalid=R.replay(level,[{from:7,to:7}]);
  assert.equal(invalid.ok,false);assert.equal(invalid.failedAt,0);assert.equal(invalid.error,'INVALID_MOVE');
  assert.equal(R.replay(level,Array(2001).fill({from:7,to:5})).error,'TOO_MANY_MOVES');
  assert.equal(R.replay(level,[]).solved,false);
  assert.equal(R.isSolved({...success.state,photoCount:2}),false);
  assert.equal(R.isSolved({...success.state,completed:[]}),false);
  assert.equal(R.isSolved(null),false);assert.equal(R.isSolved({}),false);
});

test('八图回归布局可以按独立保存的操作序列完成', () => {
  const level={id:99,version:1,photoIds:Array.from({length:8},(_,i)=>'original-'+i),board:[8,0,1,9,2,4,7,3,18,5,6,19,10,16,17,11],queues:[[14,28,22,24],[21,12,13,26],[29,25,27,15,23],[30,20,31]]};
  const steps=[[1,0],[0,2],[13,4],[9,11],[10,14],[0,9],[1,13],[6,14],[6,13],[4,12],[6,1],[8,11],[11,2],[14,3]].map(([from,to])=>({from,to}));
  const out=R.replay(level,steps);
  assert.equal(out.ok,true);assert.equal(out.solved,true);assert.equal(out.state.completed.length,8);
});

test('暗片独立占格，主动移动当步显影并可立即完成整图', () => {
  const s = state([[0,0],[1,1],[4,2],[7,3]],1);
  s.hidden = [3];
  assert.equal(R.joined([2,3],0,1,s.hidden),false);
  const out = R.applyMove(s,7,5);
  assert.deepEqual(out.events.map(e => e.type),['move','reveal','complete']);
  assert.deepEqual(out.events[1].tokens,[3]);
  assert.deepEqual(out.events[0].after.hidden,[3]);
  assert.equal(out.state.moves,1);
  assert.ok(R.isSolved(out.state));
});

test('新接缝四邻的暗片顺带显影，既有接缝与对角线不触发', () => {
  const s = state([[0,0],[2,1],[4,2],[5,3],[10,8],[15,9]]);
  s.hidden = [3,8];
  const moved = R.applyMove(s,2,1);
  assert.deepEqual(moved.events.find(e => e.type === 'reveal').tokens,[3]);
  assert.deepEqual(moved.state.hidden,[8]);
  assert.deepEqual(R.applyMove(s,15,14).state.hidden,[3,8]);
});

test('定位钉阻止拖组和任意成员覆盖，拼完整图后释放', () => {
  const s = state([[0,0],[1,1],[4,2],[10,3],[15,8]]);
  s.pinned = [0];
  for (const [from,to] of [[1,2],[4,8],[15,0]]) {
    assert.equal(R.moveReason(s,from,to),'PINNED_BLOCKED');
    const result=R.applyMove(s,from,to);
    assert.equal(result.reason,'PINNED_BLOCKED');
    assert.equal(result.state,s);
  }
  const result=R.applyMove(s,10,5), completed=result.events.find(e=>e.type==='complete');
  assert.deepEqual(completed.unpinnedTokens,[0]);
  assert.deepEqual(result.state.pinned,[]);
  assert.deepEqual(completed.before.pinned,[0]);
});

test('其他图完成下落时，钉住的连块保持原位', () => {
  const s=state([[0,0],[1,1],[8,4],[9,5],[12,6],[15,7]]);
  s.pinned=[0];
  const result=R.applyMove(s,15,13);
  assert.deepEqual(result.state.completed,[1]);
  assert.equal(result.state.board[0],0);
  assert.equal(result.state.board[1],1);
  assert.deepEqual(result.state.pinned,[0]);
});

test('关卡拒绝无法容纳整图、重叠或重复锁定的钉位', () => {
  const board=[0,1,4,5,2,3,6,7,8,9,12,13,10,11,14,15];
  const level={id:1,version:4,board,photoIds:['a','b','c','d'],queues:emptyQueues()};
  assert.throws(()=>R.createState({...level,pinnedTokens:[0,1]}),/INVALID_LEVEL_PIN/);
  const wrong=board.slice();[wrong[0],wrong[15]]=[wrong[15],wrong[0]];
  assert.throws(()=>R.createState({...level,board:wrong,pinnedTokens:[0]}),/INVALID_LEVEL_PIN/);
  const overlap=board.slice();[overlap[1],overlap[2]]=[overlap[2],overlap[1]];
  assert.throws(()=>R.createState({...level,board:overlap,pinnedTokens:[0,4]}),/INVALID_LEVEL_PIN/);
  assert.throws(()=>R.createState({...level,pinnedTokens:[0],hiddenTokens:[0]}),/INVALID_LEVEL_MARKS/);
});
