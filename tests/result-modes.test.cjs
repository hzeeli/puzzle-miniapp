'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Result=require('../game/src/result');
const J=require('../shared/journey');
const {CanvasRecorder,intersect}=require('./helpers/canvas-recorder.cjs');

function fixture(level,{stars=2,height=844,top=73,bottom=23,error=null}={}){
  const c=new CanvasRecorder(),hits=new Map(),calls=[];
  const image={id:'photo',width:280,height:420},ribbon={id:'ribbon',width:640,height:205};
  const app={game:{level,state:{completed:level.photoIds.map((_,i)=>i)},moves:[{},{}]},
    result:{stars,localMs:12200,error},h:height,top,bottom,now:1,sceneAt:1,
    data:{settings:{reduceMotion:true}},
    assets:{get:id=>id==='result-ribbon'?ribbon:{...image,id}},
    hit(id,x,y,w,h,fn){hits.set(id,{id,x,y,w,h,fn});},
    startNextLevel(){calls.push(['next']);},
    navigate(scene){this.scene=scene;},
    showLeaderboard(){calls.push(['rank']);},syncResult(){calls.push(['sync']);}};
  function draw(){hits.clear();c.paints=[];Result.draw(app,c);}
  draw();
  return {app,c,hits,calls,draw,tap:id=>hits.get(id).fn()};
}
test('结算始终可以直达下一关或全局闯关榜，第100关与更高关没有结局入口',()=>{
  for(const id of [1,60,100,101,1000]){
    const level=J.buildLevel(J.storySession(1));level.id=id;
    const s=fixture(level);
    assert.deepEqual([...s.hits.keys()],['result-home','next','result-rank']);
    s.tap('next');s.tap('result-rank');assert.deepEqual(s.calls,[['next'],['rank']]);
    s.tap('result-home');assert.equal(s.app.scene,'home');
    assert.ok(s.c.paints.some(p=>p.value==='第 '+id+' 关完成！'));
  }
});

test('补验结算同步完成后接续首个缺少证明的关，失败或上传中仍可退回',()=>{
  const level=J.buildLevel(J.storySession(1)),s=fixture(level);
  s.app.game.verifying=true;s.app.game.rewardText='花园工具 +4';
  s.app.nextVerificationLevel=()=>2;s.app.verifyRankLevel=n=>s.calls.push(['verify',n]);
  s.app.result.cloud={highestLevel:1};s.draw();
  assert.ok(s.c.paints.some(p=>p.value==='花园工具 +4'));assert.ok(s.c.paints.some(p=>p.value==='闯关进度已同步'));
  assert.ok(s.c.paints.some(p=>p.value==='继续补验第 2 关'));s.tap('next');assert.deepEqual(s.calls.pop(),['verify',2]);
  s.app.nextVerificationLevel=()=>null;s.draw();s.tap('next');assert.deepEqual(s.calls.pop(),['next']);
  s.app.result.cloud=null;s.app.result.syncing=true;s.draw();
  assert.ok(s.c.paints.some(p=>p.value==='正在同步闯关进度…'));s.tap('result-home');assert.equal(s.app.scene,'home');
  s.app.result.syncing=false;s.app.result.error='网络中断';s.draw();s.tap('result-rank');assert.deepEqual(s.calls.pop(),['rank']);
  s.tap('retry-result');assert.deepEqual(s.calls.pop(),['sync']);
  assert.ok(!s.c.paints.some(p=>p.value==='闯关进度已同步'));
});

test('减弱动态时首帧准确显示实际星数和纯手拼标记',()=>{
  for(const stars of [1,2,3]){
    const s=fixture(J.buildLevel(J.storySession(1)),{stars});
    const icons=s.c.paints.filter(p=>p.id==='result-stars');
    assert.equal(icons.length,3);assert.equal(icons.filter(p=>p.source[0]===0).length,stars);
    assert.ok(s.c.paints.some(p=>p.value==='★'.repeat(stars)+'☆'.repeat(3-stars)));
    s.app.game.pureClear=true;s.draw();assert.ok(s.c.paints.some(p=>p.value==='清风手拼'));
    s.app.game.toolHistory=[{id:'focus',at:0}];s.draw();assert.ok(!s.c.paints.some(p=>p.value==='清风手拼'));
  }
});

test('离线上传失败仍可继续闯关，并能独立点击重试',()=>{
  for(const [height,top,bottom] of [[692,108,42],[694,56,30],[844,88,34],[868,72,0]]){
    for(const error of [null,'连接失败']){
      const s=fixture(J.buildLevel(J.storySession(1)),{height,top,bottom,error});
      if(error){s.tap('retry-result');assert.deepEqual(s.calls.pop(),['sync']);}
      assert.ok(!s.c.paints.some(p=>p.value==='闯关进度已同步'));
      const hits=[...s.hits.values()];
      for(let i=0;i<hits.length;i++){
        const h=hits[i];assert.ok(h.x>=0&&h.y>=top&&h.x+h.w<=390&&h.y+h.h<=height-bottom,h.id);
        for(const other of hits.slice(i+1))assert.equal(intersect(h,other),null,h.id+' / '+other.id);
      }
    }
  }
});

test('相纸胶带在照片外，底部榜单热区满足短屏间距',()=>{
  const level=J.buildLevel(J.storySession(1)),s=fixture(level,{height:694,top:86,bottom:36});
  let photo,tape;const original=s.c.drawImage.bind(s.c);
  s.c.drawImage=(image,...args)=>{
    if(image.id===level.featuredPhotoId)photo={m:s.c.m.slice(),top:args[5]};
    original(image,...args);
  };
  s.c.fill=()=>{if(s.c.fillStyle==='rgba(242,216,154,.83)')tape=s.c.path.slice();};
  s.draw();assert.ok(photo&&tape?.length);
  const [a,b,c,d,e,f]=photo.m,det=a*d-b*c;
  for(const p of tape)assert.ok((a*(p.y-f)-b*(p.x-e))/det<photo.top);
  const hit=s.hits.get('result-rank');assert.ok(hit.w>=140&&hit.h>=44&&hit.y+hit.h<=s.app.h-s.app.bottom-14);
});
