const platform=require('./platform');
const {photoPath}=require('./photo-path');
const UI_ASSETS={
  'garden-badges':'assets/ui/garden-badges.jpg',
  'result-stars':'assets/ui/result-stars.png',
  'result-ribbon':'assets/ui/result-ribbon.png',
  'garden':'assets/ui/garden.jpg',

  'brand-logo':'assets/ui/brand-logo.png',
  'controls-atlas':'assets/ui/controls-atlas.png',
};
// 512×768 相片展开约占 1.5 MiB，保留两卷可同时容纳当前棋盘及相册可见行。
const PHOTO_CACHE_LIMIT=24;
class Assets {
  constructor(){
    this.ui=new Map();this.photos=new Map();this.pending=new Map();this.packs=new Map();
  }
  async loadPack(name){
    if(!name||!platform.native||typeof wx.loadSubpackage!=='function')return;
    if(!this.packs.has(name)){
      const pending=new Promise((resolve,reject)=>{
        wx.loadSubpackage({name,success:resolve,fail:()=>reject(new Error('相册下载失败，请重试：'+name))});
      }).catch(error=>{this.packs.delete(name);throw error;});
      this.packs.set(name,pending);
    }
    return this.packs.get(name);
  }
  get(id){
    if(UI_ASSETS[id])return this.ui.get(id);
    const image=this.photos.get(id);
    if(image){this.photos.delete(id);this.photos.set(id,image);}
    return image;
  }
  load(id){
    const cached=this.get(id);
    if(cached)return Promise.resolve(cached);
    if(!this.pending.has(id)){
      const uiPath=UI_ASSETS[id],{pack,src}=uiPath?{pack:null,src:uiPath}:photoPath(id);
      const pending=this.loadPack(pack).then(()=>platform.loadImage(src)).then(image=>{
        const cache=uiPath?this.ui:this.photos;
        cache.set(id,image);
        if(!uiPath&&cache.size>PHOTO_CACHE_LIMIT)cache.delete(cache.keys().next().value);
        return image;
      }).finally(()=>this.pending.delete(id));
      this.pending.set(id,pending);
    }
    return this.pending.get(id);
  }
  async loadAll(ids,onProgress=()=>{}){
    const unique=[...new Set(ids)];let done=0;
    await Promise.all(unique.map(id=>this.load(id).then(()=>onProgress(++done/unique.length))));
  }
}
module.exports=Assets;
