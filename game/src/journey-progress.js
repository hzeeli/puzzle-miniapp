'use strict';

const Journey=require('../../shared/journey');
const Rules=require('../../shared/rules');

function highestCleared(data){
  const remote=data.rankAccount?.highestLevel;
  let highest=Number.isSafeInteger(remote)&&remote>0?remote:0;
  const records=data.journey?.story||{};
  while(records[highest+1])highest++;
  return highest;
}
function nextStory(data){
  return Journey.storySession(highestCleared(data)+1);
}
const INITIAL_TOOLS={breeze:3,focus:3,snap:2};
const MAX_TOOLS={breeze:9,focus:9,snap:6};
function tools(data){
  return data.tools||(data.tools={...INITIAL_TOOLS});
}
function reward(data,index){
  if(index%5!==0)return '';
  const stock=tools(data),gifts={breeze:2,focus:2,snap:index%10===0?1:0};
  let added=0;
  for(const [id,quantity] of Object.entries(gifts)){
    const delta=Math.min(quantity,Math.max(0,MAX_TOOLS[id]-stock[id]));
    stock[id]+=delta;added+=delta;
  }
  return added?'花园工具 +'+added:'';
}
function record(data,game,finished){
  const session=game.level.session;
  if(session?.mode!=='story'||!finished||!Rules.isSolved(game.state))return;
  const ledger=data.journey||(data.journey={});
  const entries=ledger.story||(ledger.story={});
  const old=entries[session.index];
  game.stars=Rules.starsFor(game.level,game.moves.length);
  game.pureClear=!(game.toolHistory||[]).length;
  const times=[old?.bestMs,game.completedMs].filter(ms=>Number.isFinite(ms)&&ms>=0);
  entries[session.index]={
    stars:Math.max(old?.stars||0,game.stars),
    bestMs:times.length?Math.min(...times):null,
    pure:!!old?.pure||game.pureClear
  };
  if(!old)game.rewardText=reward(data,session.index);
}
module.exports={highestCleared,nextStory,record,tools};
