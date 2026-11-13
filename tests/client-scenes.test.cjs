'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Scenes=require('../game/src/scenes');
const Rules=require('../shared/rules');
const {levels}=require('../shared/levels');
function fixture(width=390,height=844){
  const texts=[],calls=[],scale=width/390,gradient={addColorStop(){}};
  const context=new Proxy({measureText:value=>({width:String(value).length*8}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,fillText:(value,x,y)=>texts.push({value:String(value),x,y}),strokeText(){},drawImage(){}},{get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>{target[key]=value;return true;}});
  const image={width:512,height:768},assets={get:()=>image,loadAvatar:async()=>null,loadAll:async()=>{}};
  const state=Rules.createState(levels[0]);
  const app={h:height/scale,top:60/scale,bottom:20/scale,scale,assets,scene:'home',now:1,scroll:0,maxScroll:0,hits:[],pressed:null,modal:null,data:{best:{},profile:{},settings:{sound:true,music:false,haptic:true}},cloudBest:{},cloudStatus:'local',profile:null,pendingSync:null,wechatProfileReady:false,wechatProfileLoading:false,deleting:false,rank:{levelId:1,entries:[],ownBest:null},selectedLevel:levels[0],game:{level:levels[0],state,visual:state,stage:null,drag:null,fusions:[],moves:[]},result:{localMs:12345,cloud:null,error:null,syncing:false},elapsed:()=>12345,hit(id,x,y,w,h,fn){if(this.clip){const a=Math.max(y,this.clip.top),b=Math.min(y+h,this.clip.bottom);if(b<=a)return;y=a;h=b-a;}this.hits.push({id,x,y,w,h,fn});},navigate(scene){this.scene=scene;},chooseLevel:id=>calls.push(['level',id]),startLevel:id=>calls.push(['start',id]),showLeaderboard:id=>calls.push(['rank',id]),connectCloud:async()=>{calls.push(['connect']);return true;},retryPendingResult:()=>calls.push(['retry-pending']),resume:()=>calls.push(['resume']),openPrivacy:()=>calls.push(['privacy']),prepareWechatProfile:()=>calls.push(['wechat']),audio:{sync(){}},save(){},saveRun(){},hint(){},notify(){},syncResult(){},deleteAccount(){}};
  function draw(){app.hits=[];texts.length=0;Scenes.draw(app,context);}
  return{app,texts,calls,draw};
}

test('七个页面使用真实关卡数据绘制，未获取资料时不出现预设选择器',()=>{
  const s=fixture();s.app.game.state={...s.app.game.state,completed:[0]};
  for(const scene of ['home','levels','level-intro','game','result','leaderboard','profile']){s.app.scene=scene;assert.doesNotThrow(s.draw);assert.ok(s.app.hits.length>0);}
  assert.ok(s.app.hits.some(hit=>hit.id==='wechat-profile'));
  assert.ok(!s.app.hits.some(hit=>hit.id.startsWith('avatar-')||hit.id.startsWith('nickname-')));
  assert.ok(!s.texts.some(text=>text.value==='拼图旅人'));
});

test('准备页照片数和游戏完成数来自关卡，不硬编码设计图的八张与三张',()=>{
  const s=fixture();s.app.scene='level-intro';s.draw();assert.ok(s.texts.some(text=>text.value===levels[0].photoIds.length+' 张'));
  s.app.scene='game';s.draw();assert.ok(s.texts.some(text=>text.value==='0/'+levels[0].photoIds.length));
  assert.ok(!s.texts.some(text=>text.value.includes('拖动碎片')));
});

test('首页待同步按钮只重试旧成绩，不替换正在进行的本地局',()=>{
  const s=fixture();s.app.data.pendingResult={run:{runId:'pending'}};s.app.data.run={levelId:2};const active=s.app.game;s.draw();
  s.app.hits.find(hit=>hit.id==='cloud-state').fn();assert.deepEqual(s.calls,[['retry-pending']]);assert.equal(s.app.game,active);assert.equal(s.app.scene,'home');
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
