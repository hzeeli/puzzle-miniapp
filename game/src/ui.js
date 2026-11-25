const {collectGraphemes}=require('unicode-segmenter/grapheme');
const palette={ink:'#234f49',muted:'#51746d',cream:'#fff9e9',gold:'#a05b21',brown:'#76502b',blue:'#457e8a',deep:'#2d675b',paper:'#fffdf0'};
const CONTROL_NAMES=['back','pause','hint','album','trophy','settings','replay','home','cloud'];
function textParts(value){return collectGraphemes(String(value||''));}
function ellipsis(c,value,width,size,weight=700){c.font=weight+' '+size+'px "PingFang SC","Microsoft YaHei",sans-serif';const text=String(value||'');if(c.measureText(text).width<=width)return text;const parts=textParts(text);let low=0,high=parts.length;while(low<high){const mid=Math.ceil((low+high)/2);if(c.measureText(parts.slice(0,mid).join('')+'…').width<=width)low=mid;else high=mid-1;}return parts.slice(0,low).join('')+'…';}
function rounded(c,x,y,w,h,r){r=Math.max(0,Math.min(r,w/2,h/2));c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();}
function box(c,x,y,w,h,color,r=12,stroke){rounded(c,x,y,w,h,r);c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}
function gradient(c,x,y,w,h,colors){const value=c.createLinearGradient(x,y,x+w*.15,y+h);colors.forEach((color,i)=>value.addColorStop(i/(colors.length-1),color));return value;}
function text(c,value,x,y,size=16,color=palette.ink,align='left',weight=600){c.font=weight+' '+size+'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';c.fillStyle=color;c.textAlign=align;c.textBaseline='middle';c.fillText(String(value),x,y);}
function title(c,value,x,y,size=26,color=palette.ink){
  c.save();c.font='700 '+size+'px "PingFang SC","Microsoft YaHei",sans-serif';
  c.textAlign='center';c.textBaseline='middle';c.fillStyle=color;c.fillText(String(value),x,y);c.restore();
}
function wrap(c,value,x,y,width,size=13,color=palette.ink,lineHeight=21){let line='',row=0;for(const ch of String(value)){c.font='500 '+size+'px "PingFang SC",sans-serif';if(ch==='\n'||c.measureText(line+ch).width>width&&line){text(c,line,x,y+row*lineHeight,size,color);line=ch==='\n'?'':ch;row++;}else line+=ch;}if(line)text(c,line,x,y+row*lineHeight,size,color);return(row+1)*lineHeight;}
function crop(image,w,h){const scale=Math.max(w/image.width,h/image.height),sw=w/scale,sh=h/scale;return{x:(image.width-sw)/2,y:(image.height-sh)/2,w:sw,h:sh};}
function photo(c,image,x,y,w,h,r=8,focusY=.5){if(!image)return;c.save();rounded(c,x,y,w,h,r);c.clip();const s=crop(image,w,h);s.y=Math.max(0,Math.min(image.height-s.h,image.height*focusY-s.h/2));c.drawImage(image,s.x,s.y,s.w,s.h,x,y,w,h);c.restore();}
function contain(c,image,x,y,w,h){if(!image)return;const scale=Math.min(w/image.width,h/image.height);c.drawImage(image,x+(w-image.width*scale)/2,y+(h-image.height*scale)/2,image.width*scale,image.height*scale);}
function frame(c,image,x,y,w,h,angle=0,options={}){
  c.save();c.translate(x+w/2,y+h/2);c.rotate(angle);
  c.shadowColor='rgba(12,17,13,.38)';c.shadowBlur=options.flat?3:8;c.shadowOffsetY=options.flat?2:5;
  box(c,-w/2-4,-h/2-4,w+8,h+12,palette.paper,12);
  c.shadowColor='transparent';photo(c,image,-w/2,-h/2,w,h,9,options.focusY);c.restore();
}
function surface(c,x,y,w,h,options={}){
  box(c,x,y+2,w,h,options.gold?'#c4d7ba':'#b8d0c5',Math.min(19,h/2));
  box(c,x,y,w,h,options.gold?'#fff9e6':'#f5fff5',Math.min(19,h/2),'rgba(131,165,153,.65)');
}
function atlas(c,app,name,x,y,size,options={}){const image=app.assets.get('controls-atlas'),index=CONTROL_NAMES.indexOf(name);if(!image||index<0)return;const sw=image.width/3,sh=image.height/3,side=size*1.08,pad=(side-size)/2;c.save();if(options.mirror){c.translate(x*2+size,0);c.scale(-1,1);}c.drawImage(image,index%3*sw,Math.floor(index/3)*sh,sw,sh,x-pad,y-pad,side,side);c.restore();}
function control(c,app,id,name,x,y,size,fn,options={}){const down=app.pressed===id,shift=down?2:0;c.save();if(options.disabled)c.globalAlpha=.5;atlas(c,app,name,x-size/2,y-size/2+shift,size,options);c.restore();if(!options.disabled)app.hit(id,x-size/2-3,y-size/2-3,size+6,size+6,fn);}
function buttonPlate(c,app,x,y,w,h){
  const radius=h/2;
  box(c,x,y+3,w,h,'#486635',radius);
  box(c,x,y,w,h,gradient(c,x,y,w,h,['#729348','#5b813e','#507636']),radius,'#fff6cf');
  rounded(c,x+3,y+3,w-6,h-6,radius-3);c.strokeStyle='rgba(255,255,239,.62)';c.lineWidth=1;c.stroke();
}
function button(c,app,id,label,x,y,w,h,fn,options={}){const down=app.pressed===id,dy=down?3:0;c.save();if(options.disabled)c.globalAlpha=.5;buttonPlate(c,app,x,y+dy,w,h);title(c,label,x+w/2,y+h*.48+dy,options.size||24,'#fffdf3');c.restore();if(!options.disabled&&!options.noHit)app.hit(id,x,y,w,h,fn);}
function ring(c,x,y,r){c.beginPath();c.arc(x,y,r+1.5,0,Math.PI*2);c.fillStyle='#c5ad7c';c.fill();}
function gardenBadge(c,app,index,x,y,r){
  const image=app.assets.get('garden-badges');
  if(!image)return;
  const size=image.width/3,inner=size*.91,margin=(size-inner)/2;
  c.save();c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.clip();
  c.drawImage(image,index%3*size+margin,Math.floor(index/3)*size+margin,inner,inner,x-r,y-r,r*2,r*2);c.restore();
}
function avatar(c,app,profile,x,y,r=22){
  const image=app.avatarFor?app.avatarFor(profile):null;
  ring(c,x,y,r);
  if(!image){gardenBadge(c,app,3,x,y,r);return;}
  c.save();c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.clip();
  const source=crop(image,r*2,r*2);c.drawImage(image,source.x,source.y,source.w,source.h,x-r,y-r,r*2,r*2);c.restore();
}
function symbol(c,name,x,y,size=20,color=palette.cream){c.save();c.translate(x,y);c.scale(size/24,size/24);c.strokeStyle=color;c.fillStyle=color;c.lineWidth=2.4;c.lineCap='round';c.lineJoin='round';c.beginPath();if(name==='clock'){c.arc(0,1,9,0,Math.PI*2);c.moveTo(0,-4);c.lineTo(0,1);c.lineTo(4,3);c.moveTo(-2,-11);c.lineTo(2,-11);}else if(name==='sun'){c.arc(0,0,5,0,7);for(let i=0;i<8;i++){const a=i*Math.PI/4;c.moveTo(8*Math.cos(a),8*Math.sin(a));c.lineTo(11*Math.cos(a),11*Math.sin(a));}}else if(name==='leaf'){c.moveTo(-8,9);c.quadraticCurveTo(-12,-6,9,-9);c.quadraticCurveTo(12,5,-8,9);c.moveTo(-8,9);c.lineTo(4,-4);}else if(name==='album-lock'){c.rect(-7,-1,14,11);c.moveTo(-4,-1);c.quadraticCurveTo(-5,-14,3,-9);c.quadraticCurveTo(5,-7,4,-1);}else if(name==='check'){c.moveTo(-8,0);c.lineTo(-2,6);c.lineTo(8,-6);}else if(name==='sound'){c.moveTo(-9,-4);c.lineTo(-4,-4);c.lineTo(2,-9);c.lineTo(2,9);c.lineTo(-4,4);c.lineTo(-9,4);c.closePath();c.moveTo(6,-6);c.quadraticCurveTo(14,0,6,6);}else if(name==='music'){c.moveTo(-3,4);c.lineTo(-3,-8);c.lineTo(8,-10);c.lineTo(8,2);c.moveTo(-3,-5);c.lineTo(8,-7);c.stroke();c.beginPath();c.ellipse(-6,6,4,3,-.4,0,7);c.ellipse(5,4,4,3,-.4,0,7);c.fill();}else if(name==='haptic'){c.rect(-5,-9,10,18);c.moveTo(-9,-5);c.quadraticCurveTo(-14,0,-9,5);c.moveTo(9,-5);c.quadraticCurveTo(14,0,9,5);}else if(name==='crown'){c.moveTo(-10,-5);c.lineTo(-7,8);c.lineTo(7,8);c.lineTo(10,-5);c.lineTo(4,0);c.lineTo(0,-10);c.lineTo(-4,0);c.closePath();c.fill();}c.stroke();c.restore();}
function medal(c,rank,x,y,r=15){const colors=rank===1?['#fff3aa','#e7ad44']:rank===2?['#fffaf0','#9baeb6']:['#f9deb0','#bf8754'];c.save();c.shadowColor='rgba(0,38,60,.3)';c.shadowBlur=3;c.shadowOffsetY=2;c.beginPath();c.arc(x,y,r,0,7);c.fillStyle=gradient(c,x-r,y-r,r*2,r*2,colors);c.fill();c.strokeStyle='#fff7dc';c.lineWidth=2;c.stroke();c.restore();title(c,rank,x,y+1,r*1.1,rank===2?'#3d4b52':'#936020');}
function sparkle(c,x,y,r,color='#fff4c4'){c.save();c.fillStyle=color;c.beginPath();c.moveTo(x,y-r);c.quadraticCurveTo(x+2,y-2,x+r,y);c.quadraticCurveTo(x+2,y+2,x,y+r);c.quadraticCurveTo(x-2,y+2,x-r,y);c.quadraticCurveTo(x-2,y-2,x,y-r);c.fill();c.restore();}
function time(ms,precise=false){if(!Number.isFinite(ms))return'—';const total=Math.max(0,Math.floor(ms/1000)),minutes=Math.floor(total/60),seconds=total%60;return String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0')+(precise?'.'+Math.floor(ms%1000/100):'');}
module.exports={palette,rounded,box,gradient,text,title,wrap,crop,photo,contain,frame,surface,atlas,control,buttonPlate,button,gardenBadge,avatar,symbol,medal,sparkle,time,textParts,ellipsis};
