const Rules=require('../../shared/rules');
const Journal=require('./journey-progress');
const {replay,focusPhoto,TOOL_LIMITS}=require('../../shared/story-replay');

const items=[
  {id:'breeze',name:'轻风拂雾',detail:'吹散最多两张晨雾，不计步数',limit:TOOL_LIMITS.breeze,col:'#d8edca'},
  {id:'focus',name:'露珠定位',detail:'照亮同一张图的四片，持续五秒',limit:TOOL_LIMITS.focus,col:'#d5edf3'},
  {id:'snap',name:'花瓣归位',detail:'自动放好一组，计入一步',limit:TOOL_LIMITS.snap,col:'#f7d9d6'}
];
function local(level){
  return level?.version===5&&level.session?.mode==='story';
}
function available(game,item,stock){
  if(!local(game.level)||game.ranked||game.run||game.persisted||game.stage||Rules.isSolved(game.state))return '暂不可用';
  if((game.toolHistory||[]).filter(h=>h.id===item.id).length>=item.limit)return '本局已用完';
  if(!stock[item.id])return '库存不足';
  if(item.id==='breeze'&&!game.state.hidden.some(t=>game.state.board.includes(t)))return '场上没有晨雾';
  if(item.id==='focus'){
    if(game.focus?.until>Date.now())return '正在照亮';
    if(focusPhoto(game.state)===null)return '还没有齐全的四片';
  }
  if(item.id==='snap'&&game.state.moves>=Rules.MAX_MOVES)return '步数已达上限';
  return '';
}

function use(app,id){
  const g=app.game,item=items.find(i=>i.id===id);
  if(!g||!item||app.scene!=='game'||app.modal?.type!=='garden-tools'||!local(g.level)||g.ranked||g.run)return false;
  const stock=Journal.tools(app.data),reason=available(g,item,stock);
  if(reason){app.notify(reason);return false;}
  let move,turn;
  if(id==='snap'){
    move=Rules.findHint(g.state);if(!move)return false;
    turn=Rules.applyMove(g.state,move.from,move.to);
  }else if(id==='breeze')turn=Rules.applyBreeze(g.state);
  if(turn&&!turn.ok)return false;
  if(!g.toolHistory)g.toolHistory=[];
  g.toolHistory.push({id,at:g.moves.length});
  stock[id]--;app.modal=null;
  if(move)g.moves.push({from:move.from,to:move.to});
  if(turn)app.presentTurn(turn);
  else{
    g.focus={photo:focusPhoto(g.state),until:Date.now()+5000};
    app.audio.play('reveal');app.saveRun();
  }
  return true;
}

module.exports={items,local,available,use,replay};
