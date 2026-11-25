'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {photoPath}=require('../game/src/photo-path');
const source=fs.readFileSync(path.join(__dirname,'../game/src/assets.js'),'utf8');

function loader(native,loadSubpackage,loadImage){
  const platform={native,loadImage:loadImage||(async src=>({src}))};
  const context={module:{exports:{}},wx:{loadSubpackage},require:id=>id==='./platform'?platform:{photoPath}};
  vm.runInNewContext(source,context);
  return new context.module.exports();
}

test('同包并发请求先完成一次分包下载，相同照片只解码一次',async()=>{
  const calls=[],images=[],progress=[];
  const assets=loader(true,params=>calls.push(params),async src=>{images.push(src);return{src};});
  const batch=assets.loadAll(['photo-13','photo-14','photo-13'],n=>progress.push(n));
  const first=assets.load('photo-13');
  assert.deepEqual(calls.map(c=>c.name),['album-02']);assert.equal(images.length,0);
  calls[0].success();await batch;
  assert.equal(await first,assets.get('photo-13'));
  assert.deepEqual(images,['packs/album-02/photo-13.jpg','packs/album-02/photo-14.jpg']);
  assert.deepEqual(progress,[.5,1]);
  await assets.load('photo-24');assert.equal(calls.length,1);
});

test('分包或解码失败可重试，已经下载成功的分包持续复用',async()=>{
  const packs=[],decoded=[];
  let rejectImage=true;
  const assets=loader(true,params=>packs.push(params),async src=>{
    decoded.push(src);
    if(rejectImage)throw new Error('解码失败');
    return{src};
  });
  const first=assets.loadAll(['photo-25','photo-26']);
  packs[0].fail();await assert.rejects(first,/下载失败/);
  assert.deepEqual(decoded,[]);
  const retry=assets.load('photo-25');packs[1].success();
  await assert.rejects(retry,/解码失败/);
  rejectImage=false;await assets.load('photo-25');
  assert.equal(packs.length,2);
  assert.deepEqual(decoded,['packs/album-03/photo-25.jpg','packs/album-03/photo-25.jpg']);
});

test('主包图兼容旧存档，网页使用相同的分包图路径，近期访问的照片优先保留',async()=>{
  const calls=[];
  const assets=loader(false,()=>assert.fail('网页不应调用微信接口'),async src=>{calls.push(src);return{src};});
  await assets.load('brand-logo');await assets.load('photo-01');
  assert.equal(assets.get('photo-01').src,'assets/photos/photo-01.jpg');
  for(let i=2;i<=24;i++)await assets.load('photo-'+String(i).padStart(2,'0'));
  const first=assets.get('photo-01');await assets.load('photo-25');
  assert.equal(assets.get('photo-01'),first);assert.equal(assets.get('photo-02'),undefined);
  assert.equal(assets.get('brand-logo').src,'assets/ui/brand-logo.png');
  await assets.load('photo-108');assert.equal(calls.at(-1),'packs/album-09/photo-108.jpg');
  await assets.load('photo-02');assert.equal(calls.at(-1),'assets/photos/photo-02.jpg');
});

test('声明过的真实分包只收录路径匹配的 JPEG，每个资源入口均可用',()=>{
  const game=path.join(__dirname,'../game');
  const {subpackages}=JSON.parse(fs.readFileSync(path.join(game,'game.json'),'utf8'));
  const disk=fs.readdirSync(path.join(game,'packs'),{withFileTypes:true}).filter(f=>f.isDirectory()).map(f=>f.name).sort();
  assert.deepEqual(subpackages.map(p=>p.name).sort(),disk);
  const ids=require('../shared/photo-catalog.json').map(p=>p.id);
  assert.equal(new Set(ids).size,96);
  for(const id of ids)assert.ok(fs.existsSync(path.join(game,photoPath(id).src)),id);
  for(const pack of subpackages){
    const dir=path.join(game,pack.root);
    assert.equal(pack.root,'packs/'+pack.name+'/');
    assert.ok(fs.statSync(path.join(dir,'game.js')).isFile());
    const files=fs.readdirSync(dir).filter(f=>f.endsWith('.jpg'));
    assert.ok(files.length>0);
    for(const file of files){
      assert.equal(photoPath(path.basename(file,'.jpg')).src,pack.root+file);
      const bytes=fs.readFileSync(path.join(dir,file));
      assert.equal(bytes.readUInt16BE(0),0xffd8);
      assert.equal(bytes.readUInt16BE(bytes.length-2),0xffd9);
    }
  }
});
