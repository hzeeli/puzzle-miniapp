'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const config=require('../game/src/config');
const {userInfoFailure}=require('../game/src/platform');
const plain=value=>JSON.parse(JSON.stringify(value));
const flush=()=>new Promise(setImmediate);
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function fault(code,message=code){const error=new Error(message);error.code=code;return error;}
function fixture(){
  const calls=[],writes=[],notices=[];let invoke=async()=>({});let counter=0,now=100000;
  const Journey=require('../shared/journey');
  const level=Journey.buildLevel(Journey.storySession(1));
  const rules={createState:()=>({solved:false,completed:[]}),replay:(level,moves)=>({ok:true,solved:moves.length===2,state:{solved:moves.length===2,completed:moves.length===2?[0,1,2,3]:[]}}),isSolved:state=>!!state.solved,findHint:()=>null};
  const platform={native:true,cloudReady:()=>true,callCloud:(action,payload)=>{calls.push({action,payload:plain(payload)});return invoke(action,payload);},write:value=>{writes.push(plain(value));return true;},authorizePrivacy:async()=>{},isWechatAvatarUrl:()=>false,userInfoFailure};
  const context={module:{exports:{}},require:name=>{
    if(name==='./platform')return platform;
    if(name==='./progress')return require('../game/src/progress');
    if(name==='./config')return config;
    if(name==='../../shared/rules')return rules;
    if(name==='../../shared/journey')return Journey;
    if(name==='./journey-progress')return require('../game/src/journey-progress');
    return{};
  },console,Date:{now:()=>now},Math};
  vm.runInNewContext(fs.readFileSync(path.join(root,'game/src/app.js'),'utf8'),context);
  const app=Object.create(context.module.exports.prototype);
  Object.assign(app,{data:{consent:config.consentVersion,profile:{id:'player-a',nickname:'拼图旅人·AAAA',nicknameId:'traveler',avatarId:'sunflower'},schemaVersion:2,best:{},legacyBestV3:{},galleryUnlocked:[],goldPhotos:[],stars:{},settings:{}},profile:{id:'player-a'},accountEpoch:0,cloudBest:{},cloudStatus:'ready',game:null,result:null,scene:'home',now:0,assets:{loadAll:async()=>{}},audio:{play(){},pause(){},sync(){}},h:844,bottom:0});
  app.notify=text=>notices.push(text);app.requestId=()=>`request-${String(++counter).padStart(8,'0')}`;
  const saved=(finished=false)=>({levelId:1,version:4,moves:finished?[{from:0,to:1},{from:2,to:3}]:[{from:0,to:1}],run:{runId:'existing-run',startedAt:1000},ranked:true,startedAt:1000,serverOffset:0,finished});
  const game=()=>({level,state:{solved:true,completed:[0,1,2,3]},visual:{solved:true},moves:[{from:0,to:1},{from:2,to:3}],run:{runId:'existing-run'},ranked:true,startedAt:1000,serverOffset:0});
  return{app,platform,calls,writes,notices,saved,game,setCloud:fn=>{invoke=fn;},advance:ms=>{now+=ms;},time:()=>now};
}
function platformFixture(){
  let privacyCallback;const signals=[],cloudCalls=[],timers=[];
  const wx={createCanvas(){},onNeedPrivacyAuthorization(fn){privacyCallback=fn;},cloud:{init(){},callFunction:async args=>{cloudCalls.push(args);return{result:{ok:true,data:{}}}}}};
  const context={module:{exports:{}},require:()=>config,wx,console,Promise,Error,
    setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'game/src/platform.js'),'utf8'),context);
  return{platform:context.module.exports,wx,signals,cloudCalls,timers,requestPrivacy:(onSignal=()=>{})=>privacyCallback(result=>{signals.push(result.event);onSignal(result.event);})};
}

test('隐私曝光与同意通过专用resolve回调上报',()=>{
  const s=platformFixture();let answer;s.platform.setPrivacyHandler(callback=>{answer=callback;});s.requestPrivacy();
  assert.deepEqual(s.signals,['exposureAuthorization']);answer(true);assert.deepEqual(s.signals,['exposureAuthorization','agree']);
});
test('隐私拒绝不会误报同意',()=>{
  const s=platformFixture();s.platform.setPrivacyHandler(answer=>answer(false));s.requestPrivacy();
  assert.deepEqual(s.signals,['exposureAuthorization','disagree']);
});
test('云端业务失败保留code和retryable，不当作成功数据',async()=>{
  const s=platformFixture();s.wx.cloud.callFunction=async()=>({result:{ok:false,error:{code:'ACCOUNT_DELETING',message:'正在删除',retryable:true}}});
  await assert.rejects(s.platform.callCloud('storyBootstrap',{}),error=>error.code==='ACCOUNT_DELETING'&&error.retryable===true);
});
test('云请求超时明确失败，不把仍在等待的请求当作成功',async()=>{
  const s=platformFixture(),late=deferred();s.wx.cloud.callFunction=()=>late.promise;
  const call=s.platform.callCloud('startRun',{requestId:'test-request'});s.timers[0]();
  await assert.rejects(call,error=>error.code==='NETWORK_TIMEOUT');
  late.resolve({result:{ok:true,data:{runId:'late-run'}}});await flush();
});
test('云SDK拒绝长诊断对象或Error时只返回短友好错误，不暴露内部原文',async()=>{
  const diagnostic='internal-secret-token https://internal.invalid/trace '+ '敏感诊断内容'.repeat(100);
  for(const failure of [{errMsg:diagnostic,requestId:'private-request-id'},new Error(diagnostic)]){
    const s=platformFixture();s.wx.cloud.callFunction=async()=>{throw failure;};
    await assert.rejects(s.platform.callCloud('storyBootstrap',{}),error=>{
      assert.equal(error.code,'CLOUD_REQUEST_FAILED');assert.equal(error.retryable,true);
      assert.ok(error.message.length<60);assert.match(error.message,/稍后重试/);
      assert.equal(String(error).includes(diagnostic),false);assert.equal(String(error.stack).includes('internal-secret-token'),false);
      assert.equal(JSON.stringify(error).includes('private-request-id'),false);return true;
    });
  }
});
test('删除成功后清除活动游戏与本地身份，切后台不会重建旧run',async()=>{
  const s=fixture();s.app.game=s.game();s.app.data.run=s.saved(true);s.app.data.best={1:1000};s.setCloud(async()=>({deleted:true}));
  await s.app.deleteAccount();s.app.saveRun();
  assert.equal(s.app.game,null);assert.equal(s.app.result,null);assert.equal(s.app.profile,null);assert.equal(s.app.data.run,undefined);assert.equal(s.app.data.consent,undefined);assert.equal(s.app.data.profile.id,undefined);assert.equal(s.app.data.best,undefined);
});
test('删除成功后迟到的bootstrap不能重新写回云端身份',async()=>{
  const s=fixture(),late=deferred();s.setCloud(action=>action==='storyBootstrap'?late.promise:Promise.resolve({deleted:true}));
  const connecting=s.app.connectCloud(false);await flush();await s.app.deleteAccount();late.resolve({publicProfile:{id:'resurrected-user'},rankingVersion:1,highestLevel:0});
  assert.equal(await connecting,false);assert.equal(s.app.profile,null);assert.equal(s.app.data.profile.id,undefined);assert.equal(s.app.cloudStatus,'local');
});
test('本地缓存同意不代替当前微信授权，平台拒绝时不调用bootstrap',async()=>{
  const s=fixture();s.app.profile=null;s.app.data.consent=config.consentVersion;
  s.platform.authorizePrivacy=async()=>{throw fault('PRIVACY_REVOKED','当前微信隐私授权已撤回');};
  s.setCloud(async()=>({publicProfile:{id:'should-not-be-created'},rankingVersion:1,highestLevel:0}));
  assert.equal(await s.app.connectCloud(false),false);
  assert.equal(s.calls.filter(call=>call.action==='storyBootstrap').length,0);
  assert.equal(s.app.profile,null);
});

test('场景切换取消活动拖动并清除上一屏点击区域',()=>{
  const s=fixture();let releases=0;s.app.releaseInput=()=>releases++;s.app.game={drag:{from:0}};s.app.pointer={x:10,y:20};s.app.hits=[{id:'old-action'}];
  s.app.navigate('home');
  assert.equal(s.app.game.drag,null);assert.equal(s.app.pointer,null);assert.equal(s.app.hits.length,0);assert.equal(releases,1);
});

test('账号操作代次已变化时，旧删除响应不能清空随后产生的本地状态',async()=>{
  const s=fixture(),late=deferred();s.setCloud(()=>late.promise);
  const deleting=s.app.deleteAccount();s.app.accountEpoch++;s.app.data.best={2:5000};s.app.data.run={levelId:3,ranked:false,moves:[]};s.app.game={level:{id:3},ranked:false};
  late.resolve({deleted:true});assert.equal(await deleting,false);
  assert.equal(s.app.data.best[2],5000);assert.equal(s.app.data.run.levelId,3);assert.equal(s.app.game.level.id,3);assert.equal(s.app.deleting,false);
});

test('平台直接授权成功时，首次业务说明仍等待真实用户选择且不伪造平台agree',async()=>{
  const s=platformFixture();let answer,prompts=0,completed=false;
  s.wx.requirePrivacyAuthorize=options=>options.success();
  s.platform.setPrivacyHandler(callback=>{prompts++;answer=callback;});
  const authorizing=s.platform.authorizePrivacy(true).then(()=>{completed=true;});await flush();
  assert.equal(prompts,1);assert.equal(completed,false);assert.deepEqual(s.signals,[]);
  answer(true);await authorizing;assert.equal(completed,true);assert.deepEqual(s.signals,[]);
});

test('平台需要新授权时复用同一个业务说明弹窗，首次同意不再重复弹窗',async()=>{
  const s=platformFixture();let answer,prompts=0;
  s.platform.setPrivacyHandler(callback=>{prompts++;answer=callback;});
  s.wx.requirePrivacyAuthorize=options=>s.requestPrivacy(signal=>{if(signal==='agree')options.success();if(signal==='disagree')options.fail();});
  const authorizing=s.platform.authorizePrivacy(true);assert.equal(prompts,1);assert.deepEqual(s.signals,['exposureAuthorization']);
  answer(true);await authorizing;assert.equal(prompts,1);assert.deepEqual(s.signals,['exposureAuthorization','agree']);
});

test('已有当前业务同意无需重复说明，但仍处理平台新授权及用户拒绝',async()=>{
  const s=platformFixture();let answer,prompts=0,platformChecks=0;
  s.platform.setPrivacyHandler(callback=>{prompts++;answer=callback;});
  s.wx.requirePrivacyAuthorize=options=>{platformChecks++;options.success();};
  await s.platform.authorizePrivacy(false);await s.platform.authorizePrivacy(false);
  assert.equal(prompts,0);assert.equal(platformChecks,2);
  s.wx.requirePrivacyAuthorize=options=>s.requestPrivacy(signal=>{if(signal==='agree')options.success();if(signal==='disagree')options.fail();});
  const authorizing=s.platform.authorizePrivacy(false);
  assert.equal(prompts,1);answer(false);
  await assert.rejects(authorizing,error=>error.code==='PRIVACY_NOT_AUTHORIZED');
  assert.deepEqual(s.signals,['exposureAuthorization','disagree']);
});

test('首次拒绝业务说明不记录同意、不创建云档案且仍可本地开局',async()=>{
  const s=fixture(),p=platformFixture();delete s.app.data.consent;s.app.profile=null;let answer;
  p.wx.requirePrivacyAuthorize=options=>options.success();p.platform.setPrivacyHandler(callback=>{answer=callback;});
  s.platform.authorizePrivacy=p.platform.authorizePrivacy;
  const connecting=s.app.connectCloud();await flush();assert.equal(s.calls.length,0);assert.equal(s.app.data.consent,undefined);
  answer(false);assert.equal(await connecting,false);assert.equal(s.app.data.consent,undefined);assert.equal(s.calls.length,0);
  await s.app.startLevel(s.game().level);assert.equal(s.app.scene,'game');assert.equal(s.app.game.level.session.mode,'story');
});

test('业务说明同意后才建立云档案，当前版本不重复询问且新版本重新询问',async()=>{
  const s=fixture(),p=platformFixture();delete s.app.data.consent;s.app.profile=null;let answer,prompts=0;
  p.wx.requirePrivacyAuthorize=options=>options.success();p.platform.setPrivacyHandler(callback=>{prompts++;answer=callback;});
  s.platform.authorizePrivacy=p.platform.authorizePrivacy;
  s.setCloud(async()=>({publicProfile:{id:'accepted-player'},rankingVersion:1,highestLevel:0}));
  const first=s.app.connectCloud();await flush();assert.equal(s.calls.length,0);answer(true);assert.equal(await first,true);
  assert.equal(s.app.data.consent,config.consentVersion);assert.equal(s.app.data.consentNoticeVersion,config.consentVersion);assert.equal(s.calls[0].action,'storyBootstrap');assert.equal(prompts,1);
  await s.app.connectCloud();assert.equal(prompts,1);assert.equal(s.calls.length,2);
  s.app.data.consentNoticeVersion='旧版说明';const updated=s.app.connectCloud();await flush();assert.equal(prompts,2);assert.equal(s.calls.length,2);
  answer(true);assert.equal(await updated,true);assert.equal(s.calls.length,3);
});

test('平台拒绝当前授权后清除运行中云身份，后续开局走本地',async()=>{
  const s=fixture();s.app.data.consentNoticeVersion=config.consentVersion;s.platform.authorizePrivacy=async()=>{throw fault('PRIVACY_NOT_AUTHORIZED','暂未同意隐私说明');};
  assert.equal(await s.app.connectCloud(),false);assert.equal(s.app.profile,null);
  assert.equal(s.app.data.consent,undefined);assert.equal(s.app.data.consentNoticeVersion,undefined);
  await s.app.startLevel(s.game().level);assert.equal(s.app.game.level.session.mode,'story');assert.equal(s.calls.length,0);
});

test('等待隐私选择期间账号代次变化，迟到同意不会重建同意记录或云档案',async()=>{
  const s=fixture(),choice=deferred();delete s.app.data.consent;s.platform.authorizePrivacy=()=>choice.promise;
  const connecting=s.app.connectCloud();s.app.accountEpoch++;
  choice.resolve();assert.equal(await connecting,false);assert.equal(s.app.data.consent,undefined);assert.equal(s.calls.length,0);
});

test('正式隐私指引能力缺失或打开失败明确拒绝，成功打开正常返回',async()=>{
  const s=platformFixture();
  await assert.rejects(s.platform.openPrivacy(),/升级微信/);
  s.wx.openPrivacyContract=options=>options.fail({errMsg:'平台暂时失败'});
  await assert.rejects(s.platform.openPrivacy(),/点击链接重试/);
  s.wx.openPrivacyContract=options=>options.success({});
  await assert.doesNotReject(s.platform.openPrivacy());
});

test('隐私指引失败保留原同意流程、可见错误和重试入口，重复点击不并发打开',async()=>{
  const s=fixture(),opening=deferred();let opened=0,answered=0;
  const modal={type:'privacy',resolve:()=>answered++};s.app.modal=modal;
  s.platform.openPrivacy=()=>{opened++;return opening.promise;};
  const first=s.app.openPrivacy();assert.equal(modal.privacyOpening,true);assert.equal(await s.app.openPrivacy(),false);assert.equal(opened,1);
  opening.reject(new Error('隐私指引暂未打开，请点击链接重试'));assert.equal(await first,false);
  assert.equal(s.app.modal,modal);assert.equal(answered,0);assert.equal(modal.privacyOpening,false);assert.match(modal.privacyError,/重试/);assert.match(s.notices.at(-1),/重试/);
  s.platform.openPrivacy=async()=>{opened++;};assert.equal(await s.app.openPrivacy(),true);assert.equal(opened,2);assert.equal(modal.privacyError,null);assert.equal(answered,0);
});

test('旧缓存只有平台同意标记时补充一次业务说明，拒绝后不再自动开启云存档',async()=>{
  const s=fixture(),p=platformFixture();s.app.profile=null;let answer,prompts=0;
  assert.equal(s.app.data.consent,config.consentVersion);assert.equal(s.app.data.consentNoticeVersion,undefined);
  p.wx.requirePrivacyAuthorize=options=>options.success();p.platform.setPrivacyHandler(callback=>{prompts++;answer=callback;});s.platform.authorizePrivacy=p.platform.authorizePrivacy;
  const connecting=s.app.connectCloud();await flush();assert.equal(prompts,1);assert.equal(s.calls.length,0);
  answer(false);assert.equal(await connecting,false);assert.equal(s.app.data.consent,undefined);assert.equal(s.app.data.consentNoticeVersion,undefined);assert.equal(s.calls.length,0);
});

test('删除云档案同时清理明确同意的业务说明版本',async()=>{
  const s=fixture();s.app.data.consentNoticeVersion=config.consentVersion;s.setCloud(async()=>({deleted:true}));
  assert.equal(await s.app.deleteAccount(),true);assert.equal(s.app.data.consent,undefined);assert.equal(s.app.data.consentNoticeVersion,undefined);
});

test('已授权微信资料先确保登录态，获取后仅返回CloudID而不信任客户端明文资料',async()=>{
  const s=platformFixture(),sequence=[];
  s.wx.createUserInfoButton=()=>{};s.wx.cloud.init=()=>sequence.push('cloud');
  s.wx.checkSession=options=>{sequence.push('session');options.fail();};
  s.wx.login=options=>{sequence.push('login');options.success({code:'temporary-code'});};
  s.wx.getSetting=options=>{sequence.push('setting');options.success({authSetting:{'scope.userInfo':true}});};
  s.wx.getUserInfo=options=>{sequence.push('info');assert.equal(options.withCredentials,true);assert.equal(options.lang,'zh_CN');options.success({cloudID:'verified-cloud-id',userInfo:{nickName:'不直接存储'}});};
  assert.deepEqual(plain(await s.platform.prepareWechatUserInfo()),{cloudID:'verified-cloud-id'});
  assert.deepEqual(sequence,['cloud','session','login','setting','info']);
});

test('未授权用户不静默获取资料，有效登录态不重复login；缺少CloudID时不降级明文同步',async()=>{
  const s=platformFixture();let logins=0,reads=0;s.wx.createUserInfoButton=()=>{};
  s.wx.checkSession=options=>options.success();s.wx.login=options=>{logins++;options.success({code:'code'});};
  s.wx.getSetting=options=>options.success({authSetting:{'scope.userInfo':false}});s.wx.getUserInfo=()=>reads++;
  assert.equal(await s.platform.prepareWechatUserInfo(),null);assert.equal(logins,0);assert.equal(reads,0);
  s.wx.getSetting=options=>options.success({authSetting:{'scope.userInfo':true}});s.wx.getUserInfo=options=>options.success({userInfo:{nickName:'明文昵称',avatarUrl:'https://evil.test/avatar'}});
  await assert.rejects(s.platform.prepareWechatUserInfo(),/凭证/);
});

test('微信隐私接入错误保留errno，不误报为用户拒绝或泄露原始诊断内容',async()=>{
  const s=platformFixture();s.wx.createUserInfoButton=()=>{};
  s.wx.checkSession=options=>options.success();s.wx.login=()=>{};
  s.wx.getSetting=options=>options.success({authSetting:{'scope.userInfo':true}});
  for(const errno of [112,1025,1026]){
    s.wx.getUserInfo=options=>options.fail({errno,errMsg:'getUserInfo:fail please go to mp to announce your privacy usage private-token'});
    await assert.rejects(s.platform.prepareWechatUserInfo(),error=>{
      assert.equal(error.code,'WECHAT_PRIVACY_SETUP_REQUIRED');assert.equal(error.errno,errno);
      assert.doesNotMatch(error.message,/未授权|重新授权|private-token/);return true;
    });
  }
});

test('原生按钮的隐私配置错误优先于auth deny文字，不读取或提交微信资料',async()=>{
  const s=fixture();let reads=0;s.app.wechatProfileReady=true;s.platform.prepareWechatUserInfo=async()=>{reads++;};
  assert.equal(await s.app.syncWechatProfile({errMsg:'getUserInfo:fail auth deny',errno:1026}),false);
  assert.match(s.app.wechatProfileError,/暂未就绪/);assert.doesNotMatch(s.app.wechatProfileError,/未授权/);
  assert.equal(reads,0);assert.equal(s.calls.length,0);assert.equal(s.app.wechatProfileReady,false);
});

test('官方原生按钮使用透明覆盖层和凭证模式，销毁后不会继续回调或显示',()=>{
  const s=platformFixture(),calls=[];let options,listener,taps=0;
  s.wx.createUserInfoButton=value=>{options=value;return{style:value.style,onTap:fn=>listener=fn,offTap:fn=>{assert.equal(fn,listener);calls.push('off');},show:()=>calls.push('show'),hide:()=>calls.push('hide'),destroy:()=>calls.push('destroy')};};
  const button=s.platform.createWechatUserInfoButton({x:10,y:20,w:100,h:40},()=>taps++);
  assert.equal(options.withCredentials,true);assert.equal(options.text,'');assert.equal(options.style.backgroundColor,'rgba(0,0,0,0)');
  button.setRect({x:15,y:25,w:120,h:44});assert.equal(options.style.left,15);assert.equal(options.style.height,44);
  listener({cloudID:'cloud-id'});button.hide();button.show();button.destroy();button.destroy();button.show();listener({cloudID:'late'});
  assert.equal(taps,1);assert.deepEqual(calls,['hide','show','off','destroy']);
});

test('获取微信资料准备需先完成隐私同意，拒绝不读取微信资料且仍可本地游玩',async()=>{
  const s=fixture();let reads=0;s.app.profile=null;s.platform.authorizePrivacy=async()=>{throw fault('PRIVACY_NOT_AUTHORIZED');};s.platform.prepareWechatUserInfo=async()=>{reads++;};
  assert.equal(await s.app.prepareWechatProfile(),false);assert.equal(reads,0);assert.equal(s.calls.length,0);
  await s.app.startLevel(s.game().level);assert.equal(s.app.game.level.session.mode,'story');
});

test('已授权用户经CloudID同步后刷新我的资料和本人榜单，不保存客户端伪造昵称',async()=>{
  const s=fixture();const profile={id:'player-a',nickname:'可信微信昵称',avatarUrl:'https://thirdwx.qlogo.cn/mmopen/sample/132',profileSource:'wechat',avatarId:'cloud',nicknameId:null};
  s.platform.prepareWechatUserInfo=async()=>({cloudID:'verified-id'});s.app.rank={entries:[{id:'player-a',nickname:'旧名字',rank:1,durationMs:5000}]};
  s.setCloud(async(action,payload)=>action==='storyBootstrap'?{publicProfile:{id:'player-a',nickname:'游客',profileSource:'guest'},rankingVersion:1,highestLevel:0}:(assert.deepEqual(plain(payload),{cloudID:'verified-id'}),{publicProfile:profile}));
  assert.equal(await s.app.prepareWechatProfile(),true);assert.deepEqual(plain(s.app.data.profile),profile);assert.equal(s.app.wechatProfileReady,false);assert.equal(s.app.wechatProfileLoading,false);
  assert.equal(s.app.rank.entries[0].nickname,'可信微信昵称');assert.equal(s.app.rank.entries[0].durationMs,5000);assert.equal('cloudID' in s.app.data.profile,false);
});

test('官方按钮矩形从逻辑坐标映射到屏幕，未就绪或弹窗时不创建',()=>{
  const s=fixture();let rect;s.app.scale=1.5;s.app.wechatProfileReady=false;
  s.platform.createWechatUserInfoButton=value=>{rect=value;return{show(){},hide(){},destroy(){},setRect:next=>rect=next};};
  assert.equal(s.app.createWechatProfileButton({x:10,y:20,w:100,h:40}),null);
  s.app.wechatProfileReady=true;const button=s.app.createWechatProfileButton({x:10,y:20,w:100,h:40});assert.deepEqual(plain(rect),{x:15,y:30,w:150,h:60});
  button.setRect({x:20,y:30,w:100,h:40});assert.equal(rect.x,30);button.destroy();assert.equal(s.app.wechatProfileButton,null);
  s.app.modal={type:'privacy'};assert.equal(s.app.createWechatProfileButton({x:0,y:0,w:100,h:40}),null);
});

test('用户拒绝微信头像昵称不发送资料到云端，原生按钮不可用时不会中断页面',async()=>{
  const s=fixture();s.app.wechatProfileReady=true;let reads=0;s.platform.prepareWechatUserInfo=async()=>{reads++;return{cloudID:'不得读取'};};
  assert.equal(await s.app.syncWechatProfile({errMsg:'getUserInfo:fail auth deny',userInfo:{nickName:'不得采用'}}),false);assert.equal(s.calls.length,0);assert.notEqual(s.app.data.profile.nickname,'不得采用');
  assert.equal(reads,0);s.app.wechatProfileReady=true;
  s.platform.createWechatUserInfoButton=()=>{throw new Error('原生组件暂不可用');};
  assert.equal(s.app.createWechatProfileButton({x:0,y:0,w:100,h:40}),null);assert.equal(s.app.wechatProfileReady,false);assert.match(s.app.wechatProfileError,/暂不可用/);
});

test('官方按钮成功但未携带CloudID时只补取一次已授权凭证',async()=>{
  const s=fixture();let reads=0;s.platform.prepareWechatUserInfo=async()=>{reads++;return{cloudID:'fresh-credential'};};
  s.setCloud(async()=>({publicProfile:{id:'player-a',nickname:'可信微信昵称',profileSource:'wechat',avatarUrl:''}}));
  assert.equal(await s.app.syncWechatProfile({errMsg:'getUserInfo:ok',userInfo:{nickName:'不采用明文'}}),true);
  assert.equal(reads,1);assert.deepEqual(s.calls,[{action:'syncWechatProfile',payload:{cloudID:'fresh-credential'}}]);
  assert.equal(s.app.data.profile.nickname,'可信微信昵称');assert.equal(s.app.wechatProfileError,null);
});

test('成功授权后仍未获得凭证时不误报用户拒绝，不发送明文资料且允许重新准备',async()=>{
  const s=fixture();s.app.wechatProfileReady=true;let reads=0;s.platform.prepareWechatUserInfo=async()=>{reads++;return null;};
  assert.equal(await s.app.syncWechatProfile({errMsg:'getUserInfo:ok',userInfo:{nickName:'不采用明文'}}),false);
  assert.equal(reads,1);assert.equal(s.calls.length,0);assert.match(s.app.wechatProfileError,/凭证/);
  assert.equal(s.app.wechatProfileReady,false);assert.equal(s.app.wechatProfileLoading,false);
});

test('补取凭证期间删除档案，迟到凭证不能重建资料或发起同步',async()=>{
  const s=fixture(),late=deferred();s.platform.prepareWechatUserInfo=()=>late.promise;s.setCloud(async()=>({deleted:true}));
  const syncing=s.app.syncWechatProfile({errMsg:'getUserInfo:ok'});assert.equal(s.app.wechatProfileLoading,true);
  await s.app.deleteAccount();late.resolve({cloudID:'late-credential'});assert.equal(await syncing,false);
  assert.deepEqual(s.calls.map(c=>c.action),['deleteAccount']);assert.equal(s.app.profile,null);
});

test('删除后迟到的微信资料同步不能恢复头像昵称或缓存',async()=>{
  const s=fixture(),late=deferred();s.setCloud(action=>action==='syncWechatProfile'?late.promise:Promise.resolve({deleted:true}));
  const syncing=s.app.syncWechatProfile({errMsg:'getUserInfo:ok',cloudID:'verified-id'});await s.app.deleteAccount();
  late.resolve({publicProfile:{id:'old-user',nickname:'旧微信昵称',profileSource:'wechat',avatarUrl:'https://thirdwx.qlogo.cn/mmopen/old/132'}});
  assert.equal(await syncing,false);assert.equal(s.app.profile,null);assert.equal(s.app.data.profile.profileSource,'guest');assert.equal(s.app.data.profile.avatarUrl,'');
});

test('迟到的bootstrap不会覆盖刚同步成功的微信资料',async()=>{
  const s=fixture(),late=deferred();const profile={id:'player-a',nickname:'最新微信昵称',profileSource:'wechat',avatarUrl:''};
  s.setCloud(action=>action==='storyBootstrap'?late.promise:Promise.resolve({publicProfile:profile}));
  const connecting=s.app.connectCloud();await flush();assert.equal(await s.app.syncWechatProfile({cloudID:'verified-id'}),true);
  late.resolve({publicProfile:{id:'player-a',nickname:'旧昵称',profileSource:'guest'},rankingVersion:1,highestLevel:0});await connecting;
  assert.equal(s.app.data.profile.nickname,'最新微信昵称');assert.equal(s.app.profile.profileSource,'wechat');
});

test('头像只加载经验证的微信URL并复用内存缓存，删号后清空且拒绝迟到图片',async()=>{
  const s=fixture(),p=platformFixture(),late=deferred();let loads=0,destroyed=0;s.platform.isWechatAvatarUrl=p.platform.isWechatAvatarUrl;s.platform.loadImage=()=>{loads++;return late.promise;};
  const profile={profileSource:'wechat',avatarUrl:'https://thirdwx.qlogo.cn/mmopen/sample/132'};
  assert.equal(s.app.avatarFor({profileSource:'guest',avatarUrl:profile.avatarUrl}),null);assert.equal(s.app.avatarFor({...profile,avatarUrl:'https://evil.test/avatar'}),null);assert.equal(loads,0);
  assert.equal(s.app.avatarFor(profile),null);assert.equal(s.app.avatarFor(profile),null);assert.equal(loads,1);
  s.app.wechatProfileButton={destroy:()=>destroyed++};s.setCloud(async()=>({deleted:true}));await s.app.deleteAccount();late.resolve({width:132,height:132});await flush();
  assert.equal(destroyed,1);assert.equal(s.app.avatarImages.size,0);
});

test('删除失败释放旧云连接，迟到bootstrap不覆盖新的连接或身份',async()=>{
  const s=fixture(),old=deferred(),fresh=deferred();let requests=0;
  s.setCloud(action=>action==='storyBootstrap'?(requests++?fresh.promise:old.promise):Promise.reject(fault('NETWORK_TIMEOUT')));
  const first=s.app.connectCloud();await flush();assert.equal(await s.app.deleteAccount(),false);assert.notEqual(s.app.cloudStatus,'loading');assert.equal(s.app.cloudConnection,null);
  const second=s.app.connectCloud();await flush();old.resolve({publicProfile:{id:'stale-user'},rankingVersion:1,highestLevel:0});assert.equal(await first,false);
  assert.equal(s.app.cloudStatus,'loading');assert.equal(s.app.cloudConnection.promise,second);assert.notEqual(s.app.profile.id,'stale-user');
  fresh.resolve({publicProfile:{id:'current-user'},rankingVersion:1,highestLevel:0});assert.equal(await second,true);assert.equal(s.app.profile.id,'current-user');assert.equal(s.app.cloudConnection,null);
});

test('删除失败后可重新授权同步，旧资料响应不会提前解除新任务的忙碌状态',async()=>{
  const s=fixture(),old=deferred(),fresh=deferred();s.app.wechatProfileReady=true;let destroyed=0;
  s.app.wechatProfileButton={destroy:()=>destroyed++};s.platform.prepareWechatUserInfo=async()=>({cloudID:'fresh-id'});
  s.setCloud((action,payload)=>action==='deleteAccount'?Promise.reject(fault('NETWORK_TIMEOUT')):action==='storyBootstrap'?Promise.resolve({publicProfile:{id:'player-a'},rankingVersion:1,highestLevel:0}):payload.cloudID==='old-id'?old.promise:fresh.promise);
  const first=s.app.syncWechatProfile({cloudID:'old-id'});assert.equal(await s.app.deleteAccount(),false);
  assert.equal(s.app.wechatProfileLoading,false);assert.equal(s.app.wechatProfileReady,false);assert.equal(s.app.wechatProfileButton,null);assert.equal(destroyed,1);
  const second=s.app.prepareWechatProfile();await flush();assert.equal(s.app.wechatProfileLoading,true);
  old.resolve({publicProfile:{id:'old-user',nickname:'旧资料'}});assert.equal(await first,false);assert.equal(s.app.wechatProfileLoading,true);assert.notEqual(s.app.profile.id,'old-user');
  fresh.resolve({publicProfile:{id:'player-a',nickname:'当前资料',profileSource:'wechat',avatarUrl:''}});assert.equal(await second,true);assert.equal(s.app.wechatProfileLoading,false);assert.equal(s.app.data.profile.nickname,'当前资料');
});

test('删除失败释放在途头像并允许重试，旧图片成功或失败均不污染新缓存项',async()=>{
  for(const failure of [false,true]){
    const s=fixture(),p=platformFixture(),old=deferred(),fresh=deferred();let loads=0;
    s.platform.isWechatAvatarUrl=p.platform.isWechatAvatarUrl;s.platform.loadImage=()=>loads++?fresh.promise:old.promise;s.setCloud(async()=>{throw fault('NETWORK_TIMEOUT');});
    const profile={profileSource:'wechat',avatarUrl:'https://thirdwx.qlogo.cn/mmopen/sample/132'};
    s.app.avatarFor(profile);assert.equal(await s.app.deleteAccount(),false);assert.equal(s.app.avatarImages.size,0);
    s.app.avatarFor(profile);assert.equal(loads,2);if(failure)old.reject(new Error('旧图片失败'));else old.resolve({id:'old-image'});await flush();
    assert.equal(s.app.avatarImages.get(profile.avatarUrl).pending,true);assert.equal(s.app.avatarFor(profile),null);
    const image={id:'fresh-image'};fresh.resolve(image);await flush();assert.equal(s.app.avatarFor(profile),image);
  }
});

test('已有业务同意时进入我的页预备官方按钮，实际资料同步仍等待官方点击',async()=>{
  const s=fixture(),ready=deferred();s.app.data.consentNoticeVersion=config.consentVersion;s.app.scale=1;let reads=0,tap;
  s.platform.authorizePrivacy=async needsConsent=>assert.equal(needsConsent,false);
  s.platform.prepareWechatUserInfo=async()=>{reads++;return null;};s.platform.createWechatUserInfoButton=(rect,listener)=>{tap=listener;return{show(){},hide(){},setRect(){},destroy(){}};};
  s.setCloud(action=>action==='storyBootstrap'?ready.promise:Promise.resolve({publicProfile:{id:'player-a',nickname:'微信昵称',profileSource:'wechat',avatarUrl:''}}));
  const connecting=s.app.connectCloud();s.app.navigate('profile');assert.equal(s.app.scene,'profile');assert.equal(s.app.wechatProfileLoading,true);
  await flush();assert.equal(s.calls.length,1);ready.resolve({publicProfile:{id:'player-a'},rankingVersion:1,highestLevel:0});await connecting;await flush();
  assert.equal(reads,1);assert.equal(s.app.wechatProfileReady,true);assert.equal(s.app.wechatProfileLoading,false);assert.deepEqual(s.calls.map(c=>c.action),['storyBootstrap']);
  assert.ok(s.app.createWechatProfileButton({x:70,y:200,w:250,h:51}));tap({cloudID:'official-click'});await flush();
  assert.equal(s.app.data.profile.nickname,'微信昵称');assert.deepEqual(s.calls.map(c=>c.action),['storyBootstrap','syncWechatProfile']);
});

test('未同意的新用户与浏览器验收进入我的页时不自动准备微信资料',()=>{
  const fresh=fixture();fresh.app.profile=null;delete fresh.app.data.consent;let preparations=0;fresh.app.prepareWechatProfile=async()=>{preparations++;};
  fresh.app.navigate('profile');assert.equal(preparations,0);assert.equal(fresh.calls.length,0);
  const browser=fixture();browser.app.data.consentNoticeVersion=config.consentVersion;browser.platform.native=false;browser.app.prepareWechatProfile=async()=>{preparations++;};
  browser.app.navigate('profile');assert.equal(preparations,0);
});

function rankingFixture(){
  const s=fixture();
  s.app.data.rankAccount={playerId:'player-a',highestLevel:0};
  s.app.data.storyProofs={};
  s.app.data.journey={story:{}};
  s.clear=level=>{
    s.app.data.storyProofs[level]={level,sessionVersion:3,moves:[{from:7,to:5}],toolHistory:[],owner:'player-a'};
    s.app.data.journey.story[level]={stars:3,bestMs:30000};
  };
  return s;
}

test('响应丢失后保留通关证据，联网并发重试按关号顺序各提交一次',async()=>{
  const s=rankingFixture(),gate=deferred();s.clear(2);s.clear(1);
  s.setCloud(()=>Promise.reject(fault('NETWORK_TIMEOUT')));
  await assert.rejects(s.app.flushProofs(),/NETWORK_TIMEOUT/);
  assert.deepEqual(Object.keys(s.app.data.storyProofs),['1','2']);
  const submissions=[];
  s.setCloud(async(action,payload)=>{
    assert.equal(action,'submitStoryClear');assert.equal(payload.playerId,'player-a');submissions.push(payload.level);
    if(payload.level===1)await gate.promise;
    return {highestLevel:payload.level};
  });
  const a=s.app.flushProofs(),b=s.app.flushProofs();
  assert.equal(a,b);gate.resolve();await Promise.all([a,b]);
  assert.deepEqual(submissions,[1,2]);assert.equal(s.app.verifiedLevel(),2);
  assert.deepEqual(Object.keys(s.app.data.storyProofs),[]);
});

test('缺少第1关操作的历史进度不跳关上报，可补验，补齐后继续提交第2关',async()=>{
  const s=rankingFixture();s.clear(2);s.app.data.journey.story[1]={bestMs:8888};
  s.setCloud(async()=>({rankingVersion:1,entries:[],own:null}));
  await s.app.showLeaderboard();assert.equal(s.app.rank.verifyLevel,1);
  assert.deepEqual(s.calls.map(c=>c.action),['storyLeaderboard']);
  s.clear(1);let n=0;
  s.setCloud(async(action,p)=>action==='submitStoryClear'?{highestLevel:n=p.level}:
    {rankingVersion:1,entries:n?[{id:'player-a',level:n,rank:1,isSelf:true}]:[],own:n?{level:n,rank:1}:null});
  await s.app.showLeaderboard();
  assert.equal(s.app.rank.ownBest.levelId,2);assert.equal(s.app.rank.verifyLevel,undefined);
});

test('换设备从已验证进度继续；他人旧档操作不会随新档案提交',async()=>{
  const s=rankingFixture();s.clear(3);
  s.setCloud(async action=>action==='storyBootstrap'?{rankingVersion:1,publicProfile:{id:'player-b'},highestLevel:2}:
    {rankingVersion:1,entries:[],own:{level:2,rank:4}});
  assert.equal(await s.app.connectCloud(),true);
  await s.app.showLeaderboard();
  assert.equal(s.calls.some(c=>c.action==='submitStoryClear'),false);
  assert.equal(s.app.data.storyProofs[3].owner,'player-a');
  assert.equal(s.app.rank.verifyLevel,3);
});

test('删号后迟到的上传回执不会复活档案，旧请求不清除新请求',async()=>{
  const s=rankingFixture(),late=deferred();s.clear(1);
  s.setCloud(action=>action==='submitStoryClear'?late.promise:Promise.resolve({deleted:true}));
  const uploading=s.app.flushProofs();await flush();await s.app.deleteAccount();
  late.resolve({highestLevel:1});await uploading;
  assert.equal(s.app.data.storyProofs,undefined);assert.equal(s.app.data.rankAccount,undefined);
});

test('补验不会覆盖正在玩的主线存档，仍有缺口时可接着补下一关',async()=>{
  const s=rankingFixture();s.app.data.journey.story={1:{},2:{},3:{}};
  s.app.data.journeyRuns={story:{session:{index:4},moves:[{from:1,to:4}]}};
  const pending=plain(s.app.data.journeyRuns.story);
  await s.app.verifyRankLevel(1);
  assert.equal(s.app.game.verifying,true);
  assert.deepEqual(plain(s.app.data.journeyRuns.story),pending);
  s.app.result={cloud:{highestLevel:1}};s.app.data.rankAccount.highestLevel=1;
  assert.equal(s.app.nextVerificationLevel(),2);
});
