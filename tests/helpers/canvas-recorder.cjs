'use strict';
const intersect=(a,b)=>{const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),right=Math.min(a.x+a.w,b.x+b.w),bottom=Math.min(a.y+a.h,b.y+b.h);return right>x&&bottom>y?{x,y,w:right-x,h:bottom-y}:null;};
const union=items=>{const x=Math.min(...items.map(r=>r.x)),y=Math.min(...items.map(r=>r.y));return{x,y,w:Math.max(...items.map(r=>r.x+r.w))-x,h:Math.max(...items.map(r=>r.y+r.h))-y};};
class CanvasRecorder{
  constructor(){this.font='600 16px sans-serif';this.textAlign='left';this.textBaseline='middle';this.globalAlpha=1;this.m=[1,0,0,1,0,0];this.clipRect=null;this.stack=[];this.paints=[];this.path=[];}
  point(x,y){const[a,b,c,d,e,f]=this.m;return{x:a*x+c*y+e,y:b*x+d*y+f};}
  rectBounds(x,y,w,h){return union([this.point(x,y),this.point(x+w,y),this.point(x,y+h),this.point(x+w,y+h)].map(p=>({...p,w:0,h:0})));}
  save(){this.stack.push({m:this.m.slice(),clipRect:this.clipRect&&{...this.clipRect},font:this.font,textAlign:this.textAlign,textBaseline:this.textBaseline,globalAlpha:this.globalAlpha});}
  restore(){Object.assign(this,this.stack.pop());}
  translate(x,y){const[a,b,c,d,e,f]=this.m;this.m=[a,b,c,d,e+a*x+c*y,f+b*x+d*y];}
  scale(x,y){const[a,b,c,d,e,f]=this.m;this.m=[a*x,b*x,c*y,d*y,e,f];}
  rotate(t){const[a,b,c,d,e,f]=this.m,k=Math.cos(t),s=Math.sin(t);this.m=[a*k+c*s,b*k+d*s,c*k-a*s,d*k-b*s,e,f];}
  setTransform(a,b,c,d,e,f){this.m=[a,b,c,d,e,f];}
  beginPath(){this.path=[];}
  moveTo(x,y){this.path.push(this.point(x,y));}
  lineTo(x,y){this.moveTo(x,y);}
  quadraticCurveTo(a,b,x,y){this.moveTo(a,b);this.moveTo(x,y);}
  bezierCurveTo(a,b,d,e,x,y){this.moveTo(a,b);this.moveTo(d,e);this.moveTo(x,y);}
  rect(x,y,w,h){this.moveTo(x,y);this.moveTo(x+w,y+h);}
  arc(x,y,r){this.rect(x-r,y-r,r*2,r*2);}
  ellipse(x,y,rx,ry){this.rect(x-rx,y-ry,rx*2,ry*2);}
  closePath(){}
  clip(){const bounds=union(this.path.map(p=>({...p,w:0,h:0})));this.clipRect=this.clipRect?intersect(this.clipRect,bounds):bounds;}
  fill(){}
  stroke(){}
  setLineDash(){}
  fillRect(x,y,w,h){this.record({kind:'fill'},this.rectBounds(x,y,w,h));}
  createLinearGradient(){return{addColorStop(){}};}
  createRadialGradient(){return{addColorStop(){}};}
  measureText(value){const size=Number(/([\d.]+)px/.exec(this.font)[1]),segments=Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(String(value)),x=>x.segment);return{width:segments.reduce((sum,ch)=>sum+(ch===' '?.3:/^[\x00-\x7f]$/.test(ch)?.58:1),0)*size};}
  record(value,rect){const visible=this.clipRect?intersect(rect,this.clipRect):rect;if(visible&&this.globalAlpha>0)this.paints.push({...value,rect:visible,full:rect,owner:this.owner});}
  fillText(value,x,y){const size=Number(/([\d.]+)px/.exec(this.font)[1]),w=this.measureText(value).width,left=this.textAlign==='center'?x-w/2:this.textAlign==='right'?x-w:x;this.record({kind:'text',value:String(value),font:this.font},this.rectBounds(left,y-size*.6,w,size*1.2));}
  strokeText(){}
  drawImage(image,...args){const dest=args.length===8?args.slice(4):args.length===4?args:[args[0],args[1],image.width,image.height],source=args.length===8?args.slice(0,4):[0,0,image.width,image.height];this.record({kind:'image',id:image.id,source,displayW:dest[2]*Math.hypot(this.m[0],this.m[1]),displayH:dest[3]*Math.hypot(this.m[2],this.m[3])},this.rectBounds(...dest));}
}
module.exports={CanvasRecorder,intersect,union};
