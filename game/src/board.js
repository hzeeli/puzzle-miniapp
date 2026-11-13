const R=require('../../shared/rules');
const U=require('./ui');
const ease=t=>1-Math.pow(1-Math.max(0,Math.min(1,t)),3);
function layout(app){
  const compact=app.h-app.top-app.bottom<660,baseY=app.top+(compact?95:112),available=app.h-app.bottom-baseY-(compact?12:72),width=Math.min(364,available*2/3),w=width/4,h=w*1.5,y=baseY+Math.max(0,available-h*4)*.5;
  return{x:(390-width)/2,y,w,h,compact,deckY:y-(compact?47:64),deckHeight:compact?42:52,backHeight:compact?31:47,footerY:app.h-app.bottom-35};
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
  c.beginPath();points.forEach((v,i)=>{const a=points[(i+points.length-1)%points.length],z=points[(i+1)%points.length],r=5,d1=Math.hypot(a.x-v.x,a.y-v.y),d2=Math.hypot(z.x-v.x,z.y-v.y),x=v.x+(a.x-v.x)*r/d1,y=v.y+(a.y-v.y)*r/d1;if(i)c.lineTo(x,y);else c.moveTo(x,y);c.quadraticCurveTo(v.x,v.y,v.x+(z.x-v.x)*r/d2,v.y+(z.y-v.y)*r/d2);});c.closePath();
}
function bounds(app,indices){const b=layout(app),xs=indices.map(i=>i%4),ys=indices.map(i=>Math.floor(i/4));return{x:b.x+Math.min(...xs)*b.w,y:b.y+Math.min(...ys)*b.h,w:(Math.max(...xs)-Math.min(...xs)+1)*b.w,h:(Math.max(...ys)-Math.min(...ys)+1)*b.h};}
function group(c,app,board,indices,dx=0,dy=0,options={}){
  const b=layout(app),box=bounds(app,indices),points=outline(indices,b),token=board[indices[0]],image=app.assets.get(app.game.level.photoIds[Math.floor(token/4)]);
  const fusion=app.game.fusions.find(f=>f.tokens.includes(token)),glow=options.glow===undefined?(fusion?Math.max(0,Math.sin(Math.min(1,fusion.t/.45)*Math.PI)):0):options.glow;
  c.save();c.translate(dx,dy);c.translate(box.x+box.w/2,box.y+box.h/2);c.scale((options.scale||1)*.993,(options.scale||1)*.993);c.translate(-box.x-box.w/2,-box.y-box.h/2);c.globalAlpha=options.opacity===undefined?1:options.opacity;
  c.shadowColor=options.lift?'rgba(2,18,24,.48)':'rgba(2,17,24,.31)';c.shadowBlur=options.lift?14:3;c.shadowOffsetX=options.lift?1:0;c.shadowOffsetY=options.lift?7:2;shape(c,points);c.fillStyle='#f3eee0';c.fill();c.shadowColor='transparent';
  c.save();shape(c,points);c.clip();if(image)for(const i of indices){const q=board[i]%4;c.drawImage(image,q%2*image.width/2,Math.floor(q/2)*image.height/2,image.width/2,image.height/2,b.x+i%4*b.w,b.y+Math.floor(i/4)*b.h,b.w+.3,b.h+.3);}c.restore();
  shape(c,points);c.strokeStyle='#f5f0df';c.lineWidth=1.15;c.stroke();
  if(glow>0){c.globalAlpha*=glow;shape(c,points);c.strokeStyle='#ffe5a0';c.lineWidth=2.5;c.stroke();}
  c.restore();
}
function movementGroups(before,after){
  const result=[];
  for(const oldGroup of R.groups(before)){
    const remaining=new Set(oldGroup.filter(i=>after.includes(before[i])));
    while(remaining.size){
      const first=remaining.values().next().value,target=after.indexOf(before[first]),dx=target%4-first%4,dy=Math.floor(target/4)-Math.floor(first/4),indices=[first];remaining.delete(first);
      for(let n=0;n<indices.length;n++)for(const i of remaining){const to=after.indexOf(before[i]);if(to%4-i%4===dx&&Math.floor(to/4)-Math.floor(i/4)===dy&&R.joined(before,indices[n],i)){indices.push(i);remaining.delete(i);}}
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
function drawBack(c,app,x,y,w,h){const back=app.assets.get('card-back');if(back)c.drawImage(back,x,y,w,h);}
function deck(c,app,state,stage){
  const b=layout(app),queues=stage?.event.type==='refill'?stage.event.after.queues:state.queues;
  c.save();c.beginPath();c.rect(b.x-3,b.deckY-3,b.w*4+6,b.y-b.deckY);c.clip();
  for(let col=0;col<4;col++){
    const n=queues[col].length;if(!n)continue;
    for(let k=Math.min(n,4)-1;k>=0;k--)drawBack(c,app,b.x+col*b.w+1,b.deckY+k*3.1,b.w-2,b.backHeight);
    U.text(c,n,b.x+(col+1)*b.w-12,b.deckY+b.backHeight-11,11,'#fff7da','right',800);
  }
  c.restore();
}
function refill(c,app,stage){
  const b=layout(app),old=stage.event.before.board,next=stage.event.after.board,progress=Math.min(1,stage.t/stage.duration);
  c.save();c.beginPath();c.rect(b.x-6,b.deckY,b.w*4+12,app.h-b.deckY);c.clip();
  for(let i=0;i<16;i++){
    if(next[i]<0||old.includes(next[i]))continue;
    const p=Math.max(0,Math.min(1,(progress-(i%4)*.018)/.946)),fall=Math.min(1,p/.4),flip=Math.max(0,(p-.4)/.6),x=b.x+(i%4+.5)*b.w,targetY=b.y+(Math.floor(i/4)+.5)*b.h,y=b.deckY+b.h*.15+(targetY-b.deckY-b.h*.15)*ease(fall),sx=Math.max(.025,Math.abs(Math.cos(Math.PI*flip)));
    c.save();c.translate(x,y);c.scale(sx,1);c.translate(-x,-y);
    if(flip<.5)drawBack(c,app,x-b.w/2,y-b.h/2,b.w,b.h);else group(c,app,next,[i],0,y-targetY);
    c.restore();
  }
  c.restore();
}
function completed(c,app,stage,full){
  const b=layout(app),p=Math.min(1,stage.t/stage.duration),fade=p<.55?1:Math.max(0,1-(p-.55)/.45),scale=p<.55?1+.014*Math.sin(p/.55*Math.PI):1-(p-.55)/.45*.2;
  for(const indices of full){
    const area=bounds(app,indices);group(c,app,stage.event.before.board,indices,0,0,{scale,opacity:fade,glow:p<.6?Math.sin(Math.min(1,p/.6)*Math.PI):0});
    if(p<.72){c.save();c.globalAlpha=Math.max(0,1-p/.72);for(let i=0;i<6;i++){const angle=i*Math.PI/3+.3,x=area.x+area.w/2+Math.cos(angle)*(area.w*.51+p*14),y=area.y+area.h/2+Math.sin(angle)*(area.h*.5+p*12);U.sparkle(c,x,y,2.5+Math.sin(p*5+i)**2*2,'#ffe7a8');}c.restore();}
  }
}
function draw(app,c){
  const game=app.game,b=layout(app),state=game.visual,stage=game.stage,current=state.board;
  deck(c,app,state,stage);
  for(let i=0;i<16;i++)U.box(c,b.x+i%4*b.w+1,b.y+Math.floor(i/4)*b.h+1,b.w-2,b.h-2,'rgba(8,37,48,.19)',5,'rgba(216,233,229,.08)');
  const complete=stage?.event.type==='complete',full=complete?R.groups(stage.event.before.board).filter(indices=>indices.length===4):[];
  if(stage&&['move','fall','refill'].includes(stage.event.type)){
    const old=stage.event.before.board,next=stage.event.after.board,progress=Math.min(1,stage.t/stage.duration),groups=movementGroups(old,next),carried=[];
    for(const moving of groups){const pose=movementPose(app,moving,stage.event,progress);if(pose.lift)carried.push({moving,pose});else group(c,app,old,moving.indices,pose.dx,pose.dy);}
    for(const {moving,pose} of carried)group(c,app,old,moving.indices,pose.dx,pose.dy,{lift:true});
    if(stage.event.type==='refill')refill(c,app,stage);
  }else{
    const release=game.dragRelease,returning=release&&!stage&&!game.drag&&(app.now-release.at)<.18;
    for(const indices of R.groups(current)){if(full.some(g=>g.includes(indices[0])))continue;if(game.drag&&indices.includes(game.drag.from))continue;if(returning&&indices.includes(release.from))continue;group(c,app,current,indices);}
    if(returning){const k=1-ease((app.now-release.at)/.18);group(c,app,current,release.group,release.dx*k,release.dy*k,{lift:true});}
  }
  if(complete)completed(c,app,stage,full);
  if(game.drag){
    const d=game.drag,to=cell(app,d.x,d.y),dx=to%4-d.from%4,dy=Math.floor(to/4)-Math.floor(d.from/4);
    if(d.active&&to>=0&&to!==d.from&&d.group.every(i=>i%4+dx>=0&&i%4+dx<4&&Math.floor(i/4)+dy>=0&&Math.floor(i/4)+dy<4)){c.save();shape(c,outline(d.group.map(i=>i+dy*4+dx),b));c.strokeStyle='rgba(255,231,166,.75)';c.lineWidth=2;c.stroke();c.restore();}
    group(c,app,current,d.group,d.x-d.sx,d.y-d.sy,{lift:true});
  }
  if(game.hint&&!stage&&!game.drag){const a=center(app,game.hint.from),z=center(app,game.hint.to),phase=(app.now%2)/2,k=ease(Math.min(1,phase/.67));c.save();c.strokeStyle='rgba(255,233,179,.8)';c.lineWidth=2;c.setLineDash([4,5]);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(z.x,z.y);c.stroke();c.setLineDash([]);U.contain(c,app.assets.get('hint-hand'),a.x+(z.x-a.x)*k-10,a.y+(z.y-a.y)*k-8,49,65);c.restore();}
  if(game.dragRelease&&(!stage&&app.now-game.dragRelease.at>=.18||stage&&stage.event.type!=='move'))delete game.dragRelease;
}
module.exports={layout,center,cell,movementGroups,movementPose,draw};
