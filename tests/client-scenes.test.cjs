'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Scenes=require('../game/src/scenes');
const Rules=require('../shared/rules');
const {levels}=require('../shared/levels');
const Journey=require('../shared/journey');
function fixture(width=390,height=844){
  const texts=[],calls=[],scale=width/390,gradient={addColorStop(){}};
  const context=new Proxy({measureText:value=>({width:String(value).length*8}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,fillText:(value,x,y)=>texts.push({value:String(value),x,y}),strokeText(){},drawImage(){}},{get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>{target[key]=value;return true;}});
  const image={width:512,height:768},assets={get:()=>image,loadAvatar:async()=>null,loadAll:async()=>{}};
  const state=Rules.createState(levels[0]);
  const app={h:height/scale,top:60/scale,bottom:20/scale,scale,assets,scene:'home',now:1,scroll:0,maxScroll:0,hits:[],pressed:null,modal:null,data:{profile:{},settings:{sound:true,music:false,haptic:true,reduceMotion:false}},cloudStatus:'local',profile:null,pendingSync:null,wechatProfileReady:false,wechatProfileLoading:false,deleting:false,rank:{levelId:1,entries:[],ownBest:null},selectedLevel:levels[0],game:{level:levels[0],state,visual:state,stage:null,drag:null,fusions:[],moves:[]},result:{localMs:12345,cloud:null,error:null,syncing:false},elapsed:()=>12345,hit(id,x,y,w,h,fn){if(this.clip){const a=Math.max(y,this.clip.top),b=Math.min(y+h,this.clip.bottom);if(b<=a)return;y=a;h=b-a;}this.hits.push({id,x,y,w,h,fn});},navigate(scene){this.scene=scene;},connectCloud:async()=>{calls.push(['connect']);return true;},openPrivacy:()=>calls.push(['privacy']),prepareWechatProfile:()=>calls.push(['wechat']),audio:{sync(){}},save(){},saveRun(){},hint(){},notify(){},syncResult(){},deleteAccount(){}};
  Object.assign(app,{beginSelected:()=>calls.push(['start',app.selectedLevel.id]),openSession:session=>calls.push(['session',session.index]),resumeSession:mode=>calls.push(['resume',mode]),verifyRankLevel:n=>calls.push(['verify',n]),startNextLevel:()=>calls.push(['next']),restartLevel:()=>calls.push(['restart']),showLeaderboard:()=>calls.push(['rank'])});
  function draw(){app.hits=[];texts.length=0;Scenes.draw(app,context);}
  return{app,texts,calls,draw};
}

test('六个页面使用真实关卡数据绘制，未获取资料时不出现预设选择器',()=>{
  const s=fixture();s.app.game.state={...s.app.game.state,completed:[0]};
  for(const scene of ['home','level-intro','game','result','leaderboard','profile']){s.app.scene=scene;assert.doesNotThrow(s.draw);assert.ok(s.app.hits.length>0);}
  assert.ok(s.app.hits.some(hit=>hit.id==='wechat-profile'));
  assert.ok(!s.app.hits.some(hit=>hit.id.startsWith('avatar-')||hit.id.startsWith('nickname-')));
  assert.ok(!s.texts.some(text=>text.value==='拼图旅人'));
});

test('关卡准备和棋盘显示所选关号、照片和实际机制',()=>{
  const s=fixture();
  for(const index of [1,10,28,57]){
    const level=Journey.buildLevel(Journey.storySession(index));
    s.app.scene='level-intro';s.app.selectedLevel=level;s.draw();
    assert.ok(s.texts.some(t=>t.value==='第 '+index+' 关'));
    const detail=s.texts.find(t=>t.value.includes(level.photoIds.length+' 张照片'));
    assert.ok(detail);if(level.hiddenTokens.length)assert.match(detail.value,/晨雾云片/);
    if(level.pinnedTokens.length)assert.match(detail.value,/雏菊花扣/);
    s.app.hits.find(h=>h.id==='start-level').fn();assert.deepEqual(s.calls.pop(),['start',level.id]);
    const state=Rules.createState(level);
    Object.assign(s.app.game,{level,state,visual:state,moves:[{from:1,to:3}]});
    s.app.scene='game';s.draw();
    assert.ok(s.texts.some(t=>t.value==='0/'+level.photoIds.length));
    assert.ok(s.texts.some(t=>t.value.includes('1 步')));
    assert.ok(s.app.hits.some(h=>h.id==='game-photos'));
  }
});

test('首页只通过当前关、闯关榜和个人档案导航，旧模式存档不会增加入口',()=>{
  const s=fixture();s.app.data.run={levelId:3};s.app.data.journeyRuns={daily:{},free:{}};
  s.draw();assert.deepEqual(s.app.hits.map(h=>h.id),['play','home-ranks','home-profile']);
  s.app.hits[0].fn();assert.deepEqual(s.calls.pop(),['session',1]);
  s.app.data.journeyRuns.story={session:Journey.storySession(11)};
  s.draw();s.app.hits[0].fn();assert.deepEqual(s.calls.pop(),['resume','story']);
  assert.ok(s.texts.some(t=>t.value==='继续第 11 关'));
  s.app.hits.find(h=>h.id==='home-ranks').fn();assert.deepEqual(s.calls.pop(),['rank']);
});

test('闯关榜使用真实全局进度，未连接、补验、空榜与故障各有可达操作',async()=>{
  const s=fixture();s.app.scene='leaderboard';s.draw();
  await s.app.hits.find(h=>h.id==='rank-login').fn();
  assert.deepEqual(s.calls.splice(0),[['connect'],['rank']]);
  s.app.profile={id:'self'};s.draw();
  s.app.hits.find(h=>h.id==='rank-challenge').fn();assert.deepEqual(s.calls.pop(),['session',1]);
  s.app.rank.error='连接中断，请重试';s.draw();
  s.app.hits.find(h=>h.id==='rank-retry').fn();assert.deepEqual(s.calls.pop(),['rank']);
  s.app.rank={entries:[{nickname:'小花',rank:1,levelId:132}],ownBest:{rank:25,levelId:77},verifyLevel:78};s.draw();
  assert.ok(s.texts.some(t=>t.value==='已通 132 关'));
  assert.ok(s.texts.some(t=>t.value==='第 25 名 · 已通 77 关'));
  assert.ok(s.texts.some(t=>t.value.includes('重新通关即可上榜')));assert.ok(s.texts.some(t=>/先获验证.*花园工具/.test(t.value)));
  s.app.hits.find(h=>h.id==='rank-verify').fn();assert.deepEqual(s.calls.pop(),['verify',78]);
  s.app.rank.syncError='网络中断';s.draw();s.app.hits.find(h=>h.id==='rank-resync').fn();assert.deepEqual(s.calls.pop(),['rank']);
  s.app.rank.loading=true;s.draw();assert.ok(s.texts.some(t=>t.value.includes('正在读取')));
  assert.deepEqual(s.app.hits.map(h=>h.id),['back']);
});

test('我的四个独立设置可切换，减弱动态立即保存',()=>{
  const s=fixture();s.app.scene='profile';
  s.app.save=()=>s.calls.push(['save']);
  for(const key of ['sound','music','haptic','reduceMotion']){
    const before=s.app.data.settings[key];s.draw();
    s.app.hits.find(h=>h.id==='setting-'+key).fn();
    assert.equal(s.app.data.settings[key],!before);assert.deepEqual(s.calls.pop(),['save']);
  }
});

test('隐私打开失败保留原弹窗，界面展示失败及原链接重试',()=>{
  const s=fixture();const modal={type:'privacy',privacyError:'打开失败',resolve(){}};s.app.modal=modal;s.draw();
  assert.ok(s.texts.some(text=>text.value==='重试打开隐私指引'));assert.ok(s.texts.some(text=>text.value==='打开失败，请重试'));
  s.app.hits.find(hit=>hit.id==='privacy-contract').fn();assert.deepEqual(s.calls,[['privacy']]);assert.equal(s.app.modal,modal);
});

test('微信原生授权按钮只在资料页可见区域存在，弹窗和离页都会销毁',()=>{
  const s=fixture();let created=0,destroyed=0,moved=0;s.app.scene='profile';s.app.wechatProfileReady=true;
  s.app.createWechatProfileButton=()=>{created++;return{show(){},setRect(){moved++;},destroy(){destroyed++;}};};
  s.draw();s.draw();assert.equal(created,1);assert.equal(moved,0);assert.ok(s.texts.some(text=>text.value==='继续微信授权'));
  s.app.modal={type:'privacy-info'};s.draw();assert.equal(destroyed,1);assert.equal(s.app.profileNativeControl,null);
  s.app.modal=null;s.draw();assert.equal(created,2);s.app.scene='home';s.draw();assert.equal(destroyed,2);
});

test('短屏与长屏主游戏按钮不被胶囊区、棋盘或底部安全区遮挡',()=>{
  for(const [width,height]of[[375,667],[390,844],[430,932]]){const s=fixture(width,height);s.app.scene='game';s.draw();for(const hit of s.app.hits){assert.ok(hit.y>=s.app.top-7,hit.id);assert.ok(hit.y+hit.h<=s.app.h-s.app.bottom+1,hit.id);}}
});
