'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Scenes=require('../game/src/scenes');
const U=require('../game/src/ui');
const Board=require('../game/src/board');
const Journey=require('../shared/journey');
const R=require('../shared/rules');
const levels=Array.from({length:12},(_,i)=>Journey.buildLevel(Journey.storySession(i+1)));
const {CanvasRecorder,intersect,union}=require('./helpers/canvas-recorder.cjs');
const devices=[[320,568],[360,800],[375,667],[390,844],[412,915],[430,932]];
const names=['👩🏽‍🎨爱拼图的旅行者和她的小伙伴','全家一起拼图👨‍👩‍👧‍👦🇨🇳','A very long WeChat nickname ✨','咖啡e\u0301与照片收藏者'];
const originalButton=U.button;
U.button=(c,app,id,label,x,y,w,h,...args)=>{
  const previous=c.owner;c.owner=id;
  c.record({kind:'button'},c.rectBounds(x,y,w,h));
  try{return originalButton(c,app,id,label,x,y,w,h,...args);}finally{c.owner=previous;}
};
function fixture(width,height,safeTop,safeBottom){
  const c=new CanvasRecorder(),scale=width/390,images=new Map(),native=[];
  const assets={get(id){if(!images.has(id)){const dimensions=id==='controls-atlas'?[768,768]:id==='brand-logo'?[640,220]:id.startsWith('bg-')?[512,1024]:[512,768];images.set(id,{id,width:dimensions[0],height:dimensions[1]});}return images.get(id);},loadAll:async()=>{}};
  const state=R.createState(levels[3]);
  const app={h:height/scale,top:safeTop/scale,bottom:safeBottom/scale,scale,assets,scene:'home',now:1,scroll:0,hits:[],modal:null,data:{profile:{},settings:{sound:true,music:false,haptic:true,reduceMotion:false}},cloudStatus:'local',profile:null,pendingSync:null,deleting:false,wechatProfileReady:false,wechatProfileLoading:false,selectedLevel:levels[0],rank:{entries:[],ownBest:null},game:{level:levels[3],state,visual:state,stage:null,drag:null,fusions:[],moves:[]},result:{localMs:123456,cloud:null,error:null,syncing:false},elapsed:()=>36500,avatarFor:()=>null,hit(id,x,y,w,h,fn){if(this.clip){const a=Math.max(y,this.clip.top),b=Math.min(y+h,this.clip.bottom);if(b<=a)return;y=a;h=b-a;}this.hits.push({id,x,y,w,h,fn});},createWechatProfileButton(rect){native.push({id:'native-wechat',...rect});return{show(){},destroy(){native.length=0;},setRect(r){native[0]={id:'native-wechat',...r};}};},navigate(scene){this.scene=scene;},showLeaderboard(){},startNextLevel(){},connectCloud(){},openPrivacy(){},prepareWechatProfile(){},saveRun(){},save(){},hint(){},syncResult(){},deleteAccount(){},notify(){},audio:{sync(){}}};
  return{app,c,native,draw(){app.hits=[];c.paints=[];Scenes.draw(app,c);}};
}
function assertScene(s,label){
  const {app,c}=s,buttons=app.hits.concat(s.native),end=app.h-app.bottom;
  for(const rect of buttons){assert.ok(rect.x>=-.01&&rect.x+rect.w<=390.01,`${label}: ${rect.id}超出横向画布`);assert.ok(rect.y>=app.top-.01&&rect.y+rect.h<=end+.01,`${label}: ${rect.id}侵入安全区 ${JSON.stringify(rect)}`);}
  for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++)assert.equal(intersect(buttons[i],buttons[j]),null,`${label}: ${buttons[i].id}与${buttons[j].id}点击区重叠`);
  const layer=app.modal?c.paints.findLastIndex(p=>p.kind==='fill'&&p.rect.x<=0&&p.rect.y<=0&&p.rect.w>=390&&p.rect.h>=app.h):0,paints=c.paints.slice(Math.max(0,layer));
  const primary=paints.filter(p=>p.kind==='button');
  for(const text of paints.filter(p=>p.kind==='text')){
    assert.ok(text.rect.x>=-.5&&text.rect.x+text.rect.w<=390.5,`${label}: 文字横向溢出 ${text.value}`);
    for(const plate of primary)if(text.owner!==plate.owner)assert.equal(intersect(text.rect,plate.rect),null,`${label}: ${text.value}被${plate.owner}按钮覆盖`);
  }
  for(const image of paints.filter(p=>p.kind==='image'&&p.id.startsWith('photo-'))){const source=image.source[2]/image.source[3],display=image.displayW/image.displayH;assert.ok(Math.abs(display/source-1)<.008,`${label}: 照片被压扁`);}
}
const scenarios={
  '首页开始':s=>{},
  '首页续玩':s=>{s.app.data.journeyRuns={story:{session:Journey.storySession(5)}};s.app.data.run={levelId:8,version:3};},
  '首页有旧模式快照':s=>{s.app.data.run={levelId:2};s.app.data.pendingResult={levelId:5};s.app.data.journeyRuns={free:{},daily:{}};},
  '准备4图':s=>{s.app.scene='level-intro';s.app.selectedLevel=levels[0];},
  '准备6图定锚':s=>{s.app.scene='level-intro';s.app.selectedLevel=Journey.buildLevel(Journey.storySession(31));},
  '准备8图':s=>{s.app.scene='level-intro';s.app.selectedLevel=Journey.buildLevel(Journey.storySession(21));},
  '游戏有库存':s=>{s.app.scene='game';},
  '游戏无库存':s=>{s.app.scene='game';const state=R.createState(levels[0]);Object.assign(s.app.game,{level:levels[0],state,visual:state});},
  '游戏显影定锚':s=>{s.app.scene='game';const level=Journey.buildLevel(Journey.storySession(100)),state=R.createState(level);Object.assign(s.app.game,{level,state,visual:state});},
  '游戏原图弹窗':s=>{s.app.scene='game';s.app.modal={type:'photos',photoIds:levels[3].photoIds};},
  '排行榜未连接':s=>{s.app.scene='leaderboard';},
  '排行榜空榜':s=>{s.app.scene='leaderboard';s.app.profile={id:'self'};},
  '排行榜错误重试':s=>{s.app.scene='leaderboard';s.app.profile={id:'self'};s.app.rank.error='网络暂不可用';},
  '结算待同步长状态':s=>{s.app.scene='result';s.app.game.state={...s.app.game.state,completed:[0,1,2,3]};s.app.result.error='网络连接失败，成绩已经保存在本机，请恢复网络后再次同步';},
  '结算失效长状态':s=>{s.app.scene='result';s.app.game.state={...s.app.game.state,completed:[0,1,2,3]};s.app.result.notice='这次排名挑战已超过二十四小时，此次成绩已经保存在本机，你可以重新挑战';},
  '排行榜10人':s=>{s.app.scene='leaderboard';s.app.profile={id:'self'};s.app.rank.entries=levels.slice(0,10).map((l,i)=>({id:'test-'+i,rank:i+1,nickname:names[i%names.length],avatarUrl:'',profileSource:'wechat',levelId:200-i*3,isSelf:i===7}));s.app.rank.ownBest={levelId:179,rank:8};},
  '排行榜旧档待补验':s=>{s.app.scene='leaderboard';s.app.profile={id:'self'};s.app.rank.verifyLevel=99;},
  '我的长昵称和原生按钮':s=>{s.app.scene='profile';s.app.wechatProfileReady=true;s.app.profile=s.app.data.profile={nickname:names.join(''),avatarUrl:'',profileSource:'wechat'};},
  '我的授权错误':s=>{s.app.scene='profile';s.app.wechatProfileError='未授权头像昵称';},
  '删除资料确认':s=>{s.app.scene='profile';s.app.modal={type:'delete'};},
  '分包断网重试':s=>{s.app.scene='error';s.app.error='照片未下载，请恢复网络后重试';},
  '花园工具':s=>{s.app.scene='game';s.app.modal={type:'garden-tools'};},
  '排行待补交':s=>{s.app.scene='leaderboard';s.app.profile={id:'self'};s.app.rank.syncError='进度尚未同步';},
  '暂停':s=>{s.app.scene='game';s.app.modal={type:'pause'};},
  '隐私错误':s=>{s.app.modal={type:'privacy',privacyError:'打开失败',resolve(){}};},
  '隐私说明错误':s=>{s.app.modal={type:'privacy-info',privacyError:'打开失败'};}
};
for(const [width,height]of devices)test(`${width}×${height}各安全区下的关键页面与状态不遮挡`,()=>{
  for(const top of [54,76,88])for(const bottom of [0,24,34])for(const [name,setup]of Object.entries(scenarios)){
    const s=fixture(width,height,top,bottom);setup(s);s.draw();const label=`${width}×${height}/${top}/${bottom}/${name}`;assertScene(s,label);
    if(name.startsWith('首页')){
      const cta=s.app.hits.find(h=>h.id==='play');
      const title=s.c.paints.find(p=>p.kind==='text'&&p.owner==='play');
      const nav=['home-ranks','home-profile'].map(id=>s.app.hits.find(h=>h.id===id));
      assert.deepEqual(s.app.hits.map(h=>h.id),['play','home-ranks','home-profile']);
      const images=s.c.paints.filter(p=>p.kind==='image'&&p.id.startsWith('photo-'));
      const poster=union(images.map(p=>p.rect));
      assert.ok(poster.y+poster.h<cta.y-6,label+' 首页照片遮挡主按钮');
      assert.ok(nav.every(h=>h&&cta.y+cta.h<h.y),label+' 主按钮遮挡榜单或我的');
      if(name==='首页续玩')assert.match(title.value,/继续.*5.*关/);
    }
    if(s.app.scene==='game'&&!s.app.modal){
      const b=Board.layout(s.app);
      const board={x:b.x,y:b.y,w:b.w*4,h:b.h*4};
      for(const id of ['hint','game-photos','garden-tools','pause']){
        const hit=s.app.hits.find(h=>h.id===id);assert.ok(hit,label+' 缺少 '+id);
        assert.equal(intersect(hit,board),null,label+' 工具遮盖棋盘');
      }
    }
    if(s.app.maxScroll>0)for(const scroll of [s.app.maxScroll/2,s.app.maxScroll]){
      s.app.scroll=scroll;s.draw();assertScene(s,label+' / 滚动 '+scroll);
    }

  }
});
test('昵称按测量列宽截断，组合emoji、代理对和附加符保持完整',()=>{
  const c=new CanvasRecorder();for(const value of names)for(const width of [35,70,96,158,306]){const out=U.ellipsis(c,value,width,14,800);assert.ok(c.measureText(out).width<=width);const parts=U.textParts(value);assert.ok(out===value||parts.some((_,i)=>parts.slice(0,i+1).join('')+'…'===out)||out==='…');assert.ok(!/[\uD800-\uDBFF](?:…)?$/.test(out));}
});
