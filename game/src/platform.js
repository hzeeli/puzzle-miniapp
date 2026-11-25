const native = typeof wx !== 'undefined' && typeof wx.createCanvas === 'function';
const config = require('./config');
let privacyHandler = null;
let privacyRequest = null;
function windowInfo() {
  if (native) {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    return { width:info.windowWidth, height:info.windowHeight, dpr:Math.min(info.pixelRatio||1,2), top:Math.max(info.statusBarHeight||0,menu?menu.bottom:0)+8, bottom:info.safeArea?Math.max(0,info.screenHeight-info.safeArea.bottom):0 };
  }
  const width=window.innerWidth>600?Math.min(430,window.innerHeight*390/844):window.innerWidth;
  return {width,height:window.innerHeight,dpr:Math.min(window.devicePixelRatio||1,2),top:12,bottom:12};
}
function createCanvas() { return native ? wx.createCanvas() : document.getElementById('game'); }
function loadImage(src) { return new Promise((resolve,reject)=>{const image=native?wx.createImage():new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('图片加载失败：'+src));image.src=src;}); }
function read() {
  try {
    const stored=native?JSON.stringify(wx.getStorageSync(config.storageKey)||{}):localStorage.getItem(config.storageKey);
    return JSON.parse(stored||'{}');
  }catch(e){return {};}
}
function write(value) {
  try {
    // 微信可能保留传入对象的引用，每次存储都提交独立快照。
    const snapshot=JSON.stringify(value);
    if(native)wx.setStorageSync(config.storageKey,JSON.parse(snapshot));
    else localStorage.setItem(config.storageKey,snapshot);
    return true;
  }catch(e){return false;}
}
function bindInput(canvas, handlers) {
  let pointer=null;
  const release=()=>{pointer=null;};
  const cancel=()=>{if(pointer===null)return;release();handlers.cancel();};
  if(native) {
    wx.onTouchStart(e=>{if(pointer!==null||e.touches.length!==1)return;const p=e.touches[0];pointer=p.identifier;handlers.down(p.clientX,p.clientY);});
    wx.onTouchMove(e=>{const p=e.touches.find(t=>t.identifier===pointer);if(p)handlers.move(p.clientX,p.clientY);});
    wx.onTouchEnd(e=>{const p=e.changedTouches.find(t=>t.identifier===pointer);if(!p)return;release();handlers.up(p.clientX,p.clientY);});
    wx.onTouchCancel(e=>{if(e.changedTouches.some(t=>t.identifier===pointer))cancel();});
  } else {
    const position=e=>{const rect=canvas.getBoundingClientRect();return [e.clientX-rect.left,e.clientY-rect.top];};
    canvas.addEventListener('pointerdown',e=>{if(pointer!==null||e.button!==0)return;e.preventDefault();pointer=e.pointerId;canvas.setPointerCapture(pointer);handlers.down(...position(e));});
    canvas.addEventListener('pointermove',e=>{if(e.pointerId===pointer)handlers.move(...position(e));});
    canvas.addEventListener('pointerup',e=>{if(e.pointerId!==pointer)return;release();handlers.up(...position(e));});
    canvas.addEventListener('pointercancel',e=>{if(e.pointerId===pointer)cancel();});
    canvas.addEventListener('lostpointercapture',e=>{if(e.pointerId===pointer)cancel();});
  }
  return release;
}
function onResize(fn) {if(native&&wx.onWindowResize)wx.onWindowResize(fn);else if(!native)window.addEventListener('resize',fn);}
function onVisibility(fn) {if(native){wx.onHide(()=>fn(false));wx.onShow(()=>fn(true));}else document.addEventListener('visibilitychange',()=>fn(!document.hidden));}
function onReconnect(fn){
  if(native&&wx.onNetworkStatusChange)wx.onNetworkStatusChange(event=>{if(event.isConnected)fn();});
  else if(!native)window.addEventListener('online',fn);
}
function vibrate() {if(native&&wx.vibrateShort)wx.vibrateShort({type:'light'});}
function cloudReady() {return native&&!!wx.cloud&&!!config.cloudEnv;}
let cloudInitialized=false;
function initializeCloud() {
  if(!cloudReady()){const e=new Error(native?'云成绩暂未准备好，请稍后重试':'浏览器验收不连接微信身份，请在微信开发者工具中测试云功能');e.code='CLOUD_UNAVAILABLE';throw e;}
  if(!cloudInitialized){wx.cloud.init({env:config.cloudEnv,traceUser:false});cloudInitialized=true;}
}
async function callCloud(action,payload) {
  initializeCloud();
  let timeout,response;
  try {
    response=await Promise.race([wx.cloud.callFunction({name:config.cloudFunction,data:{action,payload}}),new Promise((_,reject)=>{timeout=setTimeout(()=>{const e=new Error('网络连接超时，请检查网络后重试');e.code='NETWORK_TIMEOUT';reject(e);},12000);})]);
  } catch(error) {
    if(error&&error.code==='NETWORK_TIMEOUT')throw error;
    const failure=new Error('云服务暂时不可用，请稍后重试');failure.code='CLOUD_REQUEST_FAILED';failure.retryable=true;throw failure;
  } finally {clearTimeout(timeout);}
  if(!response.result||!response.result.ok){const error=response.result&&response.result.error;const e=new Error(error&&error.message||'服务暂时不可用');e.code=error&&error.code||'SERVER_ERROR';e.retryable=!!(error&&error.retryable);throw e;}
  return response.result.data;
}
function setPrivacyHandler(fn) {
  privacyHandler=fn;
  if(native&&wx.onNeedPrivacyAuthorization)wx.onNeedPrivacyAuthorization(resolve=>{const request=privacyRequest;resolve({event:'exposureAuthorization'});privacyHandler(answer=>{if(request)request.accepted=answer===true;resolve({event:answer?'agree':'disagree'});});});
}
function privacyDenied(){const error=new Error('暂未开启云成绩，你仍可以在本地游玩');error.code='PRIVACY_NOT_AUTHORIZED';return error;}
async function authorizePrivacy(needsConsent=true) {
  const request={accepted:false};privacyRequest=request;
  try{
    if(native&&wx.requirePrivacyAuthorize)await new Promise((resolve,reject)=>wx.requirePrivacyAuthorize({success:resolve,fail:()=>reject(privacyDenied())}));
    // 平台已授权可能直接成功，本游戏的数据说明仍需首次明确同意。
    if(needsConsent&&!request.accepted)await new Promise((resolve,reject)=>privacyHandler(answer=>answer?resolve():reject(privacyDenied())));
  }finally{if(privacyRequest===request)privacyRequest=null;}
}
async function openPrivacy() {
  if(!native)throw new Error('请在微信中查看正式隐私指引');
  if(!wx.openPrivacyContract)throw new Error('当前微信版本暂不支持打开隐私指引，请升级微信');
  return new Promise((resolve,reject)=>wx.openPrivacyContract({success:resolve,fail:()=>reject(new Error('隐私指引暂未打开，请点击链接重试'))}));
}
function userInfoFailure(result) {
  const errno=result?Number(result.errno):NaN;
  const setup=[112,1025,1026].includes(errno),denied=!setup&&result&&/deny|cancel/i.test(result.errMsg||'');
  const error=new Error(setup?'微信资料服务暂未就绪，请稍后重试':denied?'未授权微信头像昵称，仍可正常游玩':'暂时无法获取微信资料，请重试');
  error.code=setup?'WECHAT_PRIVACY_SETUP_REQUIRED':denied?'WECHAT_USERINFO_NOT_AUTHORIZED':'WECHAT_USERINFO_UNAVAILABLE';
  if(Number.isInteger(errno))error.errno=errno;
  return error;
}
async function prepareWechatUserInfo() {
  if(!native||!wx.createUserInfoButton||!wx.getSetting||!wx.getUserInfo||!wx.login)throw new Error('请在支持此功能的微信版本中获取头像昵称');
  initializeCloud();
  const validSession=wx.checkSession?await new Promise(resolve=>wx.checkSession({success:()=>resolve(true),fail:()=>resolve(false)})):false;
  if(!validSession)await new Promise((resolve,reject)=>wx.login({success:res=>res.code?resolve():reject(new Error('微信登录状态暂未就绪，请重试')),fail:()=>reject(new Error('微信登录状态暂未就绪，请重试'))}));
  const setting=await new Promise((resolve,reject)=>wx.getSetting({success:resolve,fail:()=>reject(new Error('暂时无法读取微信授权状态，请重试'))}));
  if(!setting.authSetting||setting.authSetting['scope.userInfo']!==true)return null;
  return new Promise((resolve,reject)=>wx.getUserInfo({withCredentials:true,lang:'zh_CN',success:res=>{
    if(typeof res.cloudID==='string'&&res.cloudID)resolve({cloudID:res.cloudID});else reject(new Error('微信资料凭证暂未就绪，请重新获取'));
  },fail:error=>reject(userInfoFailure(error))}));
}
function createWechatUserInfoButton(rect,onTap) {
  if(!native||!wx.createUserInfoButton)throw new Error('当前微信版本暂不支持用户信息按钮');
  const style=value=>({left:value.x,top:value.y,width:value.w,height:value.h,lineHeight:value.h,backgroundColor:'rgba(0,0,0,0)',borderWidth:0,color:'#000000',fontSize:16});
  const button=wx.createUserInfoButton({type:'text',text:'',withCredentials:true,lang:'zh_CN',style:style(rect)});
  if(!button)throw new Error('微信用户信息按钮暂未准备好，请重试');
  let destroyed=false;const listener=res=>{if(!destroyed)onTap(res);};button.onTap(listener);
  return{show(){if(!destroyed)button.show();},hide(){if(!destroyed)button.hide();},setRect(value){if(!destroyed)Object.assign(button.style,style(value));},destroy(){if(destroyed)return;destroyed=true;button.offTap(listener);button.destroy();}};
}
function isWechatAvatarUrl(value){return typeof value==='string'&&/^https:\/\/(?:thirdwx|wx)\.qlogo\.cn\/mm(?:open|head)\//.test(value);}
function createAudio(src,volume,loop=false) {
  if(native){const a=wx.createInnerAudioContext();a.src=src;a.volume=volume;a.loop=loop;return a;}
  const a=new Audio(src);a.volume=volume;a.loop=loop;return {play:()=>a.play().catch(()=>{}),stop:()=>{a.pause();a.currentTime=0;},pause:()=>a.pause(),destroy:()=>{a.pause();a.src='';}};
}
module.exports={native,windowInfo,createCanvas,loadImage,read,write,bindInput,onResize,onVisibility,onReconnect,vibrate,callCloud,cloudReady,setPrivacyHandler,authorizePrivacy,openPrivacy,userInfoFailure,prepareWechatUserInfo,createWechatUserInfoButton,isWechatAvatarUrl,createAudio};
