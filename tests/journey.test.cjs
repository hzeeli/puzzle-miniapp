'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const J=require('../shared/journey');
const Progress=require('../game/src/journey-progress');
const R=require('../shared/rules');
const {solve}=require('../scripts/generate-levels.cjs');

function finish(index,ms=45000,version=J.STORY_VERSION){
  const level=J.buildLevel(J.storySession(index,version)),initial=R.createState(level);
  const moves=solve(initial);
  assert.ok(moves,'未找到参考解，第 '+index+' 关');
  const replay=R.replay(level,moves);
  assert.ok(replay.solved,'重放失败，第 '+index+' 关');
  return {level,moves,state:replay.state,completedMs:ms};
}

test('一期百关每关独立可解，分段均值上升且各段都有相邻平关和缓冲',()=>{
  assert.equal(J.FIRST_RELEASE_COUNT,100);
  const boards=new Set(),steps=[];
  for(let i=1;i<=100;i++){
    const game=finish(i),{level,moves}=game;
    boards.add(level.board.join(','));
    assert.equal(level.difficulty.verifiedMoves,moves.length);
    assert.ok(level.goldMoves>=moves.length&&level.parMoves>=level.goldMoves);
    assert.equal(R.starsFor(level,moves.length),3);
    steps.push(moves.length);
    if(i===1){
      assert.equal(moves.length,2);
      assert.equal(R.applyMove(R.createState(level),moves[0].from,moves[0].to).state.completed.length,2);
    }
  }
  assert.equal(boards.size,100);
  const averages=Array.from({length:10},(_,i)=>steps.slice(i*10,i*10+10).reduce((a,b)=>a+b,0)/10);
  assert.deepEqual(averages,[6.3,8.2,12.4,13.7,15.5,16.8,17.9,18.9,19.2,20.1]);
  assert.ok(steps.filter((n,i)=>i>0&&n===steps[i-1]).length>=10);
  assert.ok(steps.filter((n,i)=>i>0&&n<steps[i-1]).length>=25);
});

test('补牌和双扣晨雾首次出现时留出练习区间，阶段大峰之后回缓',()=>{
  for(let i=21;i<=25;i++){
    const level=J.buildLevel(J.storySession(i));
    assert.equal(level.photoIds.length,6);
    assert.deepEqual(level.hiddenTokens,[]);assert.deepEqual(level.pinnedTokens,[]);
    assert.equal(level.queues.flat().length,8);
  }
  assert.equal(J.buildLevel(J.storySession(26)).photoIds.length,8);
  assert.deepEqual([81,87,88,100,101].map(i=>finish(i).moves.length),[18,23,14,21,11]);
});

test('成熟带1152个种子逐关独立重放并按实测路径给星，换轮后改变布局次序',()=>{
  const layouts=new Set();
  for(let i=101;i<=1252;i++){
    const {level,moves}=finish(i);
    layouts.add(level.board.join(','));
    assert.equal(level.difficulty.verifiedMoves,moves.length);
    assert.equal(level.goldMoves,Math.ceil(moves.length*1.2));
    assert.equal(level.parMoves,Math.ceil(moves.length*1.6));
  }
  assert.equal(layouts.size,1152);
  for(let i=1253;i<1277;i++){
    assert.notEqual(J.storySession(i).seed,J.storySession(i-1152).seed);
    assert.notEqual(J.storySession(i).seed,J.storySession(i-24).seed);
  }
});

test('主线从首关到第1000关，前108个图片位无重复，每关跨题材并避开此前七关',()=>{
  const recent=[],first=[];
  for(let i=1;i<=1000;i++){
    const {photoIds}=J.storySession(i);
    if(first.length<108)first.push(...photoIds);
    assert.equal(new Set(photoIds).size,photoIds.length);
    assert.equal(new Set(photoIds.map(id=>Math.floor((Number(id.slice(6))-1)/12))).size,photoIds.length);
    assert.ok(photoIds.every(id=>!recent.some(batch=>batch.includes(id))),String(i));
    recent.push(photoIds);
    if(recent.length>7)recent.shift();
  }
  assert.equal(new Set(first.slice(0,108)).size,108);
});

test('第101关直接获得新的可解棋面，循环边界、远期关号均可直接寻址重建',()=>{
  const boards=new Set();
  for(const i of [99,100,101,105,112,123,124,125,126,148,149,200,500,1000,100000]){
    const {level}=finish(i);
    assert.equal(level.id,i);
    assert.equal(level.title,'第 '+i+' 关');
    const stored=JSON.parse(JSON.stringify(level.session));
    assert.deepEqual(J.buildLevel(stored),level);
    if(i>100)boards.add(level.board.join(','));
  }
  assert.equal(boards.size,13);
  for(const index of [0,-3,1.5,'100',Infinity,Number.MAX_SAFE_INTEGER])assert.throws(()=>J.storySession(index));
});

test('2.0 已保存的60个旧主线会话可原样续玩，记录版本和关号参与校验',()=>{
  const hash=createHash('sha256');
  for(let i=1;i<=60;i++){
    const {level}=finish(i,45000,1),s=level.session;
    hash.update(JSON.stringify([level.id,level.version,s.templateId,s.seed,level.photoIds,level.board,
      level.queues,level.hiddenTokens,level.pinnedTokens,level.goldMoves,level.parMoves]));
  }
  assert.equal(hash.digest('hex'),'38ceda42eb880c79d97bca4ac7a3c18217095ba2d33a5bf8e16f9849b26decb4');
  const s=J.storySession(26,1);
  assert.throws(()=>J.storySession(61,1));
  for(const invalid of [{mode:'daily'},{mode:'free'},{version:40},{generatorVersion:-1},{index:3},{seed:'abc'},{photoIds:['photo-999']}]){
    assert.throws(()=>J.buildLevel({...s,...invalid}));
  }
});

test('连续关号与旧跳关记录共存，云端确认进度可跨设备续玩且不填充本机成绩',()=>{
  const data={journey:{story:{2:{stars:1,bestMs:39000},5:{stars:3,bestMs:30000}}}};
  assert.equal(Progress.highestCleared(data),0);assert.equal(Progress.nextStory(data).index,1);
  const game=finish(1,43000,1);Progress.record(data,game,true);
  assert.equal(Progress.nextStory(data).index,3);
  data.rankAccount={highestLevel:4};
  assert.equal(Progress.highestCleared(data),5);
  assert.equal(Progress.nextStory(data).index,6);
  assert.equal(data.journey.story[3],undefined);
  assert.equal(Progress.nextStory({rankAccount:{highestLevel:100}}).index,101);
});

test('半局不记通关；主线道具定期补给，同关重复结算保留最好成绩且只补给一次',()=>{
  const data={},g=finish(5,49000),stock=Progress.tools(data);
  assert.deepEqual(stock,{breeze:3,focus:3,snap:2});
  Progress.record(data,{...g,state:R.createState(g.level)},true);
  assert.equal(data.journey,undefined);
  g.toolHistory=[{id:'focus',at:2}];
  Progress.record(data,g,true);Progress.record(data,g,true);
  assert.deepEqual(stock,{breeze:5,focus:5,snap:2});
  const replay=finish(5,61000);Progress.record(data,replay,true);
  assert.equal(data.journey.story[5].bestMs,49000);assert.equal(data.journey.story[5].pure,true);
  assert.equal(replay.rewardText,undefined);
  for(const index of [10,15,20,30,40,50,60])Progress.record(data,finish(index),true);
  assert.deepEqual(stock,{breeze:9,focus:9,snap:6});
  assert.equal(data.journey.weeks,undefined);
  assert.equal(data.galleryUnlocked,undefined);
});
