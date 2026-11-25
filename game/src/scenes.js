const U=require('./ui'),B=require('./board');
const {photoFocus}=require('./theme');
const Journal=require('./journey-progress');
const Garden=require('./garden-tools');
const Result=require('./result');
const P=U.palette;
function background(app,c){
  c.fillStyle='#e0f3e2';c.fillRect(0,0,390,app.h);
  U.photo(c,app.assets.get('garden'),0,0,390,app.h,0);
  if(app.scene!=='home'){
    c.fillStyle=app.scene==='result'?'rgba(255,250,231,.14)':app.scene==='game'?'rgba(245,251,230,.74)':'rgba(251,255,240,.72)';
    c.fillRect(0,0,390,app.h);
  }
}
function nav(app,c,title,back=()=>app.navigate('home')){
  U.control(c,app,'back','back',29,app.top+23,38,back);U.title(c,title,195,app.top+23,24);
}
function homeLayout(app){
  const bottom=app.h-app.bottom,compact=bottom-app.top<650;
  const cta={x:62,y:bottom-(compact?142:168),w:266,h:compact?49:55};
  const logo={x:50,y:app.top+15,w:290,h:compact?76:92};
  return{logo,cta,artTop:logo.y+logo.h+12,artBottom:cta.y-25,controlsY:bottom-(compact?37:48)};
}
function homeArt(app,c,ids,layout){
  const id=ids[0];
  const {artTop,artBottom}=layout,h=Math.min(278,Math.max(70,artBottom-artTop-13)),w=h*.78,cy=(artTop+artBottom)/2;
  c.save();c.translate(192,cy);
  U.frame(c,app.assets.get(ids[1]),-w*.76,-h*.40,w*.72,h*.80,-.17);
  U.frame(c,app.assets.get(ids[2]),w*.03,-h*.37,w*.70,h*.78,.17);
  c.rotate(-.055);
  const x=-w/2,y=-h/2,image=app.assets.get(id)||app.assets.get('photo-01');
  if(image){
    const source=U.crop(image,w,h),tw=w/2,th=h/2;
    source.y=Math.max(0,Math.min(image.height-source.h,image.height*(photoFocus[id]||.5)-source.h/2));
    U.box(c,x-3,y-3,w+6,h+6,'#fff8e4',12,'#e5dbc0');
    for(let i=0;i<4;i++){
      const col=i%2,row=Math.floor(i/2),float=i===3;
      c.save();c.translate(x+(col+.5)*tw,y+(row+.5)*th);
      if(float){
        c.translate(19,11+(app.data.settings.reduceMotion?0:2*Math.sin(app.now*1.4)));
        c.rotate(.095);c.scale(1.025,1.025);
      }
      c.shadowColor=float?'rgba(34,67,54,.36)':'rgba(42,73,53,.22)';
      c.shadowBlur=float?9:3;c.shadowOffsetY=float?6:2;
      U.box(c,-tw/2,-th/2,tw,th,P.paper,7);c.shadowColor='transparent';
      const edge=float?2.5:1.7;
      U.rounded(c,-tw/2+edge,-th/2+edge,tw-edge*2,th-edge*2,5);c.clip();
      c.drawImage(image,source.x+col*source.w/2,source.y+row*source.h/2,source.w/2,source.h/2,-tw/2,-th/2,tw,th);
      c.restore();
    }
    U.sparkle(c,tw+19,3,4.5,'#f8c76d');U.sparkle(c,tw+25,-6,2.4,'#fff5c8');
  }
  c.restore();
}
function playCurrent(app){
  if(app.data.journeyRuns?.story?.session)return app.resumeSession('story');
  return app.openSession(Journal.nextStory(app.data));
}
function home(app,c){
  const layout=homeLayout(app),{logo,cta,controlsY}=layout;
  const saved=app.data.journeyRuns?.story?.session,session=saved||Journal.nextStory(app.data);
  const ids=session.photoIds.slice(0,3),key=ids.join('/');
  if(app.homePhoto!==key){app.homePhoto=key;app.assets.loadAll(ids).catch(()=>{});}
  U.contain(c,app.assets.get('brand-logo'),logo.x,logo.y,logo.w,logo.h);
  homeArt(app,c,ids,layout);
  U.button(c,app,'play',(saved?'继续':'开始')+'第 '+session.index+' 关',cta.x,cta.y,cta.w,cta.h,()=>playCurrent(app));
  const shortcuts=[['home-ranks','闯关榜',()=>app.showLeaderboard()],['home-profile','我的',()=>app.navigate('profile')]];
  shortcuts.forEach(([id,label,fn],i)=>{
    const x=74+i*128;
    U.surface(c,x,controlsY-21,115,43,{gold:true});
    if(i===0)U.gardenBadge(c,app,2,x+23,controlsY,16);else U.avatar(c,app,app.data.profile,x+23,controlsY,16);
    U.text(c,label,x+70,controlsY,15,P.ink,'center',700);
    app.hit(id,x,controlsY-22,115,45,fn);
  });
}
function intro(app,c){
  const l=app.selectedLevel,bottom=app.h-app.bottom,ctaY=bottom-107;
  nav(app,c,'第 '+l.id+' 关');
  const cols=Math.ceil(l.photoIds.length/2),w=Math.min(141,322/cols-7),available=ctaY-122-(app.top+87);
  const h=Math.min(w*1.45,(available-15)/2),top=app.top+87+Math.max(0,(available-2*h-15)/2),left=(390-(w+8)*cols+8)/2;
  l.photoIds.forEach((id,i)=>U.frame(c,app.assets.get(id),left+(i%cols)*(w+8),top+Math.floor(i/cols)*(h+15),w,h,((i%cols)-(cols-1)/2)*.025,{focusY:photoFocus[id]}));
  const details=[l.photoIds.length+' 张照片'];if(l.hiddenTokens?.length)details.push(l.hiddenTokens.length+' 片晨雾云片');if(l.pinnedTokens?.length)details.push('雏菊花扣');
  U.text(c,details.join('   ·   '),195,ctaY-83,15,P.ink,'center');
  U.text(c,l.pinnedTokens?.length?'围着花扣拼好照片，雏菊就会松开':l.hiddenTokens?.length?'移动云片，或在旁边拼合碎片，就能拨开晨雾':l.id===1?'把散开的那一角，拖回同一张照片':'拖动相连的碎片，拼完整张照片',195,ctaY-55,15,P.ink,'center');
  U.text(c,'三星目标  '+(l.goldMoves||l.difficulty.verifiedMoves)+' 步',195,ctaY-27,13,P.brown,'center');
  U.button(c,app,'start-level','开始拼图',53,ctaY,284,57,()=>app.beginSelected(),{size:24});

}
function game(app,c){
  const g=app.game,y=app.top+23,b=B.layout(app);
  U.surface(c,12,y-16,119,32);U.text(c,U.time(app.elapsed())+' · '+g.moves.length+' 步',71,y,15,P.ink,'center');
  U.title(c,'第 '+g.level.id+' 关',193,y,20);U.surface(c,271,y-16,63,32);U.text(c,g.visual.completed.length+'/'+g.level.photoIds.length,303,y,16,P.ink,'center');
  U.control(c,app,'pause','pause',361,y,37,()=>app.modal={type:'pause'});
  B.draw(app,c);
  const buttons=[['hint','hint','提示',()=>app.hint()],['game-photos','album','原图',()=>app.modal={type:'photos',photoIds:g.level.photoIds}],['garden-tools','leaf','花园工具',()=>{if(!g.stage)app.modal={type:'garden-tools'};}]];
  buttons.forEach(([id,icon,label,fn],i)=>{
    const width=108,x=23+i*118,y=b.footerY-19;
    const disabled=id==='garden-tools'&&g.stage;
    c.save();if(disabled)c.globalAlpha*=.64;
    U.surface(c,x,y,width,38);
    if(icon==='leaf')U.gardenBadge(c,app,3,x+21,y+19,13);else U.atlas(c,app,icon,x+8,y+5,28);
    U.text(c,label,x+67,y+19,14,P.ink,'center');c.restore();
    if(!disabled)app.hit(id,x,y-2,width,42,fn);
  });
}
function podium(app,c,entries,top,height){
  for(const [index,x]of [[1,77],[0,195],[2,313]]){
    const entry=entries[index];if(!entry)continue;
    const r=Math.min(index===0?33:27,height*.21),y=top+(index===0?0:9);
    U.surface(c,x-53,y+10,106,height-(y-top)-14,{gold:index===0});
    const center=(y+top+height-45)/2;
    U.avatar(c,app,entry,x,center,r);U.medal(c,entry.rank,x+r-3,center+r*.7,10);
    U.text(c,U.ellipsis(c,entry.nickname,98,13),x,top+height-35,13,P.ink,'center');
    U.text(c,'已通 '+entry.levelId+' 关',x,top+height-15,14,P.brown,'center',700);
  }
}
function ranks(app,c){
  const r=app.rank;
  nav(app,c,'闯关榜');
  const verify=Number.isInteger(r.verifyLevel)&&r.verifyLevel>0;
  const top=app.top+(r.syncError?106:84),end=app.h-app.bottom,bottom=end-(verify?139:71);
  const subtitleY=app.top+57;
  U.text(c,'按已通关数排名，同关先获验证者居前，可使用花园工具',195,subtitleY,12,P.muted,'center');
  if(r.syncError&&!r.loading&&!r.error){
    U.text(c,'本机进度待同步 · 点击重试',195,subtitleY+27,13,P.brown,'center',700);
    app.hit('rank-resync',70,subtitleY+12,250,30,()=>app.showLeaderboard());
  }
  if(r.loading){
    U.text(c,'正在读取闯关榜…',195,(bottom+top)/2,16,P.ink,'center');return;
  }
  if(r.error){
    const center=(bottom+top)/2;
    U.wrap(c,r.error,47,center-61,296,14,P.ink,21);
    U.button(c,app,'rank-retry','重新读取',75,center+28,240,49,()=>app.showLeaderboard());return;
  }
  if(!app.profile){
    const center=(bottom+top)/2;
    U.atlas(c,app,'cloud',161,center-93,68);
    U.text(c,'连接微信后查看排名和同步成绩',195,center+4,16,P.ink,'center');
    U.button(c,app,'rank-login',app.cloudStatus==='loading'?'正在连接…':'连接闯关榜',68,center+40,254,50,
      async()=>{if(await app.connectCloud())await app.showLeaderboard();},{disabled:app.cloudStatus==='loading'});
    return;
  }
  if(!r.entries.length){
    const center=(bottom+top)/2;
    U.gardenBadge(c,app,2,195,center-49,40);
    U.text(c,'还没有通关记录',195,center+14,20,P.ink,'center');
    if(!verify)U.button(c,app,'rank-challenge','去闯关',75,center+48,240,47,()=>playCurrent(app));
  }
  const rows=r.entries.slice(3),space=bottom-top;
  const podiumH=Math.min(173,Math.max(90,space-rows.length*35-8));
  podium(app,c,r.entries,top,podiumH);
  const pitch=rows.length?Math.min(50,(space-podiumH-5)/rows.length):0;
  rows.forEach((entry,i)=>{
    const y=top+podiumH+5+i*pitch,h=pitch-4,cy=y+h/2;
    U.surface(c,15,y,360,h,{gold:entry.isSelf});
    U.text(c,entry.rank,36,cy,15,P.brown,'center');
    U.avatar(c,app,entry,69,cy,Math.min(16,h*.39));
    U.text(c,U.ellipsis(c,entry.nickname,157,13),96,cy,13,P.ink);
    U.text(c,'已通 '+entry.levelId+' 关',351,cy,15,P.ink,'right',700);
  });
  const own=r.ownBest,y=end-57;
  if(verify){
    U.text(c,'旧存档只有成绩，重新通关即可上榜',195,y-65,12,P.muted,'center');
    U.button(c,app,'rank-verify','补验第 '+r.verifyLevel+' 关',83,y-51,224,39,()=>app.verifyRankLevel(r.verifyLevel),{size:16});
  }
  U.surface(c,24,y,342,43);U.text(c,'我的排名',45,y+22,15,P.ink);
  const label=own?'第 '+own.rank+' 名 · 已通 '+own.levelId+' 关':'尚未上榜';
  U.text(c,label,343,y+22,15,P.brown,'right',700);

}
function nativeProfileButton(app,rect){
  const visible=app.scene==='profile'&&!app.modal&&!app.wechatProfileLoading&&!app.deleting&&app.wechatProfileReady;
  if(!visible){if(app.profileNativeControl){app.profileNativeControl.destroy();app.profileNativeControl=null;}return;}
  if(!rect)return;
  const key=[rect.x,rect.y,rect.w,rect.h].join(',');if(!app.profileNativeControl)app.profileNativeControl=app.createWechatProfileButton(rect);else if(key!==app.profileNativeRect)app.profileNativeControl.setRect(rect);app.profileNativeRect=key;
  if(app.profileNativeControl)app.profileNativeControl.show();
}
function profile(app,c){
  nav(app,c,'我的花园');const top=app.top+58,bottom=app.h-app.bottom-8;
  app.maxScroll=Math.max(0,594-(bottom-top));c.save();c.beginPath();c.rect(0,top,390,bottom-top);c.clip();app.clip={top,bottom};
  const y=top-app.scroll,record=app.data.profile||{},isWechat=record.profileSource==='wechat';
  U.surface(c,24,y+4,342,214,{gold:true});U.avatar(c,app,isWechat?record:null,195,y+53,36);
  U.title(c,isWechat?U.ellipsis(c,record.nickname,286,21):'本地档案',195,y+110,21,P.ink);
  const authRect={x:79,y:y+132,w:232,h:44};
  U.button(c,app,'wechat-profile',app.wechatProfileLoading?'正在获取…':isWechat?'更新微信头像昵称':app.wechatProfileReady?'继续微信授权':'使用微信头像昵称',authRect.x,authRect.y,authRect.w,authRect.h,()=>app.prepareWechatProfile(),{size:17,disabled:app.wechatProfileLoading||app.deleting,noHit:app.wechatProfileReady});
  if(app.wechatProfileError)U.text(c,U.ellipsis(c,app.wechatProfileError,308,13),195,y+196,13,'#873e31','center');
  U.surface(c,24,y+235,342,219);
  [['sound','交互音效'],['music','环境音乐'],['haptic','触感震动'],['reduceMotion','减弱动态效果']].forEach(([key,label],i)=>{
    const yy=y+240+i*52,on=!!app.data.settings[key];
    if(i)U.box(c,41,yy,307,1,'rgba(244,228,193,.22)',0);
    U.text(c,label,51,yy+25,16);U.box(c,287,yy+13,47,25,on?'#78aa71':'#b6c9c0',13);
    c.beginPath();c.arc(on?321:300,yy+25.5,9.5,0,7);c.fillStyle='#fffced';c.fill();
    app.hit('setting-'+key,31,yy,328,49,()=>{app.data.settings[key]=!on;app.audio.sync();app.save();});
  });
  U.surface(c,24,y+470,342,108,{gold:true});
  U.box(c,45,y+521,300,1,'#d5dfca',0);
  U.gardenBadge(c,app,2,143,y+495,16);U.text(c,'查看闯关榜',211,y+495,15,P.ink,'center');
  app.hit('profile-rank',81,y+474,228,42,()=>app.showLeaderboard());
  U.text(c,'隐私说明',100,y+552,15,P.ink,'center');app.hit('privacy-info',48,y+530,105,44,()=>app.modal={type:'privacy-info'});
  if(app.profile){U.text(c,app.deleting?'正在删除…':'删除记录',280,y+552,15,P.ink,'center');if(!app.deleting)app.hit('delete-account',220,y+530,120,44,()=>app.modal={type:'delete'});}
  app.clip=null;c.restore();if(authRect.y>=top&&authRect.y+authRect.h<=bottom)nativeProfileButton(app,authRect);else if(app.profileNativeControl){app.profileNativeControl.destroy();app.profileNativeControl=null;}
}
function photosModal(app,c,m){
  const top=app.top+64,bottom=app.h-app.bottom-61,ids=m.photoIds,cols=Math.ceil(ids.length/2),w=Math.min(133,330/cols-9),h=Math.min(w*1.5,(bottom-top-22)/2),left=(390-(w+9)*cols+9)/2,y=top+(bottom-top-2*h-16)/2;
  U.title(c,'原图对照',195,app.top+26,24);
  ids.forEach((id,i)=>{
    const xx=left+i%cols*(w+9),yy=y+Math.floor(i/cols)*(h+16);
    U.frame(c,app.assets.get(id),xx,yy,w,h);
    if(app.game.visual.completed.includes(i)){U.box(c,xx,yy,w,h,'rgba(31,42,33,.53)',0);U.text(c,'✓ 已拼好',xx+w/2,yy+h*.52,13,P.ink,'center');}
  });
  U.control(c,app,'photos-close','back',195,app.h-app.bottom-31,44,()=>app.modal=null);
}
function gardenIcon(c,id,x,y){
  c.save();c.translate(x,y);
  if(id==='breeze'){
    c.lineWidth=1.4;c.strokeStyle='#487158';
    c.beginPath();c.moveTo(1,9);c.lineTo(-12,-2);c.quadraticCurveTo(0,-17,12,-5);
    c.closePath();c.fillStyle='#8cbe83';c.fill();c.stroke();
    for(const xx of [-7,0,7]){c.beginPath();c.moveTo(1,9);c.lineTo(xx,-6);c.stroke();}
  }else if(id==='focus'){
    c.beginPath();c.moveTo(0,-12);c.bezierCurveTo(-2,-7,-10,-1,-9,4);
    c.bezierCurveTo(-8,15,8,14,9,4);c.bezierCurveTo(10,-1,2,-9,0,-12);
    c.fillStyle='#7dbdd2';c.fill();c.lineWidth=1.3;c.strokeStyle='#448090';c.stroke();
    c.beginPath();c.arc(-3,2,2,0,Math.PI*2);c.fillStyle='#f4fffe';c.fill();
  }else{
    for(let i=0;i<5;i++){
      c.rotate(Math.PI*2/5);c.beginPath();c.ellipse(0,-5,3.7,6,0,0,Math.PI*2);
      c.fillStyle='#e9979e';c.fill();c.lineWidth=.8;c.strokeStyle='#a86170';c.stroke();
    }
    c.beginPath();c.arc(0,0,3,0,Math.PI*2);c.fillStyle='#ffdc85';c.fill();
  }
  c.restore();
}
function gardenTools(app,c){
  const g=app.game,stock=Journal.tools(app.data),y=app.top+(app.h-app.top-app.bottom-344)/2;
  U.box(c,24,y+3,342,344,'#93b19d',19);U.box(c,24,y,342,344,'#fffdf0',19,'#abc7a9');
  U.title(c,'花园工具',195,y+31,25,P.ink);
  U.text(c,'库存来自游玩奖励，单局用量有限',195,y+60,13,P.muted,'center');
  Garden.items.forEach((item,i)=>{
    const yy=y+81+i*64,reason=Garden.available(g,item,stock);
    const uses=(g.toolHistory||[]).filter(h=>h.id===item.id).length;
    U.box(c,39,yy,312,56,reason?'#e7e9dc':item.col,12,'#c5d4bd');
    gardenIcon(c,item.id,59,yy+18);U.text(c,item.name,79,yy+18,16,P.ink);
    U.text(c,item.detail,52,yy+40,12,P.muted);
    U.text(c,'库存 '+stock[item.id],337,yy+16,12,P.ink,'right');
    U.text(c,reason||'本局剩 '+(item.limit-uses)+' 次',337,yy+40,11,P.muted,'right');
    if(!reason)app.hit('use-'+item.id,39,yy,312,56,()=>app.useGardenTool(item.id));
  });
  U.button(c,app,'garden-tools-close','继续拼图',100,y+282,190,43,()=>app.modal=null,{size:17});
}
function modal(app,c){
  const m=app.modal;if(!m)return;app.hits=[];app.maxScroll=0;c.fillStyle=m.type==='photos'?'rgba(235,247,229,.92)':'rgba(52,82,74,.40)';c.fillRect(0,0,390,app.h);if(m.type==='garden-tools'){gardenTools(app,c);return;}if(m.type==='photos'){photosModal(app,c,m);return;}
  const height=m.type==='privacy-info'?397:m.type==='privacy'?371:m.type==='pause'?332:314,y=(app.h-height)/2;U.surface(c,24,y,342,height,{gold:true});let title='',body='';
  if(m.type==='privacy'){title='开启云成绩';body='我们使用微信身份标识保存关卡记录和成绩。排行榜展示昵称、头像和最高通关关数。微信头像昵称仅在你主动授权后获取。';}
  if(m.type==='privacy-info'){title='隐私';body='云端以微信身份标识保存成绩和挑战记录，局面只保存在本机。你授权的微信头像昵称用于个人资料与排行榜；可在“我的”删除云端资料及成绩。';}
  if(m.type==='pause'){title='暂停';body='局面已保存，可以随时继续。';}
  if(m.type==='delete'){title='删除记录？';body='删除你的云端档案、成绩与榜单记录，并清理本机进度。此操作无法撤销。';}
  U.title(c,title,195,y+39,25,P.brown);U.wrap(c,body,46,y+85,298,15,P.ink,23);
  if(m.type==='privacy'||m.type==='privacy-info'){
    const linkY=y+(m.type==='privacy'?217:281);U.text(c,m.privacyOpening?'正在打开…':m.privacyError?'重试打开隐私指引':'查看隐私保护指引',195,linkY,16,'#416349','center',700);if(!m.privacyOpening)app.hit('privacy-contract',43,linkY-15,304,32,()=>app.openPrivacy());if(m.privacyError)U.text(c,'打开失败，请重试',195,linkY+24,15,'#a05b32','center');
    if(m.type==='privacy'){U.button(c,app,'privacy-agree','同意并开启',55,y+264,280,52,()=>{app.modal=null;m.resolve(true);},{size:21});U.text(c,'先本地游玩',195,y+343,16,'#8c6b40','center');app.hit('privacy-decline',56,y+325,278,35,()=>{app.modal=null;m.resolve(false);});}
    else U.button(c,app,'privacy-close','关闭',55,y+329,280,51,()=>app.modal=null,{size:22});
  }else if(m.type==='pause'){U.button(c,app,'resume-game','继续',56,y+158,278,54,()=>app.modal=null,{size:26});U.control(c,app,'restart-game','replay',96,y+275,45,()=>app.restartLevel());U.control(c,app,'pause-hint','hint',195,y+275,45,()=>{app.modal=null;app.hint();});U.control(c,app,'exit-game','home',294,y+275,45,()=>{app.saveRun();app.navigate('home');});}
  else if(m.type==='delete'){U.button(c,app,'delete-cancel','保留',56,y+179,278,52,()=>app.modal=null,{size:24});U.text(c,app.deleting?'正在删除…':'确认删除',195,y+276,13,'#a05f38','center');if(!app.deleting)app.hit('delete-confirm',56,y+253,278,42,()=>app.deleteAccount());}
}
function draw(app,c){
  background(app,c);app.maxScroll=0;nativeProfileButton(app,null);
  if(app.scene==='loading'){U.contain(c,app.assets.get('brand-logo'),48,app.h*.27,294,106);U.box(c,72,app.h*.52,246,12,'rgba(8,67,102,.5)',7);U.box(c,75,app.h*.52+3,Math.max(6,240*app.loading.progress),6,'#ffe2a3',4);}
  else if(app.scene==='error'){U.title(c,'加载失败',195,app.h*.36,29);U.wrap(c,app.error||'请检查网络后重试',47,app.h*.36+54,296,13,P.ink);U.button(c,app,'load-retry','重试',72,app.h*.57,246,64,()=>app.loadRetry?app.loadRetry():app.boot());}
  else if(app.scene==='home')home(app,c);else if(app.scene==='level-intro')intro(app,c);else if(app.scene==='game')game(app,c);else if(app.scene==='result')Result.draw(app,c);else if(app.scene==='leaderboard')ranks(app,c);else if(app.scene==='profile')profile(app,c);
  modal(app,c);
  if(!app.data.settings.reduceMotion&&Number.isFinite(app.sceneAt)){
    const remaining=1-(app.now-app.sceneAt)/.22;
    if(remaining>0){c.fillStyle='rgba(248,254,228,'+Math.min(.45,remaining*.45)+')';c.fillRect(0,0,390,app.h);}
  }
}
module.exports={draw};
