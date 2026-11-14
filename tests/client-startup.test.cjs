'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const esbuild=require('esbuild');
const {CanvasRecorder}=require('./helpers/canvas-recorder.cjs');

function compatibleModule(name,extra={}){
  const built=esbuild.buildSync({entryPoints:[path.join(__dirname,'../game/src',name)],bundle:true,write:false,format:'cjs',platform:'neutral',target:'es2018',logLevel:'silent'});
  assert.deepEqual(built.warnings.map(w=>w.id),[],'客户端包含目标运行时不能解析的语法');
  assert.equal(/\\[pP]\{/.test(built.outputFiles[0].text),false,'真机在脚本执行前拒绝Unicode属性转义');
  function RestrictedRegExp(pattern,flags){
    if(/\\[pP]\{/.test(String(pattern)))throw new SyntaxError('Invalid property name');
    return new RegExp(pattern,flags);
  }
  const context={module:{exports:{}},Intl:undefined,RegExp:RestrictedRegExp,...extra};
  vm.runInNewContext(built.outputFiles[0].text,context);
  return context.module.exports;
}

test('缺少Intl和Unicode属性转义的运行环境仍能从入口绘制首页',async()=>{
  const c=new CanvasRecorder();let frame;
  const wx={
    createCanvas:()=>({getContext:()=>c}),getStorageSync:()=>({}),
    getWindowInfo:()=>({windowWidth:390,windowHeight:844,screenHeight:844,pixelRatio:1,statusBarHeight:44,safeArea:{bottom:810}}),
    getMenuButtonBoundingClientRect:()=>({bottom:74}),
    createImage:()=>({width:512,height:768,set src(value){this.id=value;this.onload();}}),
    onTouchStart(){},onTouchMove(){},onTouchEnd(){},onTouchCancel(){},onWindowResize(){},onHide(){},onShow(){}
  };
  const App=compatibleModule('app.js',{wx,requestAnimationFrame:fn=>{frame=fn;}});
  const app=new App();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.scene,'home');
  frame(16);
  assert.ok(c.paints.some(p=>p.kind==='text'&&p.value==='开始拼图'));
});

test('兼容分段保留组合emoji、附加符、国旗及非拉丁文字的完整字形',()=>{
  const ui=compatibleModule('ui.js');
  for(const name of ['e\u0301','👩🏽‍🎨','👨‍👩‍👧‍👦','🇨🇳','क्षि','한','عَ']){
    assert.deepEqual(Array.from(ui.textParts(name)),[name]);
  }
  assert.deepEqual(Array.from(ui.textParts('拼图🇨🇳e\u0301')),['拼','图','🇨🇳','e\u0301']);
});
