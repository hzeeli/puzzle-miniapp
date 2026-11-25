'use strict';
const U=require('./ui');
const {photoName,photoFocus}=require('./theme');

const ink='#53422b',muted='#705b42',honey='#bf852a';

function layout(app,status){
  const top=app.top,bottom=app.h-app.bottom,compact=bottom-top<630;
  const ctaY=bottom-119,ledgerBottom=ctaY-(status?41:13);
  const ledgerH=(compact?82:100)+(app.game.rewardText?24:0),ledgerY=ledgerBottom-ledgerH;
  const starsY=top+(compact?20:28),ribbonY=starsY+(compact?23:27);
  const ribbonH=compact?68:88;
  const spaceTop=ribbonY+ribbonH+7,spaceBottom=ledgerY-13;
  const h=Math.min(297,spaceBottom-spaceTop-13),w=Math.min(291,h*1.08);
  return {top,bottom,compact,ctaY,ledgerY,ledgerH,starsY,ribbonY,ribbonH,
    photo:{x:195-w/2,y:(spaceTop+spaceBottom-h)/2,w,h}};
}

function star(c,sheet,x,y,r,lit){
  if(!sheet)return;
  c.save();c.shadowColor=lit?'rgba(247,175,47,.36)':'rgba(105,101,75,.18)';
  c.shadowBlur=lit?5:2;c.shadowOffsetY=1;
  const size=sheet.width/2;
  c.drawImage(sheet,lit?0:size,0,size,sheet.height,x-r,y-r,2*r,2*r);
  c.restore();
}

function drawHeader(app,c,l,elapsed){
  const earned=Math.min(3,Math.max(0,app.result.stars||0)),sheet=app.assets.get('result-stars');
  for(let i=0;i<3;i++){
    const center=i===1,appear=Math.max(0,Math.min(1,(elapsed-i*.10)/.24));
    const scale=1+Math.sin(appear*Math.PI)*.15;
    star(c,sheet,195+(i-1)*(l.compact?40:47),l.starsY+(center?0:8),
      (center?(l.compact?21:26):(l.compact?16:20))*scale,i<earned&&appear>0);
  }
  const ribbon=app.assets.get('result-ribbon');
  if(ribbon)c.drawImage(ribbon,31,l.ribbonY,328,l.ribbonH);
  c.save();c.shadowColor='rgba(255,251,227,.83)';c.shadowBlur=3;
  U.title(c,'第 '+app.game.level.id+' 关完成！',195,l.ribbonY+l.ribbonH*.32,l.compact?25:31,'#854325');c.restore();
  U.control(c,app,'result-home','home',28,l.top+24,35,()=>app.navigate('home'));
}

function tape(c,x,y){
  c.save();c.translate(x,y);c.rotate(-.11);
  c.fillStyle='rgba(242,216,154,.83)';c.beginPath();c.moveTo(-29,-5);
  c.lineTo(-24,-8);c.lineTo(28,-8);c.lineTo(25,-3);c.lineTo(30,5);
  c.lineTo(-27,8);c.lineTo(-25,2);c.closePath();c.fill();c.restore();
}

function leafSeal(c,x,y){
  c.save();c.translate(x,y);c.rotate(-.11);
  c.shadowColor='rgba(70,88,43,.2)';c.shadowBlur=3;c.shadowOffsetY=2;
  c.beginPath();c.moveTo(-37,12);c.bezierCurveTo(-36,-20,-7,-29,30,-24);
  c.bezierCurveTo(39,-7,30,19,2,23);c.quadraticCurveTo(-24,27,-37,12);c.closePath();
  c.fillStyle=U.gradient(c,-32,-23,64,46,['#edf2b2','#bddba1']);c.fill();
  c.shadowColor='transparent';c.strokeStyle='#74945d';c.lineWidth=1.2;c.stroke();
  U.symbol(c,'leaf',-22,1,16,'#527547');U.text(c,'清风手拼',7,-5,11,'#3d5c36','center',700);
  U.text(c,'叶章',7,9,10,'#506a42','center');c.restore();
}

function drawPrint(app,c,l,elapsed){
  const level=app.game.level,completed=app.game.state.completed;
  const id=level.featuredPhotoId||level.photoIds[completed[completed.length-1]]||level.photoIds[0];
  const {x,y,w,h}=l.photo,caption=l.compact?18:24;
  c.save();c.translate(x+w/2,y+h/2+(1-Math.min(1,elapsed/.32))*7);c.rotate(-.042);
  c.shadowColor='rgba(87,80,49,.24)';c.shadowBlur=9;c.shadowOffsetY=4;
  U.box(c,-w/2,-h/2,w,h,'#fffdee',9);c.shadowColor='transparent';
  U.photo(c,app.assets.get(id),-w/2+6,-h/2+6,w-12,h-caption-10,5,photoFocus[id]??.31);
  const size=l.compact?11:13;
  U.text(c,U.ellipsis(c,photoName(id),w-12,size),0,h/2-caption*.55,size,muted,'center');
  tape(c,-w*.22,-h/2-6);c.restore();
  if(level.session&&app.game.pureClear&&!app.game.toolHistory?.length)leafSeal(c,x+w-13,y+18);
}

function cloudStatus(result){
  if(result.syncing)return '正在同步闯关进度…';
  if(result.error)return '进度待同步 · 点击重试';
  if(result.notice)return result.notice;
  if(result.cloud)return '闯关进度已同步';
  return '';
}

function drawLedger(app,c,l,status){
  const {game:g,result:r}=app,stars=Math.min(3,Math.max(0,r.stars||0));
  const rows=[['clock','本关用时',U.time(r.localMs,true)],
    ['check','拼好照片',g.state.completed.length+' / '+g.level.photoIds.length+' 张 · '+g.moves.length+' 步'],
    ['stars','获得星星','★'.repeat(stars)+'☆'.repeat(3-stars)]];
  if(g.rewardText)rows.push(['leaf','本关补给',g.rewardText]);
  const x=43,w=304,y=l.ledgerY,h=l.ledgerH;
  U.box(c,x,y+3,w,h,'rgba(126,124,73,.23)',19);
  U.box(c,x,y,w,h,U.gradient(c,x,y,w,h,['#fffbed','#fff2cf']),19,'#dec78c');
  U.box(c,x+3,y+3,w-6,h-6,'rgba(255,255,255,.11)',17,'#fcf6d8');
  const rowH=(h-12)/rows.length;
  rows.forEach(([icon,label,v],i)=>{
    const cy=y+6+(i+.5)*rowH;
    if(i){c.fillStyle='#e8d8ab';c.fillRect(x+24,cy-rowH/2,w-48,1);}
    if(icon==='stars')U.sparkle(c,x+30,cy,7,honey);
    else U.symbol(c,icon,x+30,cy,15,honey);
    U.text(c,label,x+46,cy,13,ink,'left',600);U.text(c,v,x+w-23,cy,icon==='stars'?18:14,icon==='stars'?'#a76b16':ink,'right',700);
  });
  if(status){
    const cy=l.ctaY-22;
    const width=302;
    U.box(c,195-width/2,cy-11,width,23,'#fffcf0',11,'#e0cfaa');
    U.text(c,U.ellipsis(c,status,width-10,12),195,cy,12,r.error?'#974029':muted,'center');
    if(r.error)app.hit('retry-result',87,cy-16,216,32,()=>app.syncResult());
  }
}

function drawActions(app,c,l){
  const y=l.ctaY+(app.pressed==='next'?2:0);
  U.buttonPlate(c,app,77,y,236,47);
  c.fillStyle='#fffde9';c.beginPath();c.moveTo(104,y+15);c.lineTo(116,y+23.5);c.lineTo(104,y+32);c.closePath();c.fill();
  const canVerify=app.game.verifying&&!app.result.syncing&&!app.result.error;
  const next=canVerify?app.nextVerificationLevel():null;
  const verify=Number.isSafeInteger(next)&&next>0;
  const label=verify?'继续补验第 '+next+' 关':'进入下一关';
  U.title(c,label,201,y+23,verify?18:22,'#fffdf3');
  app.hit('next',77,l.ctaY,236,48,()=>verify?app.verifyRankLevel(next):app.startNextLevel());
  const navY=l.bottom-37;
  U.surface(c,120,navY-19,150,38,{gold:true});
  U.gardenBadge(c,app,2,151,navY,14);U.text(c,'闯关榜',205,navY,14,ink,'center');
  app.hit('result-rank',120,navY-22,150,44,()=>app.showLeaderboard());
}
function draw(app,c){
  const status=cloudStatus(app.result),l=layout(app,status);
  const elapsed=app.data.settings.reduceMotion?1:Math.max(0,app.now-(app.sceneAt??(app.now-1)));
  drawHeader(app,c,l,elapsed);drawPrint(app,c,l,elapsed);drawLedger(app,c,l,status);drawActions(app,c,l);
}
module.exports={draw};
