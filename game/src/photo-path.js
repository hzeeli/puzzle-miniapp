const PHOTOS_PER_PACK=12;
function photoPath(id){
  const match=/^photo-(\d+)$/.exec(id),number=match?Number(match[1]):0;
  if(!Number.isSafeInteger(number)||number<1||id!=='photo-'+String(number).padStart(2,'0')){
    throw new Error('无效的照片编号：'+id);
  }
  const volume=Math.ceil(number/PHOTOS_PER_PACK);
  if(volume===1)return{pack:null,src:'assets/photos/'+id+'.jpg'};
  const pack='album-'+String(volume).padStart(2,'0');
  return{pack,src:'packs/'+pack+'/'+id+'.jpg'};
}
module.exports={photoPath};
