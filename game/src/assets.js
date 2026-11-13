const platform=require('./platform');
const UI_ASSETS={
  'stage-background':'assets/ui/stage-background.jpg',
  'brand-logo':'assets/ui/brand-logo.png',
  'card-back':'assets/ui/card-back.png',
  'primary-button':'assets/ui/primary-button.png',
  'controls-atlas':'assets/ui/controls-atlas.png',
  'hint-hand':'assets/ui/hint-hand.png'
};
class Assets {
  constructor(){this.images=new Map();this.pending=new Map();}
  loadSource(id,src){if(this.images.has(id))return Promise.resolve(this.images.get(id));if(this.pending.has(id))return this.pending.get(id);const pending=platform.loadImage(src).then(image=>{this.images.set(id,image);this.pending.delete(id);return image;},error=>{this.pending.delete(id);throw error;});this.pending.set(id,pending);return pending;}
  load(id){return this.loadSource(id,UI_ASSETS[id]||'assets/photos/'+id+'.jpg');}
  async loadAll(ids,onProgress=()=>{}){const unique=[...new Set(ids)];let done=0;await Promise.all(unique.map(id=>this.load(id).then(()=>onProgress(++done/unique.length))));}
  get(id){return this.images.get(id);}
}
module.exports=Assets;
