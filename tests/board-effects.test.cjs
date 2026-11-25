'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Board=require('../game/src/board');
const {CanvasRecorder}=require('./helpers/canvas-recorder.cjs');

function scene(state,stage=null,quiet=false){
  const ctx=new CanvasRecorder();
  const level={photoIds:['photo-01','photo-02','photo-03','photo-04'],featuredPhotoId:'photo-01'};
  const app={
    h:844,top:64,bottom:30,now:1,data:{settings:{reduceMotion:quiet}},
    assets:{get:id=>({id,width:512,height:768})},
    game:{level,visual:state,stage,fusions:[],completedByMove:stage?.event.photoIndices?.length||0}
  };
  Board.draw(app,ctx);
  return{ctx,app};
}

test('显影片嵌在正确位置时仍独立绘制，解除后按相纸连块整体移动',()=>{
  const board=Array(16).fill(-1);board[0]=0;board[1]=1;
  assert.deepEqual(Board.movementGroups(board,board,[1]).map(g=>g.indices),[[0],[1]]);
  assert.deepEqual(Board.movementGroups(board,board,[]).map(g=>g.indices),[[0,1]]);
  const before={board,hidden:[1],pinned:[0],queues:[[],[],[],[]]};
  assert.equal(scene(before).ctx.paints.filter(p=>p.kind==='image').length,1,'未显影时不绘制被覆盖的原图');
  const after={...before,hidden:[]},event={type:'reveal',before,after,tokens:[1]};
  const objects=scene(before,{t:.15,duration:.30,event}).ctx;
  assert.equal(objects.stack.length,0);
  assert.equal(objects.paints.filter(p=>p.kind==='image').length,2);
  assert.ok(objects.paints.every(p=>Object.values(p.rect).every(Number.isFinite)));
});

test('冲印归档沿弧线缩向相册，开启减弱动态后照片留在原格淡出',()=>{
  const board=Array(16).fill(-1);[0,1,4,5].forEach((i,q)=>board[i]=q);
  const state={board,hidden:[],pinned:[0],queues:[[],[],[],[]]};
  const event={type:'complete',before:state,after:{...state,board:Array(16).fill(-1),pinned:[]},photoIndices:[0],unpinnedTokens:[0]};
  const stage={event,t:.72,duration:.84};
  function first(quiet){
    return scene(state,stage,quiet).ctx.paints.find(p=>p.kind==='image');
  }
  const normal=first(false),quiet=first(true);
  assert.ok(normal.rect.y<quiet.rect.y-40);
  assert.ok(normal.rect.w<quiet.rect.w*.5);
  assert.ok(normal.rect.x>quiet.rect.x+80);
});

test('最小短屏的棉纸底托与工具栏之间至少留十像素',()=>{
  const width=320,scale=width/390,app={h:568/scale,top:88/scale,bottom:34/scale};
  const b=Board.layout(app);
  assert.ok(b.deckY>=app.top+52);
  const gap=b.footerY-21-(b.y+b.h*4+7);
  assert.ok(gap*scale>=10);
  assert.ok(b.footerY+21<app.h-app.bottom);
  assert.ok(b.w*scale>=44);
  assert.equal(b.h/b.w,1.5);
});
