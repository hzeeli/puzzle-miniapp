'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const esbuild=require('esbuild');
const Board=require('../game/src/board');
const Rules=require('../shared/rules');
const Journey=require('../shared/journey');
const {solve}=require('../scripts/generate-levels.cjs');
const {CanvasRecorder}=require('./helpers/canvas-recorder.cjs');
const root=path.resolve(__dirname,'..');
const compiled=esbuild.buildSync({entryPoints:[path.join(root,'game/src/app.js')],bundle:true,write:false,
  platform:'neutral',target:'es2018',format:'cjs'}).outputFiles[0].text;
const plain=value=>JSON.parse(JSON.stringify(value));
const nextTurn=()=>new Promise(resolve=>setImmediate(resolve));
const currentDate='2026-11-23';

function device(initial={}){
  let disk=plain(initial),online=true;
  const downloads=[];
  async function restart(){
    const c=new CanvasRecorder();
    let nextFrame;
    const wx={
      createCanvas:()=>({getContext:()=>c}),
      getWindowInfo:()=>({windowWidth:390,windowHeight:844,screenHeight:844,pixelRatio:1,statusBarHeight:44,safeArea:{bottom:810}}),
      getMenuButtonBoundingClientRect:()=>({bottom:60}),getStorageSync:()=>plain(disk),setStorageSync:(key,data)=>{disk=plain(data);},
      createImage:()=>({width:512,height:768,set src(value){
        this.id=value;
        if(fs.existsSync(path.join(root,'game',value)))this.onload();else this.onerror();
      }}),
      loadSubpackage:({name,success,fail})=>{downloads.push(name);if(online)success();else fail();},
      onTouchStart(){},onTouchMove(){},onTouchEnd(){},onTouchCancel(){},onHide(){},onShow(){},
      createInnerAudioContext:()=>({play(){},stop(){},pause(){}})
    };
    const context={module:{exports:{}},wx,requestAnimationFrame:fn=>{nextFrame=fn;},
      Date:class extends Date {static now(){return Date.parse(currentDate+'T03:00:00Z');}}};
    vm.runInNewContext(compiled,context);
    const app=new context.module.exports();await nextTurn();assert.equal(app.scene,'home');
    let tick=0;
    async function tap(id){
      c.paints=[];nextFrame(tick+=16);
      const hit=app.hits.find(h=>h.id===id);assert.ok(hit,'页面 '+app.scene+' 缺少入口 '+id);
      const x=hit.x+hit.w/2,y=hit.y+hit.h/2;
      app.down(x,y);app.up(x,y);await nextTurn();
    }
    function drag(move){
      const before=app.game.moves.length;
      const a=Board.center(app,move.from),b=Board.center(app,move.to);
      app.down(a.x,a.y);app.move(b.x,b.y);app.up(b.x,b.y);
      assert.equal(app.game.moves.length,before+1);
      while(app.game.stage)app.landed(app.game.stage);
    }
    return{app,tap,drag};
  }
  return{restart,downloads,setOnline:flag=>{online=flag;},saved:()=>plain(disk)};
}
test('首页首关、两步成图、直接进入第二关并从实际手势冷启动续玩',async()=>{
  const phone=device();let view=await phone.restart();
  await view.tap('play');assert.equal(view.app.scene,'level-intro');
  await view.tap('start-level');assert.equal(view.app.game.level.id,1);
  const moves=solve(view.app.game.state);assert.equal(moves.length,2);
  for(const move of moves)view.drag(move);
  assert.equal(view.app.scene,'result');assert.equal(phone.saved().journey.story[1].stars,3);
  const proof=phone.saved().storyProofs[1];assert.deepEqual(proof.moves,moves);
  await view.tap('next');assert.equal(view.app.scene,'game');assert.equal(view.app.game.level.id,2);
  view.drag(solve(view.app.game.state)[0]);const partial=plain(view.app.game.state);
  await view.tap('pause');await view.tap('exit-game');
  view=await phone.restart();await view.tap('play');
  assert.equal(view.app.scene,'game');assert.deepEqual(plain(view.app.game.state),partial);
  for(const move of solve(view.app.game.state))view.drag(move);
  assert.equal(view.app.scene,'result');assert.equal(phone.saved().journeyRuns.story,undefined);
  assert.deepEqual(Object.keys(phone.saved().storyProofs),['1','2']);
});

test('连过首期百关后，正常结算按钮直接进入第101关',async()=>{
  const progress=Object.fromEntries(Array.from({length:99},(_,i)=>[i+1,{stars:2,bestMs:45000}]));
  const phone=device({journey:{story:progress}});
  const view=await phone.restart();await view.tap('play');await view.tap('start-level');
  assert.equal(view.app.game.level.id,100);
  for(const move of solve(view.app.game.state))view.drag(move);
  assert.equal(view.app.scene,'result');await view.tap('next');
  assert.equal(view.app.scene,'game');assert.equal(view.app.game.level.id,101);
  assert.deepEqual(plain(view.app.game.level.session),Journey.storySession(101));
});

test('旧版主线在局按封存照片续玩，旧跳关记录不会越过未完成关',async()=>{
  const session=Journey.storySession(5,1),level=Journey.buildLevel(session);
  const move=solve(Rules.createState(level))[0],old={
    schemaVersion:2,journey:{story:{1:{stars:3},2:{stars:3},3:{stars:2},4:{stars:2},15:{stars:2}}},
    journeyRuns:{story:{session,moves:[move],startedAt:1700000000000},daily:{},free:{}},
    settings:{music:false}
  };
  const view=await device(old).restart();await view.tap('play');
  assert.equal(view.app.scene,'game');assert.equal(view.app.game.level.session.version,1);
  assert.deepEqual(plain(view.app.game.state),Rules.replay(level,[move]).state);
  for(const m of solve(view.app.game.state))view.drag(m);
  await view.tap('next');assert.equal(view.app.game.level.id,6);assert.equal(view.app.data.settings.music,false);
});

test('首次请求的微信子包断网失败，恢复网络后按界面重试并启动同一关',async()=>{
  const phone=device(),view=await phone.restart(),session=Journey.storySession(12);
  assert.ok(session.photoIds.some(id=>Number(id.slice(6))>12));
  phone.setOnline(false);await view.app.openSession(session);await nextTurn();
  await view.tap('start-level');assert.equal(view.app.scene,'error');
  assert.match(view.app.error,/下载失败/);assert.equal(phone.saved().journeyRuns,undefined);
  const failures=phone.downloads.length;assert.ok(failures>0);
  phone.setOnline(true);await view.tap('load-retry');
  assert.equal(view.app.scene,'game');assert.deepEqual(plain(view.app.game.level.session),session);
  assert.ok(phone.downloads.length>failures);
});

test('花园道具使用、重复点击禁用及冷启动重放，结算识别消耗过的局',async()=>{
  const phone=device(),session=Journey.storySession(57);
  let view=await phone.restart();await view.app.openSession(session);await view.app.beginSelected();
  await view.tap('garden-tools');await view.tap('use-focus');
  assert.equal(view.app.game.focus.until-Date.parse(currentDate+'T03:00:00Z'),5000);
  assert.equal(view.app.useGardenTool('focus'),false);
  await view.tap('garden-tools');
  assert.equal(view.app.useGardenTool('focus'),false);
  assert.equal(phone.saved().tools.focus,2);
  await view.tap('use-breeze');
  while(view.app.game.stage)view.app.landed(view.app.game.stage);
  assert.equal(view.app.game.moves.length,0);
  assert.equal(view.app.game.state.hidden.length,1);
  const afterWind=plain(view.app.game.state);
  await view.tap('garden-tools');await view.tap('use-snap');
  const saved=phone.saved(),slot=saved.journeyRuns.story;
  assert.equal(slot.moves.length,1);assert.equal(solve(afterWind).length>0,true);
  assert.deepEqual(slot.toolHistory,[{id:'focus',at:0},{id:'breeze',at:0},{id:'snap',at:0}]);
  assert.deepEqual(saved.tools,{breeze:2,focus:2,snap:1});
  assert.equal(view.app.useGardenTool('snap'),false);
  const expected=plain(view.app.game.state);
  view=await phone.restart();await view.app.resumeSession('story');
  assert.deepEqual(plain(view.app.game.state),expected);
  assert.equal(view.app.game.toolHistory.length,3);assert.equal(view.app.game.focus.until,slot.focus.until);
  await view.tap('garden-tools');
  assert.equal(view.app.useGardenTool('snap'),false);
  await view.tap('use-breeze');
  while(view.app.game.stage)view.app.landed(view.app.game.stage);
  await view.tap('garden-tools');assert.equal(view.app.useGardenTool('breeze'),false);
  assert.equal(phone.saved().tools.breeze,1);
  await view.tap('garden-tools-close');
  for(const move of solve(view.app.game.state))view.drag(move);
  assert.equal(view.app.scene,'result');
  assert.equal(phone.saved().journey.story[57].pure,false);
  assert.equal(view.app.game.pureClear,false);
});

test('旧竞速局拒绝道具，伪造的零步显影不能进入经典重放轨迹',async()=>{
  const classic=require('../shared/levels').getLevel(7,4),before=Rules.createState(classic);
  assert.equal(Rules.applyBreeze(before).ok,false);
  assert.equal(Rules.replay(classic,[{id:'breeze',at:0}]).ok,false);
});

test('轻风吹开第四片后零步触发整图、补牌与后继连消，源状态保持完整',()=>{
  const board=Array(16).fill(-1);
  [0,1,4,5].forEach((cell,i)=>board[cell]=i);
  const initial={levelId:11,version:5,photoCount:2,board,hidden:[0],pinned:[1],
    queues:[[6,4],[7,5],[],[]],moves:8,completed:[]};
  const before=plain(initial),out=Rules.applyBreeze(initial);
  assert.deepEqual(initial,before);
  assert.deepEqual(out.events.map(e=>e.type),['reveal','complete','refill','complete']);
  assert.deepEqual(out.events[1].unpinnedTokens,[1]);
  assert.equal(out.state.moves,8);assert.ok(Rules.isSolved(out.state));
});
