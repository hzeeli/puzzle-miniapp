'use strict';
const Rules=require('./rules');
const TOOL_LIMITS={breeze:2,focus:2,snap:1};
function focusPhoto(state){
  const counts=new Map();
  for(const token of state.board){
    if(token<0||state.hidden.includes(token))continue;
    const index=Math.floor(token/4);
    counts.set(index,(counts.get(index)||0)+1);
  }
  for(const [index,count] of counts)if(count===4)return index;
  return null;
}
// 普通拖拽轨迹保留原格式，道具在对应步数之前发生。
function replay(level,moves,history=[]){
  if(level?.version!==5||level.session?.mode!=='story'||!Array.isArray(moves)||moves.length>Rules.MAX_MOVES||!Array.isArray(history)||history.length>5)return {ok:false};
  if(!history.length)return Rules.replay(level,moves);
  let state=Rules.createState(level),cursor=0;
  const used={breeze:0,focus:0,snap:0};
  for(let at=0;at<=moves.length;at++){
    while(cursor<history.length&&history[cursor]?.at===at){
      const {id}=history[cursor++];
      if(typeof id!=='string'||!Object.prototype.hasOwnProperty.call(TOOL_LIMITS,id)||++used[id]>TOOL_LIMITS[id]||Rules.isSolved(state))return {ok:false};
      if(id==='breeze'){
        const turn=Rules.applyBreeze(state);if(!turn.ok)return {ok:false};
        state=turn.state;
      }else if(id==='snap'){
        const expected=Rules.findHint(state),m=moves[at];
        if(history[cursor]?.at===at||!m||!expected||expected.from!==m.from||expected.to!==m.to)return {ok:false};
      }else if(focusPhoto(state)===null)return {ok:false};
    }
    if(at===moves.length)break;
    const m=moves[at];if(!m)return {ok:false};
    const turn=Rules.applyMove(state,m.from,m.to);if(!turn.ok)return {ok:false};
    state=turn.state;
  }
  return {ok:cursor===history.length,state,solved:Rules.isSolved(state)};
}
module.exports={replay,focusPhoto,TOOL_LIMITS};
