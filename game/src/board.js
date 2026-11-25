const R=require('../../shared/rules');
const U=require('./ui');
const ease=t=>1-Math.pow(1-Math.max(0,Math.min(1,t)),3);
function layout(app){
  const bottom=app.h-app.bottom,compact=bottom-app.top<660;
  const footerY=bottom-(compact?26:38),deckHeight=compact?32:40;
  const deckGap=deckHeight+10,top=app.top+58+deckGap;
  const available=footerY-(compact?41:44)-top;
  const width=Math.min(360,available*2/3),w=width/4,h=w*1.5;
  const y=top+(available-4*h)/2;
  return{x:(390-width)/2,y,w,h,compact,deckY:y-deckGap,deckHeight,backHeight:deckHeight-7,footerY};
}
function center(app,i){const b=layout(app);return{x:b.x+(i%4+.5)*b.w,y:b.y+(Math.floor(i/4)+.5)*b.h};}
function cell(app,x,y){const b=layout(app),col=Math.floor((x-b.x)/b.w),row=Math.floor((y-b.y)/b.h);return col>=0&&col<4&&row>=0&&row<4?row*4+col:-1;}
function outline(indices,b){
  const edges=[];
  for(const i of indices){const x=i%4,y=Math.floor(i/4);if(!indices.includes(i-4))edges.push([[x,y],[x+1,y]]);if(x===3||!indices.includes(i+1))edges.push([[x+1,y],[x+1,y+1]]);if(!indices.includes(i+4))edges.push([[x+1,y+1],[x,y+1]]);if(x===0||!indices.includes(i-1))edges.push([[x,y+1],[x,y]]);}
  const chain=[edges.shift()];while(edges.length){const last=chain[chain.length-1][1],next=edges.findIndex(e=>e[0][0]===last[0]&&e[0][1]===last[1]);if(next<0)break;chain.push(edges.splice(next,1)[0]);}
  const points=chain.map(e=>({x:b.x+e[0][0]*b.w,y:b.y+e[0][1]*b.h}));
  return points.filter((v,i)=>{const a=points[(i+points.length-1)%points.length],z=points[(i+1)%points.length];return(a.x-v.x)*(z.y-v.y)!==(a.y-v.y)*(z.x-v.x);});
}
function shape(c,points){
  c.beginPath();points.forEach((v,i)=>{const a=points[(i+points.length-1)%points.length],z=points[(i+1)%points.length],r=9,d1=Math.hypot(a.x-v.x,a.y-v.y),d2=Math.hypot(z.x-v.x,z.y-v.y),x=v.x+(a.x-v.x)*r/d1,y=v.y+(a.y-v.y)*r/d1;if(i)c.lineTo(x,y);else c.moveTo(x,y);c.quadraticCurveTo(v.x,v.y,v.x+(z.x-v.x)*r/d2,v.y+(z.y-v.y)*r/d2);});c.closePath();
}
function bounds(app,indices){const b=layout(app),xs=indices.map(i=>i%4),ys=indices.map(i=>Math.floor(i/4));return{x:b.x+Math.min(...xs)*b.w,y:b.y+Math.min(...ys)*b.h,w:(Math.max(...xs)-Math.min(...xs)+1)*b.w,h:(Math.max(...ys)-Math.min(...ys)+1)*b.h};}
const clamp=t=>Math.max(0,Math.min(1,t));
const reduced=app=>!!app.data?.settings?.reduceMotion;
const TAU=Math.PI*2;
const dust=Array.from({length:36},(_,i)=>({
  angle:i*2.399963,reach:.38+(i*13%19)/42,radius:.8+(i*17%13)/10
}));

function leaf(c,x,y,size,angle,tint){
  c.save();c.translate(x,y);c.rotate(angle);c.scale(size,size);
  c.fillStyle=tint;c.beginPath();c.moveTo(-1,.24);
  c.bezierCurveTo(-.72,-.52,-.10,-.82,1,-.35);
  c.bezierCurveTo(.74,.42,-.27,.79,-1,.24);c.fill();
  c.beginPath();c.moveTo(-.87,.24);c.quadraticCurveTo(.13,.11,.73,-.25);
  c.strokeStyle='rgba(255,255,235,.66)';c.lineWidth=.12;c.stroke();c.restore();
}

function cloudMark(c,x,y,r){
  c.save();c.translate(x,y);c.scale(r/21,r/21);
  c.beginPath();c.moveTo(-15,6);
  c.bezierCurveTo(-24,6,-25,-4,-18,-7);
  c.bezierCurveTo(-15,-10,-12,-9,-10,-8);
  c.bezierCurveTo(-6,-23,10,-22,14,-9);
  c.bezierCurveTo(25,-10,28,4,19,7);
  c.bezierCurveTo(8,11,-6,9,-15,6);c.closePath();
  c.shadowColor='rgba(93,143,170,.22)';c.shadowBlur=3;c.shadowOffsetY=1.5;
  c.fillStyle=U.gradient(c,-12,-15,25,22,['#fffefa','#fffefa','#e6f1f4']);c.fill();
  c.shadowColor='transparent';c.strokeStyle='#90b7ca';c.lineWidth=1.15;c.stroke();
  c.strokeStyle='#9dc5cf';c.lineWidth=1.25;c.lineCap='round';
  c.beginPath();c.moveTo(-17,16);c.bezierCurveTo(-12,14,-9,19,-2,15);c.stroke();
  c.beginPath();c.moveTo(-8,21);c.quadraticCurveTo(-3,22,2,19);c.stroke();
  leaf(c,10,16,5,-.38,'#9ec49b');c.restore();
}

function mist(c,x,y,w,h,exposure){
  if(exposure>=1)return;
  c.save();
  const cx=x+w/2,cy=y+h/2,limit=Math.hypot(w,h)/2;
  if(exposure>0){
    // 反向圆弧在雾层开孔，圆内可直接看到已经显露的照片。
    c.beginPath();c.rect(x,y,w,h);c.moveTo(cx+limit*exposure,cy);
    c.arc(cx,cy,limit*exposure,0,-TAU,true);c.clip();
  }
  c.fillStyle=U.gradient(c,x,y,w,h,['#f6fbfb','#dfedf5','#ccdfef']);c.fillRect(x,y,w,h);
  const haze=c.createRadialGradient(x+w*.24,y+h*.22,0,x+w*.24,y+h*.22,w*.77);
  haze.addColorStop(0,'rgba(255,255,255,.79)');haze.addColorStop(1,'rgba(255,255,255,0)');
  c.fillStyle=haze;c.fillRect(x,y,w,h);
  for(let band=0;band<2;band++){
    const lower=y+h*(.84+band*.08);
    c.fillStyle=band?'rgba(252,253,251,.64)':'rgba(247,252,255,.51)';
    c.beginPath();c.moveTo(x,lower);
    c.bezierCurveTo(x+w*.2,lower-h*.15,x+w*.31,lower-h*.07,x+w*.42,lower-h*.04);
    c.bezierCurveTo(x+w*.63,lower-h*.19,x+w*.78,lower-h*.14,x+w,lower-h*.06);
    c.lineTo(x+w,y+h);c.lineTo(x,y+h);c.closePath();c.fill();
  }
  cloudMark(c,cx,cy-h*.024,Math.min(w*.28,25));
  c.restore();
  if(exposure>0){
    c.save();c.globalAlpha*=1-exposure;c.beginPath();c.arc(cx,cy,limit*exposure,0,TAU);
    c.strokeStyle='#fff9e6';c.lineWidth=2.4;c.stroke();c.restore();
  }
}

function pin(c,x,y,size,shine){
  c.save();c.translate(x,y);c.rotate(-.25);c.scale(size,size);
  c.shadowColor='rgba(56,76,78,.5)';c.shadowOffsetY=1.6;c.shadowBlur=2.8;
  c.beginPath();c.arc(0,0,12.5,0,TAU);
  c.fillStyle=U.gradient(c,-10,-12,20,25,['#fffffc','#fff8de','#f3e5c6']);c.fill();
  c.shadowColor='transparent';c.strokeStyle='#fffef8';c.lineWidth=1.3;c.stroke();
  c.rotate(.15);
  for(let i=0;i<8;i++){
    c.rotate(TAU/8);c.beginPath();c.ellipse(0,-5.72,2.52,4.95,0,0,TAU);
    c.fillStyle=i%2?'#ffd35d':'#ffe482';c.fill();c.strokeStyle='#c79b43';c.lineWidth=.55;c.stroke();
  }
  c.beginPath();c.arc(0,0,3.5,0,TAU);c.fillStyle='#dc9b38';c.fill();
  c.fillStyle='#f5c76b';c.beginPath();c.arc(-.8,-.8,1.55,0,TAU);c.fill();
  if(shine)U.sparkle(c,-5,-7,3.4,'#fffbc2');c.restore();
}

function seamSweep(c,b,indices,progress){
  if(progress>=1)return;
  c.save();c.strokeStyle='#ffe5a5';c.lineWidth=1.8;c.lineCap='round';
  c.globalAlpha*=Math.sin(progress*Math.PI);
  for(const i of indices){
    const x=b.x+(i%4)*b.w,y=b.y+Math.floor(i/4)*b.h;
    const a=clamp(progress*1.6-.6),z=clamp(progress*1.6);
    c.beginPath();
    if(i%4<3&&indices.includes(i+1)){c.moveTo(x+b.w,y+a*b.h);c.lineTo(x+b.w,y+z*b.h);}
    if(indices.includes(i+4)){c.moveTo(x+a*b.w,y+b.h);c.lineTo(x+z*b.w,y+b.h);}
    c.stroke();
  }
  c.restore();
}

function group(c,app,state,indices,dx=0,dy=0,options={}){
  const b=layout(app),box=bounds(app,indices),points=outline(indices,b),board=state.board;
  const token=board[indices[0]],id=app.game.level.photoIds[Math.floor(token/4)];
  const image=app.assets.get(id),quiet=reduced(app);
  const fusion=app.game.fusions.find(f=>f.tokens.includes(token)),progress=fusion?clamp(fusion.t/.32):1;
  const pulse=quiet?0:.025*Math.sin(progress*Math.PI*2)*(1-progress);
  const scale=options.scale||1,locked=app.game.pinBlocked;
  if(locked&&indices.some(i=>board[i]===locked.token)&&!quiet){
    const t=clamp((app.now-locked.at)/.18);dx+=Math.sin(t*Math.PI*4)*(1-t)*3;
  }
  c.save();c.translate(dx+box.x+box.w/2,dy+box.y+box.h/2);
  if(options.angle)c.rotate(options.angle);
  c.scale(scale*(1+pulse)*.993,scale*(1-pulse)*.993);c.translate(-box.x-box.w/2,-box.y-box.h/2);
  c.globalAlpha*=options.opacity===undefined?1:options.opacity;
  c.shadowColor=options.lift?'rgba(49,81,65,.39)':'rgba(61,96,76,.23)';
  c.shadowBlur=options.lift?12:2;c.shadowOffsetY=options.lift?6:2;
  shape(c,points);c.fillStyle='#fffcdf';c.fill();c.shadowColor='transparent';
  c.save();shape(c,points);c.clip();
  for(const i of indices){
    const value=board[i],q=value%4,x=b.x+(i%4)*b.w,y=b.y+Math.floor(i/4)*b.h;
    const hidden=state.hidden?.includes(value),reveal=app.game.stage;
    const exposing=hidden&&reveal?.event.type==='reveal'&&reveal.event.tokens.includes(value);
    if(image&&(!hidden||exposing))c.drawImage(image,q%2*image.width/2,Math.floor(q/2)*image.height/2,image.width/2,image.height/2,x,y,b.w+.14,b.h+.14);
    if(hidden){
      c.save();c.beginPath();c.rect(x,y,b.w,b.h);c.clip();
      const amount=exposing?clamp(reveal.t/reveal.duration):0;
      if(quiet&&exposing)c.globalAlpha*=1-amount;
      mist(c,x,y,b.w,b.h,quiet?0:ease(amount));c.restore();
    }
  }
  const focus=app.game.focus,lit=focus&&focus.until>Date.now()&&state.board.some(t=>t>=0&&Math.floor(t/4)===focus.photo);
  if(lit&&Math.floor(token/4)!==focus.photo){
    c.fillStyle='rgba(194,205,194,.43)';c.fillRect(box.x,box.y,box.w,box.h);
  }
  if(options.flash){c.fillStyle='rgba(255,238,208,'+options.flash+')';c.fillRect(box.x,box.y,box.w,box.h);}
  seamSweep(c,b,indices,progress);c.restore();
  shape(c,points);
  const pinned=indices.some(i=>state.pinned?.includes(board[i]));
  if(pinned){
    c.shadowColor='rgba(241,186,65,.76)';c.shadowBlur=4.5;c.strokeStyle='#e4b958';c.lineWidth=4.1;c.stroke();
    c.shadowColor='transparent';
  }
  c.strokeStyle='#fffdf9';c.lineWidth=2.5;c.stroke();
  if(lit&&Math.floor(token/4)===focus.photo){
    c.strokeStyle='#b07c32';c.lineWidth=4;c.stroke();
    c.strokeStyle='#ffec82';c.lineWidth=2.2;c.stroke();
  }
  for(const i of indices){
    const value=board[i];
    if(!state.pinned?.includes(value))continue;
    const launch=options.unpin||0,alpha=1-launch;
    c.save();c.globalAlpha*=alpha;
    pin(c,b.x+(i%4)*b.w+15+launch*19,b.y+Math.floor(i/4)*b.h+15-(quiet?0:37*Math.sin(launch*Math.PI)),Math.min(1,b.w/65),locked&&app.now-locked.at<.18);
    c.restore();
  }
  c.restore();
}
function movementGroups(before,after,hidden){
  const result=[];
  for(const oldGroup of R.groups(before,hidden)){
    const remaining=new Set(oldGroup.filter(i=>after.includes(before[i])));
    while(remaining.size){
      const first=remaining.values().next().value,target=after.indexOf(before[first]),dx=target%4-first%4,dy=Math.floor(target/4)-Math.floor(first/4),indices=[first];remaining.delete(first);
      for(let n=0;n<indices.length;n++)for(const i of remaining){const to=after.indexOf(before[i]);if(to%4-i%4===dx&&Math.floor(to/4)-Math.floor(i/4)===dy&&R.joined(before,indices[n],i,hidden)){indices.push(i);remaining.delete(i);}}
      result.push({indices,dx,dy});
    }
  }
  return result;
}
function movementPose(app,moving,event,progress){
  const b=layout(app),release=app.game.dragRelease,k=ease(progress),carried=event.type==='move'&&release&&event.from===release.from&&moving.indices.every(i=>release.group.includes(i));
  const sx=carried?release.dx:0,sy=carried?release.dy:0;
  return{dx:sx+(moving.dx*b.w-sx)*k,dy:sy+(moving.dy*b.h-sy)*k,lift:!!carried&&progress<.8};
}
function drawBack(c,x,y,w,h){
  c.save();c.shadowColor='rgba(91,105,78,.17)';c.shadowBlur=1.8;c.shadowOffsetY=1.35;
  U.box(c,x,y,w,h,U.gradient(c,x,y,w,h,['#fffdf3','#fbf3dc','#f6ebce']),Math.min(8,h*.28),'#c8c7a7');
  c.shadowColor='transparent';
  const cx=x+w*.44,cy=y+h*.51,d=Math.min(8,h*.24);
  c.strokeStyle='#a4bb91';c.lineWidth=Math.max(1,d*.15);c.lineCap='round';
  c.beginPath();c.moveTo(cx-d*1.3,cy+d*.65);c.quadraticCurveTo(cx,cy+d*.13,cx+d*1.35,cy-d*.56);c.stroke();
  leaf(c,cx-d*.49,cy-d*.11,d*.70,-1.07,'#adc89d');
  leaf(c,cx+d*.3,cy+d*.22,d*.65,-.08,'#bdd0a6');
  leaf(c,cx+d*.85,cy-d*.48,d*.68,-.67,'#a7bf94');
  c.restore();
}

function deck(c,app,state,stage){
  if(app.game.level.photoIds.length<=4)return;
  const b=layout(app),queues=stage?.event.type==='refill'?stage.event.after.queues:state.queues;
  for(let col=0;col<4;col++){
    const n=queues[col].length,x=b.x+col*b.w+3,y=b.deckY;
    if(!n){c.fillStyle='rgba(145,167,136,.29)';c.fillRect(x+7,y+b.deckHeight-3,b.w-20,1);continue;}
    for(let k=Math.min(4,n)-1;k>=1;k--){
      U.box(c,x+k*.45,y+k*2.2,b.w-7,b.backHeight,'#f0e7cf',7,'#cfcbb3');
    }
    drawBack(c,x,y,b.w-7,b.backHeight);
    const cx=x+b.w-20,cy=y+b.backHeight/2,r=Math.min(9,b.backHeight*.35);
    c.beginPath();c.arc(cx,cy,r,0,TAU);c.fillStyle='#e1eddd';c.fill();c.strokeStyle='#c4d7bc';c.lineWidth=.8;c.stroke();
    U.text(c,n,cx,cy+.4,11,'#456951','center',700);
  }
}

function refill(c,app,stage){
  const b=layout(app),before=stage.event.before,after=stage.event.after,quiet=reduced(app);
  const progress=clamp(stage.t/stage.duration);
  c.save();c.beginPath();c.rect(b.x-4,b.deckY,4*b.w+8,b.y+4*b.h-b.deckY+3);c.clip();
  for(let i=0;i<16;i++){
    if(after.board[i]<0||before.board.includes(after.board[i]))continue;
    const col=i%4,row=Math.floor(i/4),p=clamp((progress-(col+row)*.035)/.79);
    if(quiet){group(c,app,after,[i],0,0,{opacity:p});continue;}
    if(p===0)continue;
    const x=b.x+(col+.5)*b.w,target=b.y+(row+.5)*b.h;
    const y=b.deckY+b.backHeight/2+(target-b.deckY-b.backHeight/2)*ease(p);
    const flip=clamp((p-.23)/.77),cos=Math.cos(Math.PI*flip);
    c.save();c.translate(x,y);c.scale(Math.max(.02,Math.abs(cos)),1);c.translate(-x,-y);
    if(flip<.5)drawBack(c,x-b.w/2,y-b.h/2,b.w,b.h);else group(c,app,after,[i],0,y-target);
    const shade=.24*(1-Math.abs(cos));c.fillStyle='rgba(25,18,15,'+shade+')';c.fillRect(x-b.w/2,y-b.h/2,b.w,b.h);
    c.restore();
  }
  c.restore();
}

function finished(c,app,stage,full){
  const quiet=reduced(app),combo=app.game.completedByMove||full.length;
  const hold=!quiet&&combo>=2?.045:0,p=clamp((stage.t-hold)/(stage.duration-hold));
  const travel=ease(clamp((p-.50)/.50)),fade=1-clamp((p-.78)/.22);
  const count=Math.min(combo>=2?16:9,Math.floor(dust.length/full.length));
  for(let n=0;n<full.length;n++){
    const indices=full[n],area=bounds(app,indices),cx=area.x+area.w/2,cy=area.y+area.h/2;
    const dx=quiet?0:(303-cx)*travel,dy=quiet?0:(app.top+24-cy)*travel-42*Math.sin(travel*Math.PI);
    const scale=quiet?1:1+.025*Math.sin(Math.PI*clamp(p/.4))-.91*travel;
    if(!quiet&&p<.66){
      const q=clamp(p/.66);
      c.save();c.globalAlpha*=Math.sin(q*Math.PI)*.8;
      for(let i=0;i<count;i++){
        const mote=dust[n*count+i],angle=mote.angle+n;
        const x=cx+Math.cos(angle)*(area.w*.47+q*mote.reach*28);
        const y=cy+Math.sin(angle)*(area.h*.48+q*mote.reach*28)-q*6;
        U.sparkle(c,x,y,mote.radius,'#f2d29b');
      }
      c.restore();
    }
    const flash=quiet?0:.19*Math.sin(Math.PI*clamp(p/.22));
    group(c,app,stage.event.before,indices,dx,dy,{scale,opacity:fade,flash,unpin:clamp((p-.12)/.33),angle:quiet?0:travel*.08});

  }
}

function guide(c,app,move){
  const a=center(app,move.from),z=center(app,move.to),quiet=reduced(app);
  const t=quiet?.65:ease(clamp((app.now%1.9)/1.15));
  const controlY=(a.y+z.y)/2-Math.min(34,Math.hypot(z.x-a.x,z.y-a.y)*.18);
  const x=a.x+(z.x-a.x)*t,y=(1-t)**2*a.y+2*(1-t)*t*controlY+t*t*z.y;
  c.save();c.lineCap='round';c.lineJoin='round';
  c.strokeStyle='rgba(191,156,80,.64)';c.lineWidth=3.5;c.setLineDash([3,6]);
  c.beginPath();c.moveTo(a.x,a.y);c.quadraticCurveTo((a.x+z.x)/2,controlY,z.x,z.y);c.stroke();
  c.strokeStyle='#fff9de';c.lineWidth=2;c.stroke();c.setLineDash([]);
  c.save();c.translate(z.x,z.y);c.rotate(Math.atan2(z.y-controlY,(z.x-a.x)/2));
  c.strokeStyle='#ba9c58';c.lineWidth=4;
  c.beginPath();c.moveTo(-7,-5);c.lineTo(0,0);c.lineTo(-7,5);c.stroke();
  c.strokeStyle='#fff9dc';c.lineWidth=2.2;c.stroke();c.restore();
  leaf(c,x,y,6.3,-.38,'#d8bb68');c.restore();
}

function drag(c,app,state){
  const d=app.game.drag,b=layout(app),to=cell(app,d.x,d.y),quiet=reduced(app);
  if(d.active&&to>=0&&to!==d.from&&!R.moveReason(state,d.from,to)){
    const offset=to-d.from;
    c.save();shape(c,outline(d.group.map(i=>i+offset),b));c.strokeStyle='#ffe5a5';
    c.lineWidth=2;c.setLineDash([5,3]);c.stroke();c.restore();
  }
  if(d.lastFrame===undefined){d.lastFrame=app.now;d.pickupAt=app.now;d.lastX=d.sx;d.angle=0;}
  const dt=app.now-d.lastFrame;
  if(dt>0){
    const goal=Math.max(-.08,Math.min(.08,(d.x-d.lastX)/Math.max(dt,.016)*.00017));
    d.angle+=(goal-d.angle)*(1-Math.exp(-dt*18));d.lastX=d.x;d.lastFrame=app.now;
  }
  group(c,app,state,d.group,d.x-d.sx,d.y-d.sy,{lift:true,angle:quiet?0:d.angle,scale:quiet?1:1+.035*ease((app.now-d.pickupAt)/.08)});
}

function draw(app,c){
  const game=app.game,b=layout(app),state=game.visual,stage=game.stage,event=stage?.event;
  const moving=event&&['move','fall','refill'].includes(event.type);
  const complete=event?.type==='complete',quiet=reduced(app);
  const groups=R.groups(state.board,state.hidden);
  const full=complete?groups.filter(indices=>indices.length===4):[];
  deck(c,app,state,stage);
  c.save();
  if(complete&&game.completedByMove>=2&&!quiet){
    const trauma=1-clamp((stage.t-.045)/.26),phase=Math.max(0,stage.t-.045)*71;
    c.translate(2.8*trauma**2*Math.sin(phase),2*trauma**2*Math.sin(phase*1.41));
  }
  c.save();c.shadowColor='rgba(82,107,109,.24)';c.shadowBlur=8;c.shadowOffsetY=3;
  U.box(c,b.x-7,b.y-7,b.w*4+14,b.h*4+14,'rgba(255,252,245,.91)',18,'#c7d7c4');
  c.restore();
  for(let i=0;i<16;i++){
    const x=b.x+i%4*b.w+1.3,y=b.y+Math.floor(i/4)*b.h+1.3;
    U.box(c,x,y,b.w-2.6,b.h-2.6,(i+Math.floor(i/4))%2?'#e4eee4':'#dfeae2',8,'#f9fbf0');
  }
  if(moving){
    const progress=clamp(stage.t/stage.duration),carried=[];
    for(const m of movementGroups(state.board,event.after.board,state.hidden)){
      const pose=movementPose(app,m,event,progress);
      if(pose.lift)carried.push({m,pose});else group(c,app,state,m.indices,pose.dx,pose.dy);
    }
    for(const {m,pose} of carried)group(c,app,state,m.indices,pose.dx,pose.dy,{lift:true});
    if(event.type==='refill')refill(c,app,stage);
  }else{
    const release=game.dragRelease,returning=release&&!stage&&!game.drag&&app.now-release.at<.18;
    for(const indices of groups){
      if(complete&&indices.length===4||game.drag&&indices.includes(game.drag.from)||returning&&indices.includes(release.from))continue;
      group(c,app,state,indices);
    }
    if(returning){const k=1-ease((app.now-release.at)/.18);group(c,app,state,release.group,release.dx*k,release.dy*k,{lift:true});}
  }
  if(complete)finished(c,app,stage,full);
  if(game.drag)drag(c,app,state);
  if(game.hint&&!stage&&!game.drag)guide(c,app,game.hint);
  c.restore();
  if(complete&&game.completedByMove>=2){
    const n=game.completedByMove,y=b.y-16;
    c.save();c.globalAlpha*=Math.min(1,stage.t/.09,(stage.duration-stage.t)/.15);
    U.box(c,147,y-10,96,20,'#fff1b6',8,'#a6a76d');
    U.text(c,(n===2?'双图拼好':'连续拼好')+' ×'+n,195,y,12,'#476148','center',700);c.restore();
  }
  if(game.dragRelease&&(!stage&&app.now-game.dragRelease.at>=.18||stage&&event.type!=='move'))delete game.dragRelease;
}

module.exports={layout,center,cell,movementGroups,movementPose,draw};
