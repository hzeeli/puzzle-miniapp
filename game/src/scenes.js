const U=require('./ui'),B=require('./board');
const {levels,getLevel}=require('../../shared/levels');
const P=U.palette;
const COVER_FOCUS=[.29,.43,.5,.3,.34,.5,.29,.3,.36,.5];
const LEVEL_COVERS=['photo-01','photo-06','photo-05','photo-02','photo-09','photo-03','photo-11','photo-08','photo-07','photo-12'];
function coverPhoto(level){return LEVEL_COVERS[level.id-1];}
const completed=app=>new Set([...Object.keys(app.data.best||{}),...Object.keys(app.cloudBest||{})]);
function recommended(app){const done=completed(app);return levels.find(level=>!done.has(String(level.id)))||levels[levels.length-1];}
function background(app,c){const image=app.assets.get('stage-background');if(image)U.photo(c,image,0,0,390,app.h,0);else{c.fillStyle='#387fa7';c.fillRect(0,0,390,app.h);}}
function nav(app,c,title,back=()=>app.navigate('home')){U.control(c,app,'back','back',31,app.top+26,43,back);U.title(c,title,195,app.top+23,27);}
function openLevels(app){app.navigate('levels');app.assets.loadAll(levels.map(coverPhoto)).catch(()=>app.notify('部分照片尚未准备好，请重试'));}
function cloudControl(app,c,x,y,size=36){const pending=app.data.pendingResult,busy=app.pendingSync||app.cloudStatus==='loading';U.control(c,app,'cloud-state','cloud',x,y,size,()=>pending?app.retryPendingResult():app.connectCloud(),{disabled:!!busy});if(pending){c.fillStyle='#f8bf60';c.beginPath();c.arc(x+size*.29,y-size*.29,4,0,7);c.fill();}else if(app.cloudStatus==='ready')U.symbol(c,'check',x+size*.28,y+size*.24,12,'#fff8de');}
function homeLayout(app){
  const bottom=app.h-app.bottom,usable=bottom-app.top,controlsY=bottom-38;
  const cta={x:48,y:controlsY-114,w:294,h:66};
  const level={x:142,y:cta.y-36,w:106,h:26};
  const progress={x:131,y:level.y-42,w:138,h:30};
  const logo={x:54,y:app.top+38,w:282,h:usable<660?64:80};
  const area={x:10,y:logo.y+logo.h+12,w:370,h:progress.y-20-(logo.y+logo.h+12)};
  const cards=usable<660
    ?{left:{x:18,y:10,w:160,h:150,a:-.12},right:{x:212,y:14,w:160,h:150,a:.12},main:{x:60,y:35,w:270,h:200,a:0,focusY:.31},floating:{x:241,y:143,w:135,h:100,a:-.085}}
    :{left:{x:22,y:20,w:160,h:216,a:-.12},right:{x:208,y:25,w:160,h:216,a:.12},main:{x:60,y:52,w:270,h:300,a:0},floating:{x:241,y:235,w:135,h:150,a:-.085}};
  const bounds=Object.values(cards).map(r=>{const hw=(r.w+36)/2,hh=(r.h+36)/2,dx=Math.abs(Math.cos(r.a))*hw+Math.abs(Math.sin(r.a))*hh,dy=Math.abs(Math.sin(r.a))*hw+Math.abs(Math.cos(r.a))*hh;return{x:r.x+r.w/2-dx,y:r.y+r.h/2-dy,right:r.x+r.w/2+dx,bottom:r.y+r.h/2+dy};});
  const x=Math.min(...bounds.map(r=>r.x)),y=Math.min(...bounds.map(r=>r.y)),w=Math.max(...bounds.map(r=>r.right))-x,h=Math.max(...bounds.map(r=>r.bottom))-y,scale=Math.min(1,area.w/w,area.h/h);
  const art={x:area.x+(area.w-w*scale)/2-x*scale,y:area.y+(area.h-h*scale)/2-y*scale,scale,cards};
  return{logo,art,heroBounds:{x:art.x+x*scale,y:art.y+y*scale,w:w*scale,h:h*scale},progress,level,cta,controlsY};
}
function homeArt(app,c,art){
  const {left,right,main,floating}=art.cards,{x,y,w,h}=main;
  c.save();c.translate(art.x,art.y);c.scale(art.scale,art.scale);
  U.frame(c,app.assets.get('photo-02'),left.x,left.y,left.w,left.h,left.a);
  U.frame(c,app.assets.get('photo-05'),right.x,right.y,right.w,right.h,right.a);
  c.save();c.shadowColor='rgba(4,42,68,.45)';c.shadowBlur=10;c.shadowOffsetY=7;U.box(c,x-4,y-4,w+8,h+10,'#d0a974',13);c.shadowColor='transparent';U.box(c,x-4,y-4,w+8,h+8,'#fff2d3',13);U.box(c,x,y,w,h,U.gradient(c,x,y,w,h,['#4a9ac4','#2679a1']),9);
  const image=app.assets.get('photo-01'),crop=image?U.crop(image,w,h):null,tw=w/2,th=h/2;
  if(crop&&main.focusY!==undefined)crop.y=Math.max(0,Math.min(image.height-crop.h,image.height*main.focusY-crop.h/2));
  if(image)for(let q=0;q<3;q++){c.save();U.rounded(c,x+q%2*tw,y+Math.floor(q/2)*th,tw,th,3);c.clip();c.drawImage(image,crop.x+q%2*crop.w/2,crop.y+Math.floor(q/2)*crop.h/2,crop.w/2,crop.h/2,x+q%2*tw,y+Math.floor(q/2)*th,tw,th);c.restore();}
  c.strokeStyle='#fff2d4';c.lineWidth=1.2;c.beginPath();c.moveTo(x+tw,y);c.lineTo(x+tw,y+h);c.moveTo(x,y+th);c.lineTo(x+w,y+th);c.stroke();c.restore();
  if(image){c.save();c.translate(floating.x+tw/2,floating.y+th/2);c.rotate(floating.a);c.shadowColor='rgba(4,42,68,.4)';c.shadowBlur=9;c.shadowOffsetY=6;U.box(c,-tw/2-3,-th/2-3,tw+6,th+8,'#efd29d',9);c.shadowColor='transparent';U.box(c,-tw/2-2,-th/2-2,tw+4,th+4,'#fff7df',9);c.save();U.rounded(c,-tw/2,-th/2,tw,th,7);c.clip();c.drawImage(image,crop.x+crop.w/2,crop.y+crop.h/2,crop.w/2,crop.h/2,-tw/2,-th/2,tw,th);c.restore();c.restore();}
  c.restore();
}
function home(app,c){
  const layout=homeLayout(app),next=getLevel(app.data.run?.levelId)||recommended(app),{logo,art,progress,level,cta,controlsY}=layout;
  U.control(c,app,'profile-settings','settings',357,app.top+26,43,()=>app.navigate('profile'));
  if(app.data.pendingResult||app.cloudStatus!=='ready')cloudControl(app,c,31,app.top+26,37);
  U.contain(c,app.assets.get('brand-logo'),logo.x,logo.y,logo.w,logo.h);
  homeArt(app,c,art);
  U.surface(c,progress.x,progress.y,progress.w,progress.h);U.atlas(c,app,'album',136,progress.y-2,34);U.title(c,completed(app).size+' / '+levels.length,222,progress.y+15,17);
  U.surface(c,level.x,level.y,level.w,level.h);U.title(c,'第 '+next.id+' 关',195,level.y+level.h/2,18);
  U.button(c,app,'play',app.data.run?'继续拼图':'开始拼图',cta.x,cta.y,cta.w,cta.h,()=>app.data.run?app.resume():app.chooseLevel(next.id),{size:29});
  U.control(c,app,'home-levels','album',92,controlsY,60,()=>openLevels(app));U.control(c,app,'home-ranks','trophy',195,controlsY,60,()=>app.showLeaderboard(next.id));U.avatar(c,app,app.data.profile,298,controlsY,25);app.hit('home-profile',269,controlsY-29,58,58,()=>app.navigate('profile'));
}

function levelList(app,c){
  nav(app,c,'选择关卡');const top=app.top+66,bottom=app.h-app.bottom-8,cardW=169,cardH=126,pitch=140,done=completed(app),next=recommended(app);
  app.maxScroll=Math.max(0,pitch*5-(bottom-top));c.save();c.beginPath();c.rect(0,top-4,390,bottom-top+4);c.clip();app.clip={top,bottom};
  levels.forEach((level,i)=>{const x=17+i%2*187,y=top+Math.floor(i/2)*pitch-app.scroll;if(level.id===next.id){c.save();c.shadowColor='#ffe5a6';c.shadowBlur=12;U.box(c,x-4,y-4,cardW+8,cardH+8,'#ffe8b3',12);c.restore();}U.frame(c,app.assets.get(coverPhoto(level)),x,y,cardW,cardH,0,{flat:true,focusY:COVER_FOCUS[i]});U.surface(c,x+6,y+6,31,31);U.title(c,String(level.id).padStart(2,'0'),x+21.5,y+22,15);if(done.has(String(level.id))){U.medal(c,1,x+cardW-15,y+cardH-15,13);U.box(c,x+cardW-26,y+cardH-26,22,22,'#4f934b',11);U.symbol(c,'check',x+cardW-15,y+cardH-15,18);}app.hit('level-'+level.id,x-2,y-2,cardW+4,cardH+4,()=>app.chooseLevel(level.id));});app.clip=null;c.restore();
}
function intro(app,c){
  const level=app.selectedLevel,bottom=app.h-app.bottom,buttonY=bottom-119;nav(app,c,'第 '+level.id+' 关');
  const top=app.top+92,areaH=buttonY-top-89,cols=level.photoIds.length<=4?2:4,rows=Math.ceil(level.photoIds.length/cols),w=cols===2?143:83,h=Math.min(cols===2?196:220,(areaH-15*(rows-1))/rows),left=(390-(w+7)*cols+7)/2;
  level.photoIds.forEach((id,i)=>{const col=i%cols,row=Math.floor(i/cols),angle=(col-(cols-1)/2)*.045,yy=top+row*(h+11)+Math.abs(col-(cols-1)/2)*5;U.frame(c,app.assets.get(id),left+col*(w+7),yy,w,h,angle);});
  U.surface(c,151,buttonY-49,100,33);U.atlas(c,app,'album',133,buttonY-57,47);U.title(c,level.photoIds.length+' 张',211,buttonY-32,21);
  U.button(c,app,'start-level','开始',52,buttonY,286,70,()=>app.startLevel(level.id),{size:31});cloudControl(app,c,195,bottom-24,38);
}
function game(app,c){
  const g=app.game,top=app.top;U.surface(c,11,top+6,96,31);U.symbol(c,'clock',26,top+22,18);U.title(c,U.time(app.elapsed()),70,top+22,18);U.title(c,'第 '+g.level.id+' 关',192,top+22,25);U.surface(c,258,top+6,76,31);U.atlas(c,app,'album',251,top+1,37);U.title(c,g.visual.completed.length+'/'+g.level.photoIds.length,311,top+22,16);U.control(c,app,'pause','pause',361,top+23,39,()=>app.modal={type:'pause'});
  B.draw(app,c);const b=B.layout(app);if(!b.compact){U.control(c,app,'hint','hint',137,b.footerY,59,()=>app.hint());U.control(c,app,'game-photos','album',253,b.footerY,59,()=>app.modal={type:'photos',photoIds:g.level.photoIds});}
}
function result(app,c){
  const g=app.game,r=app.result,bottom=app.h-app.bottom,buttonY=bottom-153;U.control(c,app,'result-home','home',32,app.top+26,43,()=>app.navigate('home'));U.title(c,'完成',195,app.top+66,41);
  const photoY=app.top+119,photoH=Math.min(350,buttonY-photoY-116),photoW=photoH*.77,ids=g.state.completed.map(i=>g.level.photoIds[i]),last=ids[ids.length-1]||g.level.photoIds[0];
  if(ids.length>1)U.frame(c,app.assets.get(ids[0]),18,photoY+35,photoW*.64,photoH*.77,-.10);
  if(ids.length>2)U.frame(c,app.assets.get(ids[1]),372-photoW*.64,photoY+35,photoW*.64,photoH*.77,.10);
  U.frame(c,app.assets.get(last),195-photoW/2,photoY,photoW,photoH);U.sparkle(c,195-photoW/2-6,photoY+7,7);U.sparkle(c,195+photoW/2-3,photoY+photoH*.2,5);
  const clockY=photoY+photoH+22;U.surface(c,85,clockY,220,50);U.symbol(c,'clock',113,clockY+25,29);U.title(c,U.time(r.cloud?r.cloud.durationMs:r.localMs,true),217,clockY+26,28);
  if(r.cloud?.isPersonalBest){U.surface(c,269,clockY-14,73,27,{gold:true});U.title(c,'新纪录',305,clockY,14,P.brown);}
  const status=r.syncing?'正在同步…':r.error?'未同步 · 点击重试':r.notice?r.notice:r.cloud?'第 '+r.cloud.rank+' 名':'本地成绩';const statusY=Math.min(buttonY-25,clockY+69);U.text(c,status.length>25?'本次成绩已保存在本机':status,195,statusY,11,r.error?'#fff0ae':P.cream,'center');if(r.error)app.hit('retry-result',61,statusY-15,268,31,()=>app.syncResult());
  U.button(c,app,'next',g.level.id<levels.length?'下一关':'返回相册',62,buttonY,266,68,()=>g.level.id<levels.length?app.chooseLevel(g.level.id+1):openLevels(app),{size:30});
  U.control(c,app,'retry-level','replay',133,bottom-39,66,()=>app.startLevel(g.level.id));U.control(c,app,'result-rank','trophy',257,bottom-39,66,()=>app.showLeaderboard(g.level.id));
}
function podium(app,c,entries,top){
  const placement=[{index:1,x:77,y:top+91,h:67,r:38},{index:0,x:195,y:top+70,h:88,r:45},{index:2,x:313,y:top+94,h:64,r:37}];
  for(const spot of placement){const entry=entries[spot.index];if(!entry)continue;U.surface(c,spot.x-54,spot.y,108,spot.h);U.avatar(c,app,entry,spot.x,spot.y-33,spot.r);if(spot.index===0)U.symbol(c,'crown',spot.x,spot.y-spot.r-49,29,'#f5c462');U.medal(c,entry.rank,spot.x,spot.y+4,15);U.title(c,U.ellipsis(c,entry.nickname,96,14,800),spot.x,spot.y+35,14);U.box(c,spot.x-40,spot.y+50,80,23,'#ffe8b4',12);U.text(c,U.time(entry.durationMs,true),spot.x,spot.y+62,14,P.ink,'center',800);}
}
function ranks(app,c){
  const r=app.rank;nav(app,c,'排行榜');const selectorY=app.top+64;U.surface(c,140,selectorY,110,32);U.title(c,'第 '+r.levelId+' 关',195,selectorY+17,20);U.control(c,app,'rank-prev','back',118,selectorY+16,36,()=>app.showLeaderboard(r.levelId===1?levels.length:r.levelId-1));U.control(c,app,'rank-next','back',272,selectorY+16,36,()=>app.showLeaderboard(r.levelId===levels.length?1:r.levelId+1),{mirror:true});
  const top=selectorY+59,bottom=app.h-app.bottom-77;
  if(!app.profile){U.atlas(c,app,'cloud',155,top+52,80);U.title(c,'开启云成绩',195,top+175,24);U.button(c,app,'rank-login',app.cloudStatus==='loading'?'连接中…':'开启',68,Math.min(bottom-91,top+241),254,64,async()=>{if(await app.connectCloud())app.showLeaderboard(r.levelId);},{disabled:app.cloudStatus==='loading'});return;}
  if(r.loading){U.text(c,'正在加载…',195,top+150,15,P.cream,'center');return;}
  if(r.error){U.wrap(c,r.error,42,top+105,306,13,P.cream);U.button(c,app,'rank-retry','重试',75,top+211,240,61,()=>app.showLeaderboard(r.levelId));return;}
  if(!r.entries.length){U.atlas(c,app,'trophy',144,top+45,102);U.title(c,'还没有成绩',195,top+184,23);U.button(c,app,'rank-challenge','挑战',68,Math.min(bottom-91,top+247),254,64,()=>app.chooseLevel(r.levelId));return;}
  const contentH=208+Math.max(0,r.entries.length-3)*52;app.maxScroll=Math.max(0,contentH-(bottom-top));c.save();c.beginPath();c.rect(0,top-3,390,bottom-top+3);c.clip();podium(app,c,r.entries,top+39-app.scroll);
  r.entries.slice(3).forEach((entry,i)=>{const y=top+214+i*52-app.scroll;U.surface(c,14,y,362,44,{gold:entry.isSelf});U.title(c,entry.rank,36,y+23,20,entry.isSelf?P.brown:P.cream);U.avatar(c,app,entry,77,y+22,18);U.text(c,U.ellipsis(c,entry.nickname,158,13,700),107,y+23,13,entry.isSelf?P.brown:P.cream,'left',700);U.box(c,276,y+7,87,30,entry.isSelf?'rgba(161,103,32,.32)':'rgba(9,64,105,.28)',16,'rgba(222,244,247,.35)');U.title(c,U.time(entry.durationMs,true),319,y+23,17);});c.restore();
  const own=r.ownBest,y=app.h-app.bottom-59;U.surface(c,27,y,336,44);U.symbol(c,'crown',50,y+22,21,'#f4cd7b');U.title(c,'我的最佳',126,y+23,17);U.title(c,own?U.time(own.durationMs,true):'—',282,y+23,20);app.hit('own-rank',27,y,336,44,()=>app.chooseLevel(r.levelId));
}
function nativeProfileButton(app,rect){
  const visible=app.scene==='profile'&&!app.modal&&!app.wechatProfileLoading&&!app.deleting&&app.wechatProfileReady;
  if(!visible){if(app.profileNativeControl){app.profileNativeControl.destroy();app.profileNativeControl=null;}return;}
  if(!rect)return;
  const key=[rect.x,rect.y,rect.w,rect.h].join(',');if(!app.profileNativeControl)app.profileNativeControl=app.createWechatProfileButton(rect);else if(key!==app.profileNativeRect)app.profileNativeControl.setRect(rect);app.profileNativeRect=key;
  if(app.profileNativeControl)app.profileNativeControl.show();
}
function profile(app,c){
  nav(app,c,'我的');const top=app.top+62,bottom=app.h-app.bottom-10,contentH=635;app.maxScroll=Math.max(0,contentH-(bottom-top));c.save();c.beginPath();c.rect(0,top,390,bottom-top);c.clip();app.clip={top,bottom};const y=top-app.scroll,record=app.data.profile||{},isWechat=record.profileSource==='wechat';
  U.avatar(c,app,isWechat?record:null,195,y+85,78);if(isWechat)U.title(c,U.ellipsis(c,record.nickname,306,26,800),195,y+194,26);
  const authRect={x:70,y:y+224,w:250,h:51};U.button(c,app,'wechat-profile',app.wechatProfileLoading?'正在获取…':isWechat?'更新微信头像昵称':app.wechatProfileReady?'继续微信授权':'使用微信头像昵称',authRect.x,authRect.y,authRect.w,authRect.h,()=>app.prepareWechatProfile(),{size:17,disabled:app.wechatProfileLoading||app.deleting,noHit:app.wechatProfileReady});if(app.wechatProfileError)U.text(c,'获取失败，点击重试',195,y+290,11,'#ffe8b0','center');
  [['sound','音效'],['music','音乐'],['haptic','震动']].forEach(([key,label],i)=>{const yy=y+321+i*68,on=app.data.settings[key];U.buttonPlate(c,app,25,yy-3,340,61);U.symbol(c,key,66,yy+27,30,'#1c7aab');U.title(c,label,137,yy+27,23,P.brown);U.box(c,278,yy+12,64,30,U.gradient(c,278,yy+12,64,30,on?['#5bb3da','#14638b']:['#8d9392','#686e71']),18,'#fff7e2');c.save();c.shadowColor='rgba(39,44,32,.3)';c.shadowBlur=3;c.shadowOffsetY=2;c.beginPath();c.arc(on?326:294,yy+27,13,0,7);c.fillStyle=U.gradient(c,281,yy+14,26,26,['#fff8e3','#edd09c']);c.fill();c.restore();app.hit('setting-'+key,30,yy,330,54,()=>{app.data.settings[key]=!on;app.audio.sync();app.save();});});
  cloudControl(app,c,152,y+556,38);U.title(c,app.data.pendingResult?(app.pendingSync?'同步中':'待同步'):app.cloudStatus==='ready'?'已连接':'未连接',222,y+556,20);
  U.text(c,'隐私',107,y+610,14,P.cream,'center',700);app.hit('privacy-info',60,y+590,95,38,()=>app.modal={type:'privacy-info'});if(app.profile){U.text(c,app.deleting?'正在删除…':'删除记录',278,y+610,14,P.cream,'center',700);if(!app.deleting)app.hit('delete-account',217,y+590,122,38,()=>app.modal={type:'delete'});}app.clip=null;c.restore();
  if(authRect.y>=top&&authRect.y+authRect.h<=bottom)nativeProfileButton(app,authRect);else if(app.profileNativeControl){app.profileNativeControl.destroy();app.profileNativeControl=null;}
}
function photosModal(app,c,m){
  const top=app.top+55,bottom=app.h-app.bottom-65,ids=m.photoIds,cols=ids.length<=4?2:4,rows=Math.ceil(ids.length/cols),w=cols===2?133:80,h=Math.min(w*1.5,(bottom-top-12*(rows-1))/rows),left=(390-(w+8)*cols+8)/2;
  ids.forEach((id,i)=>U.frame(c,app.assets.get(id),left+i%cols*(w+8),top+Math.floor(i/cols)*(h+12),w,h));U.control(c,app,'photos-close','back',195,app.h-app.bottom-31,46,()=>app.modal=null);
}
function modal(app,c){
  const m=app.modal;if(!m)return;app.hits=[];app.maxScroll=0;c.fillStyle='rgba(5,39,63,.7)';c.fillRect(0,0,390,app.h);if(m.type==='photos'){photosModal(app,c,m);return;}
  const height=m.type==='privacy-info'?397:m.type==='privacy'?371:m.type==='pause'?332:314,y=(app.h-height)/2;U.surface(c,24,y,342,height,{gold:true});let title='',body='';
  if(m.type==='privacy'){title='开启云成绩';body='我们使用微信身份标识保存关卡记录和成绩。排行榜展示昵称、头像和最佳耗时。微信头像昵称仅在你主动授权后获取。';}
  if(m.type==='privacy-info'){title='隐私';body='云端以微信身份标识保存成绩和挑战记录，局面只保存在本机。你授权的微信头像昵称用于个人资料与排行榜；可在“我的”删除云端资料及成绩。';}
  if(m.type==='pause'){title='暂停';body=app.game.ranked?'局面已保存。排行榜计时继续，切到后台也会计时。':'局面已保存，可以随时继续。';}
  if(m.type==='network'){title='连接失败';body=m.text;}
  if(m.type==='delete'){title='删除记录？';body='删除你的云端档案、成绩与榜单记录，并清理本机进度。此操作无法撤销。';}
  U.title(c,title,195,y+39,25,P.brown);U.wrap(c,body,46,y+85,298,15,P.ink,23);
  if(m.type==='privacy'||m.type==='privacy-info'){
    const linkY=y+(m.type==='privacy'?217:281);U.text(c,m.privacyOpening?'正在打开…':m.privacyError?'重试打开隐私指引':'查看隐私保护指引',195,linkY,12,'#1c6d94','center',700);if(!m.privacyOpening)app.hit('privacy-contract',43,linkY-15,304,32,()=>app.openPrivacy());if(m.privacyError)U.text(c,'打开失败，请重试',195,linkY+24,10,'#a05b32','center');
    if(m.type==='privacy'){U.button(c,app,'privacy-agree','同意并开启',55,y+264,280,52,()=>{app.modal=null;m.resolve(true);},{size:21});U.text(c,'先本地游玩',195,y+343,12,'#8c6b40','center');app.hit('privacy-decline',56,y+325,278,35,()=>{app.modal=null;m.resolve(false);});}
    else U.button(c,app,'privacy-close','关闭',55,y+329,280,51,()=>app.modal=null,{size:22});
  }else if(m.type==='pause'){U.button(c,app,'resume-game','继续',56,y+158,278,54,()=>app.modal=null,{size:26});U.control(c,app,'restart-game','replay',86,y+275,45,()=>app.startLevel(app.game.level.id));U.control(c,app,'pause-hint','hint',159,y+275,45,()=>{app.modal=null;app.hint();});U.control(c,app,'pause-levels','album',232,y+275,45,()=>{app.saveRun();openLevels(app);});U.control(c,app,'exit-game','home',305,y+275,45,()=>{app.saveRun();app.navigate('home');});}
  else if(m.type==='network'){U.button(c,app,'network-retry','重试',56,y+179,278,52,()=>{app.modal=null;m.retry();},{size:24});U.text(c,'先本地游玩',195,y+276,13,'#8c6b40','center');app.hit('network-local',56,y+253,278,42,()=>{app.modal=null;m.local();});}
  else if(m.type==='delete'){U.button(c,app,'delete-cancel','保留',56,y+179,278,52,()=>app.modal=null,{size:24});U.text(c,app.deleting?'正在删除…':'确认删除',195,y+276,13,'#a05f38','center');if(!app.deleting)app.hit('delete-confirm',56,y+253,278,42,()=>app.deleteAccount());}
}
function draw(app,c){
  background(app,c);app.maxScroll=0;nativeProfileButton(app,null);
  if(app.scene==='loading'){U.contain(c,app.assets.get('brand-logo'),48,app.h*.27,294,106);U.box(c,72,app.h*.52,246,12,'rgba(8,67,102,.5)',7);U.box(c,75,app.h*.52+3,Math.max(6,240*app.loading.progress),6,'#ffe2a3',4);}
  else if(app.scene==='error'){U.title(c,'加载失败',195,app.h*.36,29);U.wrap(c,app.error||'请检查网络后重试',47,app.h*.36+54,296,13,P.cream);U.button(c,app,'load-retry','重试',72,app.h*.57,246,64,()=>app.boot());}
  else if(app.scene==='home')home(app,c);else if(app.scene==='levels')levelList(app,c);else if(app.scene==='level-intro')intro(app,c);else if(app.scene==='game')game(app,c);else if(app.scene==='result')result(app,c);else if(app.scene==='leaderboard')ranks(app,c);else if(app.scene==='profile')profile(app,c);
  modal(app,c);
}
module.exports={draw,coverPhoto,homeLayout};
