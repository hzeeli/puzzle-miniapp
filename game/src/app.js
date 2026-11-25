const platform=require('./platform');
const config=require('./config');
const Rules=require('../../shared/rules');
const Assets=require('./assets');
const AudioManager=require('./audio');
const Board=require('./board');
const U=require('./ui');
const Scenes=require('./scenes');
const Progress=require('./progress');
const Journey=require('../../shared/journey');
const Journal=require('./journey-progress');
const Garden=require('./garden-tools');
class App {
  constructor(){
    this.canvas=platform.createCanvas();this.ctx=this.canvas.getContext('2d');this.assets=new Assets();
    const saved=platform.read(),migrated=saved.schemaVersion!==3;
    this.data=Progress.migrate(saved);
    this.data.profile=this.data.profile||{nickname:'拼图旅人',nicknameId:'traveler',avatarId:'sunflower'};
    this.audio=new AudioManager(this.data.settings);this.scene='loading';this.loading={label:'准备一段美好时光',progress:0};this.modal=null;this.toast=null;
    this.accountEpoch=0;this.deleting=false;this.pendingSync=null;this.cloudConnection=null;this.profile=null;this.cloudStatus='local';this.game=null;this.hits=[];this.pressed=null;this.scroll=0;this.maxScroll=0;this.visible=true;this.now=0;this.rank={entries:[],ownBest:null,loading:false,error:null};this.resize();
    this.wechatProfileLoading=false;this.wechatProfileReady=false;this.wechatProfileError=null;this.wechatProfileButton=null;this.avatarImages=new Map();
    this.releaseInput=platform.bindInput(this.canvas,{down:(x,y)=>this.down(x,y),move:(x,y)=>this.move(x,y),up:(x,y)=>this.up(x,y),cancel:()=>this.cancel()});
    platform.onResize(()=>this.resize());platform.onVisibility(show=>{this.visible=show;if(!show){this.cancel();this.saveRun();this.audio.pause();}else{this.audio.sync();this.lastFrame=0;}});
    platform.onReconnect(()=>this.resumeCloudSync());
    platform.setPrivacyHandler(resolve=>{this.cancel();if(this.wechatProfileButton)this.wechatProfileButton.hide();this.modal={type:'privacy',resolve};});
    if(migrated)this.save();
    this.lastFrame=0;this.frame=this.frame.bind(this);requestAnimationFrame(this.frame);this.boot();
    if(!platform.native)window.__gameApp=this;
  }
  resize(){this.cancel();const info=platform.windowInfo();this.scale=info.width/390;this.h=info.height/this.scale;this.top=info.top/this.scale;this.bottom=info.bottom/this.scale;this.dpr=info.dpr;this.canvas.width=Math.round(info.width*info.dpr);this.canvas.height=Math.round(info.height*info.dpr);if(!platform.native){this.canvas.style.width=info.width+'px';this.canvas.style.height=info.height+'px';}}
  async boot(){
    this.loadRetry=null;
    try{
      const homeAssets=['garden','garden-badges','result-stars','result-ribbon','brand-logo','controls-atlas','photo-01','photo-02','photo-05'];
      await this.assets.loadAll(homeAssets,p=>this.loading.progress=p);
      this.navigate('home');this.resumeCloudSync();
    }catch(error){this.scene='error';this.error=error.message;}
  }
  async resumeCloudSync(){
    if(this.deleting||this.data.consent!==config.consentVersion||!platform.cloudReady())return;
    const epoch=this.accountEpoch;
    if(!this.profile&&!(await this.connectCloud()))return;
    if(epoch!==this.accountEpoch)return;
    try{await this.flushProofs();}catch(error){if(epoch===this.accountEpoch)this.notify(error.message);}
  }
  save(){if(!platform.write(this.data))this.notify('本机存储空间不足，进度暂未保存');}
  notify(text){this.toast={text,until:this.now+3};}
  navigate(scene){this.cancel();this.scene=scene;this.sceneAt=this.now;this.scroll=0;this.maxScroll=0;this.modal=null;this.hits=[];if(scene==='profile'&&platform.native&&this.data.consentNoticeVersion===config.consentVersion)this.prepareWechatProfile();}
  hit(id,x,y,w,h,fn){if(this.clip){const top=Math.max(y,this.clip.top),bottom=Math.min(y+h,this.clip.bottom);if(bottom<=top)return;y=top;h=bottom-top;}this.hits.push({id,x,y,w,h,fn});}
  findHit(x,y){return this.hits.slice().reverse().find(a=>x>=a.x&&x<=a.x+a.w&&y>=a.y&&y<=a.y+a.h);}
  connectCloud(){
    if(!platform.cloudReady()){this.cloudError='请在微信中打开闯关榜';return Promise.resolve(false);}
    if(this.deleting)return Promise.resolve(false);if(this.cloudConnection)return this.cloudConnection.promise;
    const epoch=this.accountEpoch,profileAtStart=this.profile,operation={};this.cloudConnection=operation;this.cloudStatus='loading';
    operation.promise=(async()=>{try{await platform.authorizePrivacy(this.data.consentNoticeVersion!==config.consentVersion);if(epoch!==this.accountEpoch)return false;this.data.consent=config.consentVersion;this.data.consentNoticeVersion=config.consentVersion;this.save();
      const result=await platform.callCloud('storyBootstrap',{consentVersion:config.consentVersion});
      if(epoch!==this.accountEpoch)return false;
      if(result.rankingVersion!==1||!result.publicProfile?.id)throw new Error('闯关榜服务尚未就绪，请稍后重试');
      if(this.profile===profileAtStart)this.profile=result.publicProfile;
      const playerId=this.profile.id;
      if(this.data.rankAccount?.playerId!==playerId)this.data.rankAccount={playerId,highestLevel:0};
      this.acceptCloudLevel(result.highestLevel);
      this.cloudError=null;this.cloudStatus='ready';this.data.profile=this.profile;this.save();return true;
    }catch(error){if(epoch===this.accountEpoch){this.cloudError=error.message;this.cloudStatus='error';if(error.code==='PRIVACY_NOT_AUTHORIZED'){this.profile=null;delete this.data.consent;delete this.data.consentNoticeVersion;this.save();}this.notify(error.message);}return false;}
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
    if(!result||(result.errMsg&&!result.errMsg.includes(':ok'))){this.wechatProfileReady=false;this.wechatProfileError=platform.userInfoFailure(result).message;this.notify(this.wechatProfileError);return false;}
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
  previewLevel(level){
    this.selectedLevel=level;this.navigate('level-intro');
    this.assets.loadAll(level.photoIds).catch(()=>{
      if(this.selectedLevel===level&&this.scene==='level-intro')this.notify('图片暂未下载，开始时将重试');
    });
  }
  openSession(session){
    if(this.data.journeyRuns?.story?.session.index===session.index)return this.resumeSession('story');
    this.previewLevel(Journey.buildLevel(session));
  }
  beginSelected(){return this.startLevel(this.selectedLevel);}
  restartLevel(){return this.startLevel(this.game.level,this.game.verifying);}
  startNextLevel(){
    const saved=this.data.journeyRuns?.story;
    if(saved)return this.resumeSession('story');
    return this.startLevel(Journey.buildLevel(Journal.nextStory(this.data)));
  }
  nextVerificationLevel(){
    const next=this.verifiedLevel()+1;
    if(this.game?.verifying&&this.result?.cloud&&next<=Journal.highestCleared(this.data)&&!this.proofFor(next))return next;
    return null;
  }
  async verifyRankLevel(index){
    if(index!==this.verifiedLevel()+1||index>Journal.highestCleared(this.data))return;
    if(this.data.rankVerification?.session.index===index)return this.resumeSession('verification');
    return this.startLevel(Journey.buildLevel(Journey.storySession(index)),true);
  }
  async resumeSession(slot='story'){
    const verifying=slot==='verification';
    const saved=verifying?this.data.rankVerification:this.data.journeyRuns?.story;
    if(!saved)return;
    let level;
    try{level=Journey.buildLevel(saved.session);}catch(error){this.clearBadRun(verifying);return;}
    const restored=Garden.replay(level,saved.moves,saved.toolHistory);
    if(!restored.ok){this.clearBadRun(verifying);return;}
    return this.startLevel(level,verifying,saved,restored.state);
  }
  clearBadRun(verifying){
    if(verifying)delete this.data.rankVerification;else if(this.data.journeyRuns)delete this.data.journeyRuns.story;
    this.save();this.navigate('home');this.notify('这一局的记录无法恢复，可以重新开始本关');
  }
  async startLevel(level,verifying=false,saved=null,restored=null){
    if(!level||level.session?.mode!=='story'||this.starting||this.deleting)return;
    this.starting=true;
    const epoch=this.accountEpoch;
    this.navigate('loading');this.loading={label:'正在铺开拼图',progress:0};
    try{
      await this.assets.loadAll(level.photoIds,p=>{if(epoch===this.accountEpoch)this.loading.progress=p;});
      if(epoch!==this.accountEpoch)return;
      const state=restored||Rules.createState(level);
      this.game={level,state,visual:state,verifying,moves:saved?.moves||[],toolHistory:saved?.toolHistory||[],
        startedAt:saved?.startedAt??Date.now(),completedMs:saved?.completedMs,focus:saved?.focus,
        stages:[],stage:null,drag:null,fusions:[],hint:null,completedByMove:0};
      this.navigate('game');
      if(Rules.isSolved(state))await this.completeLevel();
      else{if(level.id===1&&!this.game.moves.length)this.game.hint=this.getHint();this.saveRun();}
    }catch(error){
      if(epoch===this.accountEpoch){this.error=error.message;this.loadRetry=()=>this.startLevel(level,verifying,saved,restored);this.navigate('error');}
    }finally{if(epoch===this.accountEpoch)this.starting=false;}
  }
  elapsed(){
    const game=this.game;if(!game)return 0;
    return Number.isFinite(game.completedMs)?game.completedMs:Math.max(0,Date.now()-game.startedAt);
  }
  saveRun(){
    const game=this.game;if(!game||game.persisted)return;
    const finished=Rules.isSolved(game.state);
    if(finished&&!Number.isFinite(game.completedMs))game.completedMs=this.elapsed();
    Journal.record(this.data,game,finished);
    const session=game.level.session;
    const saved={session,moves:game.moves,startedAt:game.startedAt,completedMs:game.completedMs,toolHistory:game.toolHistory,focus:game.focus};
    if(game.verifying)this.data.rankVerification=saved;
    else{if(!this.data.journeyRuns)this.data.journeyRuns={};this.data.journeyRuns.story=saved;}
    if(finished&&session.index>this.verifiedLevel()){
      if(!this.data.storyProofs)this.data.storyProofs={};
      this.data.storyProofs[session.index]={level:session.index,sessionVersion:session.version,moves:game.moves,toolHistory:game.toolHistory||[],owner:this.data.rankAccount?.playerId};
    }
    this.save();
  }
  playMove(from,to){const g=this.game;const result=Rules.applyMove(g.state,from,to);if(!result.ok){if(result.reason==='PINNED_BLOCKED')this.audio.play('pin-locked');this.notify(result.reason==='PINNED_BLOCKED'?'这里有雏菊花扣，先拼好扣住的照片':result.reason==='TOO_MANY_MOVES'?'本局操作次数已达上限，请重新挑战':result.reason==='OUT_OF_BOUNDS'?'整块需要放在棋盘内':'这里放不下，换个位置试试');return;}this.audio.play('drop');g.moves.push({from,to});this.presentTurn(result);}
  presentTurn(result){
    const g=this.game;
    g.state=result.state;g.hint=null;g.completedByMove=0;g.stages=result.events.slice();
    this.saveRun();this.nextStage();
  }
  useGardenTool(id){return Garden.use(this,id);}
  nextStage(){const g=this.game;if(!g)return;if(!g.stages.length){g.stage=null;g.visual=g.state;if(Rules.isSolved(g.state))this.completeLevel();return;}const event=g.stages.shift();g.visual=event.before;const duration={move:.18,reveal:.34,complete:.88,fall:.2,refill:.40}[event.type]||.12;g.stage={event,t:0,duration};
    if(event.type==='reveal')this.audio.play('reveal');
    if(event.type==='complete'){if(event.unpinnedTokens?.length)this.audio.play('unpin');g.completedByMove+=event.photoIndices.length;this.audio.play(g.completedByMove>=3?'combo-3':g.completedByMove===2?'combo-2':'complete');if(this.data.settings.haptic)platform.vibrate();}
  }
  landed(stage){const g=this.game;g.visual=stage.event.after;if(stage.event.type==='move'){
    const beforeSizes=new Map();Rules.groups(stage.event.before.board,stage.event.before.hidden).forEach(group=>group.forEach(i=>beforeSizes.set(stage.event.before.board[i],group.length)));
    const groups=Rules.groups(stage.event.after.board,stage.event.after.hidden).filter(group=>group.length>1&&group.some(i=>beforeSizes.get(stage.event.after.board[i])<group.length));
    if(groups.length&&!groups.some(group=>group.length===4)){g.fusions=groups.map(group=>({tokens:group.map(i=>stage.event.after.board[i]),t:0}));this.audio.play('merge');if(this.data.settings.haptic)platform.vibrate();}
    }this.nextStage();}
  async completeLevel(){
    if(this.scene==='result')return;
    const g=this.game;this.saveRun();this.audio.play('win');g.persisted=true;
    if(g.verifying)delete this.data.rankVerification;else delete this.data.journeyRuns.story;
    this.save();this.result={localMs:this.elapsed(),stars:g.stars||0,syncing:false,cloud:null,error:null,notice:'进度已保存在本机'};
    this.navigate('result');
    if(this.data.consent===config.consentVersion&&platform.cloudReady())await this.syncResult();
  }
  verifiedLevel(){return this.data.rankAccount?.highestLevel||0;}
  proofFor(level){
    const proof=this.data.storyProofs?.[level];
    return proof&&(!proof.owner||proof.owner===this.data.rankAccount?.playerId)?proof:null;
  }
  acceptCloudLevel(level){
    if(!Number.isSafeInteger(level)||level<0)throw new Error('云端进度返回异常，请重试');
    const account=this.data.rankAccount;
    account.highestLevel=Math.max(account.highestLevel,level);
    for(const key of Object.keys(this.data.storyProofs||{})){
      if(Number(key)<=account.highestLevel&&this.proofFor(Number(key)))delete this.data.storyProofs[key];
    }
    this.save();
  }
  flushProofs(){
    if(this.pendingSync)return this.pendingSync.promise;
    const epoch=this.accountEpoch,account=this.data.rankAccount,op={};
    if(!account||!this.profile||this.deleting)return Promise.resolve();
    this.pendingSync=op;
    op.promise=Promise.resolve().then(async()=>{
      while(epoch===this.accountEpoch&&this.data.rankAccount===account){
        const level=account.highestLevel+1,proof=this.proofFor(level);
        if(!proof)return;
        const {sessionVersion,moves,toolHistory}=proof;
        const answer=await platform.callCloud('submitStoryClear',{playerId:account.playerId,level,sessionVersion,moves,toolHistory});
        if(epoch!==this.accountEpoch||this.data.rankAccount!==account)return;
        if(!(answer.highestLevel>=level))throw new Error('云端尚未确认这次通关，请重试');
        this.acceptCloudLevel(answer.highestLevel);
      }
    }).finally(()=>{if(this.pendingSync===op)this.pendingSync=null;});
    return op.promise;
  }
  async syncResult(){
    const view=this.result,game=this.game,epoch=this.accountEpoch;
    if(!view||!game||this.deleting)return false;
    view.syncing=true;view.error=null;
    try{
      if(!this.profile&&!(await this.connectCloud()))throw new Error(this.cloudError||'排行榜暂时无法连接');
      if(epoch!==this.accountEpoch)return false;
      await this.flushProofs();if(epoch!==this.accountEpoch)return false;
      const highestLevel=this.verifiedLevel();
      if(highestLevel>=game.level.id){view.cloud={highestLevel};view.notice='已同步到闯关榜';}
      else view.notice='进度已保存，可到闯关榜补验第 '+(highestLevel+1)+' 关';
      return !!view.cloud;
    }catch(error){if(epoch===this.accountEpoch)view.error=error.message;return false;}
    finally{view.syncing=false;}
  }
  async showLeaderboard(){
    if(this.deleting)return;
    this.navigate('leaderboard');
    const current={entries:[],ownBest:null,loading:true,error:null};
    this.rank=current;const epoch=this.accountEpoch;
    try{
      if(!this.profile&&!(await this.connectCloud()))throw new Error(this.cloudError||'暂未开启云端排名');
      if(epoch!==this.accountEpoch||this.rank!==current)return;
      const read=async()=>{
        const board=await platform.callCloud('storyLeaderboard',{});
        if(this.rank!==current||epoch!==this.accountEpoch)return;
        if(board.rankingVersion!==1||!Array.isArray(board.entries))throw new Error('排行榜返回异常，请重试');
        current.entries=board.entries.map(e=>({...e,levelId:e.level}));
        current.ownBest=board.own?{...board.own,levelId:board.own.level}:null;
        this.acceptCloudLevel(board.own?.level||0);
        current.loading=false;
      };
      await read();
      if(this.rank!==current||epoch!==this.accountEpoch)return;
      if(this.proofFor(this.verifiedLevel()+1)){
        current.syncing=true;
        try{await this.flushProofs();await read();}
        catch(error){current.syncError=error.message;current.needsReplay=['INVALID_MOVES','UNSOLVED_RUN','INVALID_ARGUMENT'].includes(error.code);}
        finally{current.syncing=false;}
      }
      const next=this.verifiedLevel()+1;
      if(next<=Journal.highestCleared(this.data)&&(current.needsReplay||!this.proofFor(next)))current.verifyLevel=next;
    }catch(error){if(this.rank===current&&epoch===this.accountEpoch)current.error=error.message;}
    finally{current.loading=false;}
  }
  async deleteAccount(){
    if(this.deleting)return false;this.deleting=true;this.modal=null;const epoch=++this.accountEpoch;
    this.cloudConnection=null;this.cloudStatus=this.profile?'ready':'local';this.wechatProfileLoading=false;this.wechatProfileReady=false;this.wechatProfileError=null;this.pendingSync=null;this.starting=false;
    if(this.result)this.result.syncing=false;if(this.wechatProfileButton){this.wechatProfileButton.destroy();this.wechatProfileButton=null;}if(this.avatarImages)this.avatarImages.clear();
    try{await platform.callCloud('deleteAccount',{confirm:true});if(this.accountEpoch!==epoch)return false;this.game=null;this.result=null;this.profile=null;this.cloudStatus='local';this.rank={entries:[],ownBest:null,loading:false,error:null};this.data=Progress.migrate({settings:this.data.settings,profile:{nickname:'拼图旅人',avatarId:'sunflower',avatarUrl:'',profileSource:'guest'}});this.save();this.navigate('home');this.notify('云端账号与成绩已清除');return true;}
    catch(error){if(this.accountEpoch===epoch)this.notify(error.message);return false;}
    finally{this.deleting=false;}
  }
  getHint(){const g=this.game;if(!g)return null;if(Rules.findHint)return Rules.findHint(g.state);const solution=g.level.referenceSolution;if(solution&&g.moves.every((m,i)=>solution[i]&&m.from===solution[i].from&&m.to===solution[i].to))return solution[g.moves.length]||null;return null;}
  hint(){const result=this.getHint();if(result)this.game.hint=result;else this.notify('暂未找到提示');}
  down(px,py){const x=px/this.scale,y=py/this.scale;this.audio.unlock();const hit=this.findHit(x,y);this.pointer={sx:x,sy:y,x,y,hit,moved:false,scroll:this.scroll};this.pressed=hit?hit.id:null;if(hit||this.modal||this.scene!=='game'||this.game.stage)return;const from=Board.cell(this,x,y);if(from<0||this.game.visual.board[from]<0)return;const state=this.game.visual,group=Rules.groups(state.board,state.hidden).find(g=>g.includes(from));
    const pin=group.map(i=>state.board[i]).find(token=>state.pinned?.includes(token));
    if(pin!==undefined){this.game.pinBlocked={token:pin,at:this.now};this.audio.play('pin-locked');this.notify('这角被雏菊扣住啦，拼好照片就会松开');return;}
    this.audio.play('pickup');this.game.drag={from,sx:x,sy:y,x,y,active:false,group};}
  move(px,py){if(!this.pointer)return;const x=px/this.scale,y=py/this.scale,p=this.pointer;p.x=x;p.y=y;if(Math.hypot(x-p.sx,y-p.sy)>7)p.moved=true;if(this.game&&this.game.drag){const d=this.game.drag;d.x=x;d.y=y;d.active=p.moved;}else if(p.moved&&this.maxScroll&&!this.modal){this.scroll=Math.max(0,Math.min(this.maxScroll,p.scroll+p.sy-y));this.pressed=null;}}
  up(px,py){if(!this.pointer)return;const p=this.pointer,x=px/this.scale,y=py/this.scale;this.pointer=null;this.pressed=null;if(this.game&&this.game.drag){const d=this.game.drag;this.game.drag=null;if(d.active){this.game.dragRelease={from:d.from,group:d.group.slice(),dx:x-d.sx,dy:y-d.sy,at:this.now};const target=Board.cell(this,x,y);if(target>=0&&target!==d.from)this.playMove(d.from,target);}return;}if(!p.moved&&p.hit&&this.findHit(x,y)?.id===p.hit.id){this.audio.play('tap');p.hit.fn();}}
  cancel(){if(this.releaseInput)this.releaseInput();this.pointer=null;this.pressed=null;if(this.game)this.game.drag=null;}
  frame(timestamp){requestAnimationFrame(this.frame);if(!this.visible)return;const dt=this.lastFrame?Math.min(.04,(timestamp-this.lastFrame)/1000):0;this.lastFrame=timestamp;this.now+=dt;
    if(this.game&&this.scene==='game'&&this.modal?.type!=='pause'){const g=this.game;g.fusions.forEach(f=>f.t+=dt);g.fusions=g.fusions.filter(f=>f.t<.7);if(g.stage){g.stage.t+=dt;if(g.stage.t>=g.stage.duration)this.landed(g.stage);}}
    this.hits=[];const c=this.ctx;c.setTransform(this.dpr*this.scale,0,0,this.dpr*this.scale,0,0);Scenes.draw(this,c);if(this.toast&&this.toast.until>this.now){U.box(c,25,this.h-this.bottom-72,340,44,'rgba(48,42,68,.94)',14);U.text(c,this.toast.text,195,this.h-this.bottom-50,12,'#fff','center');}
  }
}
module.exports=App;
