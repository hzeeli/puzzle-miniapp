'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Board=require('../game/src/board');

function touchFixture(){
  const events={},calls=[];
  const wx={createCanvas(){},onTouchStart:fn=>events.start=fn,onTouchMove:fn=>events.move=fn,onTouchEnd:fn=>events.end=fn,onTouchCancel:fn=>events.cancel=fn};
  const context={module:{exports:{}},require:()=>({}),wx};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../game/src/platform.js'),'utf8'),context);
  const release=context.module.exports.bindInput(null,Object.fromEntries(['down','move','up','cancel'].map(name=>[name,(...args)=>calls.push([name,...args])])));
  const touch=(identifier,x,y)=>({identifier,clientX:x,clientY:y});
  return{events,calls,release,touch};
}

test('第二根手指抬起不会提交第一根手指的拖动',()=>{
  const {events,calls,touch}=touchFixture(),first=touch(7,20,40),second=touch(8,180,240);
  events.start({touches:[first]});events.start({touches:[first,second]});
  events.move({touches:[touch(7,30,60),second]});events.end({touches:[first],changedTouches:[second]});
  events.cancel({changedTouches:[second]});
  assert.deepEqual(calls,[['down',20,40],['move',30,60]]);
  events.end({touches:[],changedTouches:[touch(7,90,160)]});
  assert.deepEqual(calls.at(-1),['up',90,160]);
});

test('取消和切后台释放触点，下一次手势能够正常开始',()=>{
  const {events,calls,release,touch}=touchFixture();
  events.start({touches:[touch(1,10,20)]});events.cancel({changedTouches:[touch(1,10,20)]});
  events.end({touches:[],changedTouches:[touch(1,90,90)]});
  events.start({touches:[touch(2,30,40)]});release();
  events.start({touches:[touch(3,50,60)]});
  assert.deepEqual(calls,[['down',10,20],['cancel'],['down',30,40],['down',50,60]]);
});

test('拆分目标连块的动画分别移动被交换片和留在原位的片',()=>{
  const before=Array(16).fill(-1);before[0]=0;before[1]=1;before[10]=4;
  const after=before.slice();after[0]=4;after[10]=0;
  const moving=Board.movementGroups(before,after);
  assert.deepEqual(moving,[{indices:[0],dx:2,dy:2},{indices:[1],dx:0,dy:0},{indices:[10],dx:-2,dy:-2}]);
});

test('三片连块使用统一位移保持相邻轮廓',()=>{
  const before=Array(16).fill(-1);before[0]=0;before[1]=1;before[4]=2;
  const after=Array(16).fill(-1);after[5]=0;after[6]=1;after[9]=2;
  assert.deepEqual(Board.movementGroups(before,after),[{indices:[0,1,4],dx:1,dy:1}]);
});

test('短屏保持照片比例，牌堆、棋盘与底部图形工具都留在安全区',()=>{
  for(const [width,height,top,bottom] of [[320,568,80,0],[375,667,96,0],[390,844,100,34],[430,932,100,34]]){
    const scale=width/390,app={h:height/scale,top:top/scale,bottom:bottom/scale},b=Board.layout(app);
    assert.ok(b.w*scale>=44);
    assert.equal(b.h/b.w,1.5);
    assert.ok(b.deckY>app.top+32);
    assert.ok(b.deckY+b.deckHeight<b.y);
    if(b.compact)assert.ok(b.y+b.h*4<=app.h-app.bottom-10);else{assert.ok(b.y+b.h*4<b.footerY-30);assert.ok(b.footerY+30<app.h-app.bottom);}
    for(let i=0;i<16;i++){const point=Board.center(app,i);assert.equal(Board.cell(app,point.x,point.y),i);}
  }
});

test('释放时源片从真实指尖位移吸附，拆分目标片仍从各自原位运动',()=>{
  const app={h:844,top:12,bottom:12,game:{dragRelease:{from:10,group:[10],dx:-122,dy:-210}}},event={type:'move',from:10,to:0};
  const source=Board.movementPose(app,{indices:[10],dx:-2,dy:-2},event,0);
  assert.equal(source.dx,-122);assert.equal(source.dy,-210);
  const displaced=Board.movementPose(app,{indices:[0],dx:2,dy:2},event,0);
  assert.equal(displaced.dx,0);assert.equal(displaced.dy,0);
  const stationary=Board.movementPose(app,{indices:[1],dx:0,dy:0},event,.5);
  assert.equal(stationary.dx,0);assert.equal(stationary.dy,0);
  const end=Board.movementPose(app,{indices:[10],dx:-2,dy:-2},event,1),b=Board.layout(app);
  assert.equal(end.dx,-b.w*2);assert.equal(end.dy,-b.h*2);
});

test('非法拖放保留真实释放坐标供回弹，不产生棋盘操作',()=>{
  const context={module:{exports:{}},require:name=>name==='./board'?Board:{},Date,Math};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../game/src/app.js'),'utf8'),context);
  const app=Object.create(context.module.exports.prototype);let moves=0;
  Object.assign(app,{scale:1,h:844,top:12,bottom:12,now:4,pointer:{},game:{drag:{from:0,group:[0],sx:70,sy:170,active:true}},playMove:()=>moves++});
  app.up(-50,-80);
  assert.equal(moves,0);assert.equal(app.game.drag,null);assert.equal(app.game.dragRelease.dx,-120);assert.equal(app.game.dragRelease.dy,-250);assert.equal(app.game.dragRelease.at,4);
});
