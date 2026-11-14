const platform=require('./platform');
const config=require('./config');
const Rules=require('../../shared/rules');
const {levels,getLevel}=require('../../shared/levels');
const Assets=require('./assets');
const AudioManager=require('./audio');
const Board=require('./board');
const U=require('./ui');
const Scenes=require('./scenes');
class App {
  constructor(){
    this.canvas=platform.createCanvas();this.ctx=this.canvas.getContext('2d');this.assets=new Assets();this.data=platform.read();
    this.data.settings=Object.assign({sound:true,music:true,haptic:true},this.data.settings);this.data.best=this.data.best||{};
    this.data.profile=this.data.profile||{nickname:'拼图旅人',nicknameId:'traveler',avatarId:'sunflower'};
    this.audio=new AudioManager(this.data.settings);this.scene='loading';this.loading={label:'准备一段美好时光',progress:0};this.modal=null;this.toast=null;
    this.accountEpoch=0;this.deleting=false;this.pendingSync=null;this.cloudConnection=null;this.profile=null;this.cloudBest={};this.cloudStatus='local';this.game=null;this.hits=[];this.pressed=null;this.scroll=0;this.maxScroll=0;this.visible=true;this.now=0;this.rank={levelId:1,entries:[],loading:false,error:null};this.resize();
    this.wechatProfileLoading=false;this.wechatProfileReady=false;this.wechatProfileError=null;this.wechatProfileButton=null;this.avatarImages=new Map();
    this.releaseInput=platform.bindInput(this.canvas,{down:(x,y)=>this.down(x,y),move:(x,y)=>this.move(x,y),up:(x,y)=>this.up(x,y),cancel:()=>this.cancel()});
    platform.onResize(()=>this.resize());platform.onVisibility(show=>{this.visible=show;if(!show){this.cancel();this.saveRun();this.audio.pause();}else{this.audio.sync();this.lastFrame=0;}});
    platform.setPrivacyHandler(resolve=>{this.cancel();if(this.wechatProfileButton)this.wechatProfileButton.hide();this.modal={type:'privacy',resolve};});
    this.lastFrame=0;this.frame=this.frame.bind(this);requestAnimationFrame(this.frame);this.boot();
    if(!platform.native)window.__gameApp=this;
  }
  resize(){this.cancel();const info=platform.windowInfo();this.scale=info.width/390;this.h=info.height/this.scale;this.top=info.top/this.scale;this.bottom=info.bottom/this.scale;this.dpr=info.dpr;this.canvas.width=Math.round(info.width*info.dpr);this.canvas.height=Math.round(info.height*info.dpr);if(!platform.native){this.canvas.style.width=info.width+'px';this.canvas.style.height=info.height+'px';}}
  async boot(){this.preservePendingResult();try{await this.assets.loadAll(['stage-background','brand-logo','card-back','primary-button','controls-atlas','hint-hand','photo-01','photo-02','photo-05'],p=>this.loading.progress=p);this.navigate('home');if(this.data.consent===config.consentVersion&&platform.cloudReady())this.connectCloud(false);}catch(error){this.scene='error';this.error=error.message;}}
  save(){if(!platform.write(this.data))this.notify('本机存储空间不足，进度暂未保存');}
  notify(text){this.toast={text,until:this.now+3};}
  navigate(scene){this.cancel();this.scene=scene;this.scroll=0;this.maxScroll=0;this.modal=null;this.hits=[];if(scene==='profile'&&platform.native&&this.data.consentNoticeVersion===config.consentVersion)this.prepareWechatProfile();}
  hit(id,x,y,w,h,fn){if(this.clip){const top=Math.max(y,this.clip.top),bottom=Math.min(y+h,this.clip.bottom);if(bottom<=top)return;y=top;h=bottom-top;}this.hits.push({id,x,y,w,h,fn});}
  findHit(x,y){return this.hits.slice().reverse().find(a=>x>=a.x&&x<=a.x+a.w&&y>=a.y&&y<=a.y+a.h);}
  connectCloud(){
    if(this.deleting)return Promise.resolve(false);if(this.cloudConnection)return this.cloudConnection.promise;
    const epoch=this.accountEpoch,profileAtStart=this.profile,operation={};this.cloudConnection=operation;this.cloudStatus='loading';
    operation.promise=(async()=>{try{await platform.authorizePrivacy(this.data.consentNoticeVersion!==config.consentVersion);if(epoch!==this.accountEpoch)return false;this.data.consent=config.consentVersion;this.data.consentNoticeVersion=config.consentVersion;this.save();
      const result=await platform.callCloud('bootstrap',{consentVersion:config.consentVersion});if(epoch!==this.accountEpoch)return false;if(this.profile===profileAtStart)this.profile=result.publicProfile||result.profile;this.cloudBest={};for(const item of result.bestScores||[])this.cloudBest[item.levelId]=item;this.cloudStatus='ready';this.data.profile=this.profile;this.save();this.notify('云成绩已连接');return true;
    }catch(error){if(epoch===this.accountEpoch){this.cloudStatus='error';if(error.code==='PRIVACY_NOT_AUTHORIZED'){this.profile=null;delete this.data.consent;delete this.data.consentNoticeVersion;this.save();}this.notify(error.message);}return false;}
    finally{if(this.cloudConnection===operation)this.cloudConnection=null;}})();return operation.promise;
  }
  async openPrivacy(){
    const modal=this.modal;if(modal&&modal.privacyOpening)return false;
    if(modal){modal.privacyOpening=true;modal.privacyError=null;}
    try{await platform.openPrivacy();return true;}
    catch(error){if(this.modal===modal){if(modal)modal.privacyError=error.message;this.notify(error.message);}return false;}
    finally{if(modal)modal.privacyOpening=false;}
  }
  async prepareWechatProfile(){
    if(this.wechatProfileLoading||this.deleting)return false;const epoch=this.accountEpoch;
    this.wechatProfileLoading=true;this.wechatProfileReady=false;this.wechatProfileError=null;
    try{
      if(!(await this.connectCloud()))throw new Error('云档案尚未连接，仍可在本地游玩');
      if(epoch!==this.accountEpoch)return false;
      const info=await platform.prepareWechatUserInfo();if(epoch!==this.accountEpoch)return false;
      if(info)return await this.storeWechatProfile(info.cloudID,epoch);
      this.wechatProfileReady=true;return true;
    }catch(error){if(epoch===this.accountEpoch){this.wechatProfileError=error.message;this.notify(error.message);}return false;}
    finally{if(epoch===this.accountEpoch)this.wechatProfileLoading=false;}
  }
  async syncWechatProfile(result){
    if(this.wechatProfileLoading||this.deleting||!this.profile)return false;
    if(!result||(result.errMsg&&!result.errMsg.includes(':ok'))){this.wechatProfileReady=false;this.wechatProfileError=result&&/deny|cancel/i.test(result.errMsg)?'未授权微信头像昵称，仍可正常游玩':'微信授权未完成，请重新获取';this.notify(this.wechatProfileError);return false;}
    const epoch=this.accountEpoch;this.wechatProfileLoading=true;this.wechatProfileError=null;
    try{
      let cloudID=result.cloudID;
      if(typeof cloudID!=='string'||!cloudID){
        if(!result.errMsg||!result.errMsg.includes(':ok'))throw new Error('微信未返回资料凭证，请重新获取');
        const info=await platform.prepareWechatUserInfo();if(epoch!==this.accountEpoch)return false;
        cloudID=info&&info.cloudID;if(typeof cloudID!=='string'||!cloudID)throw new Error('微信未返回资料凭证，请重新获取');
      }
      return await this.storeWechatProfile(cloudID,epoch);
    }
    catch(error){if(epoch===this.accountEpoch){this.wechatProfileReady=false;this.wechatProfileError=error.message;this.notify(error.message);}return false;}
    finally{if(epoch===this.accountEpoch)this.wechatProfileLoading=false;}
  }
  async storeWechatProfile(cloudID,epoch){
    const result=await platform.callCloud('syncWechatProfile',{cloudID});if(epoch!==this.accountEpoch)return false;
    const profile=result.publicProfile;this.profile=profile;this.data.profile=profile;this.wechatProfileReady=false;
    if(this.wechatProfileButton)this.wechatProfileButton.destroy();
    if(this.avatarImages&&profile.avatarUrl)this.avatarImages.delete(profile.avatarUrl);
    if(this.rank&&this.rank.entries)this.rank.entries=this.rank.entries.map(entry=>entry.id===profile.id?{...entry,...profile}:entry);
    this.save();this.avatarFor(profile);this.notify('微信头像昵称已同步');return true;
  }
  createWechatProfileButton(rect){
    if(!this.wechatProfileReady||this.wechatProfileLoading||this.deleting||this.modal)return null;
    if(this.wechatProfileButton)this.wechatProfileButton.destroy();const epoch=this.accountEpoch;
    const pixels=value=>({x:value.x*this.scale,y:value.y*this.scale,w:value.w*this.scale,h:value.h*this.scale});
    let native;try{native=platform.createWechatUserInfoButton(pixels(rect),result=>{if(epoch===this.accountEpoch)this.syncWechatProfile(result);});}
    catch(error){this.wechatProfileReady=false;this.wechatProfileError=error.message;this.notify(error.message);return null;}
    const button={show:()=>native.show(),hide:()=>native.hide(),setRect:value=>native.setRect(pixels(value)),destroy:()=>{native.destroy();if(this.wechatProfileButton===button)this.wechatProfileButton=null;}};
    this.wechatProfileButton=button;return button;
  }
  avatarFor(profile){
    if(!profile||profile.profileSource!=='wechat'||!platform.isWechatAvatarUrl(profile.avatarUrl)||this.deleting)return null;
    if(!this.avatarImages)this.avatarImages=new Map();const cache=this.avatarImages,url=profile.avatarUrl,now=Date.now(),known=cache.get(url);
    if(known&&(known.image||known.pending||now<known.retryAt))return known.image;
    if(cache.size>=32)cache.delete(cache.keys().next().value);
    const entry={image:null,pending:true,retryAt:0},epoch=this.accountEpoch;cache.set(url,entry);
    platform.loadImage(url).then(image=>{if(epoch===this.accountEpoch&&cache.get(url)===entry){entry.image=image;entry.pending=false;}},()=>{if(epoch===this.accountEpoch&&cache.get(url)===entry){entry.pending=false;entry.retryAt=Date.now()+60000;}});
    return null;
  }
  async chooseLevel(id){const level=getLevel(id);if(!level)return;this.selectedLevel=level;this.navigate('level-intro');this.assets.loadAll(level.photoIds).catch(()=>{});}
  async startLevel(id,local=false,startRequest=null){
    if(this.starting||this.deleting)return;this.starting=true;
    const epoch=this.accountEpoch,connection=this.cloudConnection?.promise,usesCloud=!local&&!!(this.profile||this.data.consent===config.consentVersion||startRequest);
    try {
    this.preservePendingResult();
    if(this.data.pendingResult&&!local){
      await this.retryPendingResult();
      if(epoch!==this.accountEpoch)return;
      if(this.data.pendingResult){this.selectedLevel=getLevel(id);this.navigate('level-intro');this.modal={type:'network',text:'上一局云成绩尚未同步，操作记录已安全保存在本机',retry:()=>this.startLevel(id,false,startRequest),local:()=>this.startLevel(id,true)};return;}
    }
    const level=getLevel(id);if(!level)return;this.navigate('loading');this.loading={label:'正在铺开第 '+id+' 幅旅程',progress:0};
    try{
      await this.assets.loadAll(level.photoIds,p=>{if(epoch===this.accountEpoch)this.loading.progress=p;});if(epoch!==this.accountEpoch)return;
      let run=null;const requestId=startRequest||this.requestId();
      // 连接期间授权标记可能变化，开局与重试都保留调用时的云成绩意图。
      if(usesCloud){
        try{
          if(connection||this.cloudConnection||!this.profile){const connected=await(connection||this.connectCloud());if(epoch!==this.accountEpoch)return;if(!connected)throw new Error('云成绩暂时无法连接，请重试或选择本地游玩');}
          run=await platform.callCloud('startRun',{levelId:id,requestId});if(epoch!==this.accountEpoch)return;
          if(run.status!=='active'){const error=new Error('这次挑战已结束，请重新开始');error.code='RUN_NOT_ACTIVE';throw error;}
        }catch(error){if(epoch!==this.accountEpoch)return;this.selectedLevel=level;this.navigate('level-intro');this.modal={type:'network',text:error.message,retry:()=>this.startLevel(id,false,error.code==='RUN_NOT_ACTIVE'?null:requestId),local:()=>this.startLevel(id,true)};return;}
      }
      const state=Rules.createState(level);this.game={level,state,visual:state,run,ranked:!!run,moves:[],startedAt:run?run.startedAt:Date.now(),serverOffset:run?run.serverNow-Date.now():0,stages:[],stage:null,drag:null,fusions:[],hint:null,completedByMove:0};
      this.navigate('game');this.game.hint=level.id===1?this.getHint():null;this.saveRun();
    }catch(error){if(epoch===this.accountEpoch){this.error=error.message;this.scene='error';}}
    } finally {if(epoch===this.accountEpoch)this.starting=false;}
  }
  requestId(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);}
  elapsed(){if(!this.game)return 0;if(Number.isFinite(this.game.completedMs))return this.game.completedMs;return Math.max(0,Date.now()+this.game.serverOffset-this.game.startedAt);}
  preservePendingResult(){const saved=this.data.run;if(saved&&saved.finished&&saved.ranked&&!this.data.pendingResult){this.data.pendingResult=saved;delete this.data.run;this.save();}}
  saveRun(){
    const g=this.game;if(!g||g.persisted)return;const finished=Rules.isSolved(g.state);
    if(finished){if(!Number.isFinite(g.completedMs))g.completedMs=this.elapsed();const best=this.data.best[g.level.id];this.data.best[g.level.id]=best?Math.min(best,g.completedMs):g.completedMs;}
    const saved={levelId:g.level.id,version:g.level.version,moves:g.moves,run:g.run,ranked:g.ranked,startedAt:g.startedAt,serverOffset:g.serverOffset,finished,completedMs:finished?g.completedMs:null};
    if(finished&&g.ranked){this.data.pendingResult=saved;delete this.data.run;}else this.data.run=saved;
    this.save();
  }
  async resume(forceLocal=false){
    if(this.deleting)return;this.preservePendingResult();const saved=this.data.run||this.data.pendingResult;if(!saved)return;const level=getLevel(saved.levelId);
    const restored=level&&level.version===saved.version?Rules.replay(level,saved.moves):null;
    if(!restored||!restored.ok){this.game=null;this.result=null;if(saved===this.data.pendingResult)delete this.data.pendingResult;else delete this.data.run;this.save();this.navigate('home');this.notify(level&&level.version!==saved.version?'关卡已更新，旧局面无法继续，请重新挑战':'局面记录无法恢复，请重新挑战');return;}
    this.navigate('loading');this.loading={label:'回到未完成的画面',progress:0};
    try {
      await this.assets.loadAll(level.photoIds,p=>this.loading.progress=p);
      let run=forceLocal?null:saved.run,ranked=!forceLocal&&saved.ranked,offset=saved.serverOffset||0;
      if(ranked){
        if(!this.profile&&!(await this.connectCloud(false)))throw new Error('云成绩暂时无法连接，局面仍保存在本机');
        // 已完成的会话直接重试幂等结算，避免响应丢失后被恢复接口降为本地。
        if(!restored.solved){const status=await platform.callCloud('resumeRun',{runId:run.runId});offset=status.serverNow-Date.now();}
      }
      this.game={level,state:restored.state,visual:restored.state,run,ranked,moves:saved.moves,startedAt:saved.startedAt,serverOffset:offset,completedMs:saved.completedMs,stages:[],stage:null,drag:null,fusions:[],hint:null,completedByMove:0};
      if(restored.solved)await this.completeLevel();else this.navigate('game');
    }catch(error){
      this.navigate('home');const terminal=['RUN_EXPIRED','RUN_NOT_ACTIVE','LEVEL_CHANGED','RUN_NOT_FOUND'].includes(error.code);
      this.modal={type:'network',text:error.message,retry:()=>terminal?this.startLevel(saved.levelId):this.resume(),local:()=>this.resume(true)};
    }
  }
  playMove(from,to){const g=this.game;const result=Rules.applyMove(g.state,from,to);if(!result.ok){this.notify(result.reason==='TOO_MANY_MOVES'?'本局操作次数已达上限，请重新挑战':result.reason==='OUT_OF_BOUNDS'?'整块需要放在棋盘内':'这里放不下，换个位置试试');return;}g.state=result.state;g.moves.push({from,to});g.hint=null;g.completedByMove=0;g.stages=result.events.slice();this.saveRun();this.nextStage();}
  nextStage(){const g=this.game;if(!g)return;if(!g.stages.length){g.stage=null;g.visual=g.state;if(Rules.isSolved(g.state))this.completeLevel();return;}const event=g.stages.shift();g.visual=event.before;const duration={move:.18,complete:.86,fall:.2,refill:.42}[event.type]||.12;g.stage={event,t:0,duration};
    if(event.type==='complete'){g.completedByMove+=event.photoIndices.length;this.audio.play(g.completedByMove>1?'win':'complete');if(this.data.settings.haptic)platform.vibrate();}
  }
  landed(stage){const g=this.game;g.visual=stage.event.after;if(stage.event.type==='move'){
    const beforeSizes=new Map();Rules.groups(stage.event.before.board).forEach(group=>group.forEach(i=>beforeSizes.set(stage.event.before.board[i],group.length)));
    const groups=Rules.groups(stage.event.after.board).filter(group=>group.length>1&&group.some(i=>beforeSizes.get(stage.event.after.board[i])<group.length));
    if(groups.length&&!groups.some(group=>group.length===4)){g.fusions=groups.map(group=>({tokens:group.map(i=>stage.event.after.board[i]),t:0}));this.audio.play('merge');if(this.data.settings.haptic)platform.vibrate();}
    }this.nextStage();}
  async completeLevel(){if(this.scene==='result')return;const g=this.game;this.saveRun();this.audio.play('win');this.result={localMs:this.elapsed(),syncing:false,error:null,cloud:null};this.navigate('result');if(g.ranked)await this.syncResult();else{g.persisted=true;delete this.data.run;this.save();}}
  syncResult(){
    if(!this.game||!this.game.run||!this.result)return Promise.resolve(false);
    this.saveRun();return this.retryPendingResult();
  }
  retryPendingResult(){
    if(this.deleting)return Promise.resolve(false);this.preservePendingResult();
    const pending=this.data.pendingResult;if(!pending)return Promise.resolve(true);
    if(this.pendingSync)return this.pendingSync.promise;
    const level=getLevel(pending.levelId);
    if(!level||level.version!==pending.version){delete this.data.pendingResult;this.save();this.notify('关卡已更新，旧局面无法继续，请重新挑战');return Promise.resolve(false);}
    const epoch=this.accountEpoch,runId=pending.run.runId,operation={};this.pendingSync=operation;
    const current=()=>this.accountEpoch===epoch&&this.data.pendingResult?.run?.runId===runId;
    const result=()=>this.game?.run?.runId===runId?this.result:null;
    const view=result();if(view){view.syncing=true;view.error=null;}
    operation.promise=(async()=>{
      try{
        if(!this.profile&&!(await this.connectCloud()))throw new Error('云成绩暂时无法连接，成绩仍保存在本机');
        if(!current())return false;
        const saved=await platform.callCloud('finishRun',{runId,moves:pending.moves});
        if(!current())return false;
        const visible=result();if(visible)visible.cloud=saved;if(this.game?.run?.runId===runId)this.game.persisted=true;
        this.cloudBest[pending.levelId]={levelId:pending.levelId,durationMs:saved.bestMs};delete this.data.pendingResult;
        if(!visible)this.notify('待同步的云成绩已保存');
        this.save();return true;
      }catch(error){if(current()){
        const visible=result();
        if(['RUN_EXPIRED','RUN_NOT_ACTIVE','LEVEL_CHANGED','RUN_NOT_FOUND'].includes(error.code)){const notice=error.message+'，本次成绩保存在本机';if(visible)visible.notice=notice;else this.notify(notice);if(this.game?.run?.runId===runId){this.game.ranked=false;this.game.run=null;this.game.persisted=true;}delete this.data.pendingResult;this.save();}
        else{if(visible)visible.error=error.message;else this.notify(error.message);}
      }return false;}
      finally{if(this.pendingSync===operation){if(view)view.syncing=false;this.pendingSync=null;}}
    })();if(view)view.promise=operation.promise;return operation.promise;
  }
  async showLeaderboard(id=1){this.navigate('leaderboard');this.rank={levelId:id,entries:[],loading:false,error:null,ownBest:null};if(!this.profile)return;this.rank.loading=true;const current=this.rank;
    try{const result=await platform.callCloud('leaderboard',{levelId:id});if(current!==this.rank)return;current.entries=result.entries;current.ownBest=result.ownBest;}catch(error){current.error=error.message;}finally{current.loading=false;}}
  async deleteAccount(){
    if(this.deleting)return false;this.deleting=true;this.modal=null;const epoch=++this.accountEpoch;
    this.cloudConnection=null;this.cloudStatus=this.profile?'ready':'local';this.wechatProfileLoading=false;this.wechatProfileReady=false;this.wechatProfileError=null;this.pendingSync=null;this.starting=false;
    if(this.result)this.result.syncing=false;if(this.wechatProfileButton){this.wechatProfileButton.destroy();this.wechatProfileButton=null;}if(this.avatarImages)this.avatarImages.clear();
    try{await platform.callCloud('deleteAccount',{confirm:true});if(this.accountEpoch!==epoch)return false;this.game=null;this.result=null;this.profile=null;this.cloudBest={};this.cloudStatus='local';delete this.data.consent;delete this.data.consentNoticeVersion;delete this.data.run;delete this.data.pendingResult;this.data.best={};this.data.profile={nickname:'拼图旅人',nicknameId:'traveler',avatarId:'sunflower',avatarUrl:'',profileSource:'guest'};this.save();this.navigate('home');this.notify('云端账号与成绩已清除');return true;}
    catch(error){if(this.accountEpoch===epoch)this.notify(error.message);return false;}
    finally{this.deleting=false;}
  }
  getHint(){const g=this.game;if(!g)return null;if(Rules.findHint)return Rules.findHint(g.state);const solution=g.level.referenceSolution;if(solution&&g.moves.every((m,i)=>solution[i]&&m.from===solution[i].from&&m.to===solution[i].to))return solution[g.moves.length]||null;return null;}
  hint(){const result=this.getHint();if(result)this.game.hint=result;else this.notify('暂未找到提示');}
  down(px,py){const x=px/this.scale,y=py/this.scale;this.audio.unlock();const hit=this.findHit(x,y);this.pointer={sx:x,sy:y,x,y,hit,moved:false,scroll:this.scroll};this.pressed=hit?hit.id:null;if(hit||this.modal||this.scene!=='game'||this.game.stage)return;const from=Board.cell(this,x,y);if(from<0||this.game.visual.board[from]<0)return;this.game.drag={from,sx:x,sy:y,x,y,active:false,group:Rules.groups(this.game.visual.board).find(g=>g.includes(from))};}
  move(px,py){if(!this.pointer)return;const x=px/this.scale,y=py/this.scale,p=this.pointer;p.x=x;p.y=y;if(Math.hypot(x-p.sx,y-p.sy)>7)p.moved=true;if(this.game&&this.game.drag){const d=this.game.drag;d.x=x;d.y=y;d.active=p.moved;}else if(p.moved&&this.maxScroll&&!this.modal){this.scroll=Math.max(0,Math.min(this.maxScroll,p.scroll+p.sy-y));this.pressed=null;}}
  up(px,py){if(!this.pointer)return;const p=this.pointer,x=px/this.scale,y=py/this.scale;this.pointer=null;this.pressed=null;if(this.game&&this.game.drag){const d=this.game.drag;this.game.drag=null;if(d.active){this.game.dragRelease={from:d.from,group:d.group.slice(),dx:x-d.sx,dy:y-d.sy,at:this.now};const target=Board.cell(this,x,y);if(target>=0&&target!==d.from)this.playMove(d.from,target);}return;}if(!p.moved&&p.hit&&this.findHit(x,y)?.id===p.hit.id){this.audio.play('tap');p.hit.fn();}}
  cancel(){if(this.releaseInput)this.releaseInput();this.pointer=null;this.pressed=null;if(this.game)this.game.drag=null;}
  frame(timestamp){requestAnimationFrame(this.frame);if(!this.visible)return;const dt=this.lastFrame?Math.min(.04,(timestamp-this.lastFrame)/1000):0;this.lastFrame=timestamp;this.now+=dt;
    if(this.game&&this.scene==='game'&&this.modal?.type!=='pause'){const g=this.game;g.fusions.forEach(f=>f.t+=dt);g.fusions=g.fusions.filter(f=>f.t<.7);if(g.stage){g.stage.t+=dt;if(g.stage.t>=g.stage.duration)this.landed(g.stage);}}
    this.hits=[];const c=this.ctx;c.setTransform(this.dpr*this.scale,0,0,this.dpr*this.scale,0,0);Scenes.draw(this,c);if(this.toast&&this.toast.until>this.now){U.box(c,25,this.h-this.bottom-72,340,44,'rgba(48,42,68,.94)',14);U.text(c,this.toast.text,195,this.h-this.bottom-50,12,'#fff','center');}
  }
}
module.exports=App;
