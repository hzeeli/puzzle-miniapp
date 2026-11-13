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
