const names=['花园里的小狗','向日葵的晴天','咖啡手记','枝头小熊猫','港湾来信','草莓奶油','湖畔木屋','猫的午后','郁金香','早餐时分','暖橘色的梦','周末野餐'];
const photos=names.map((name,i)=>({id:'photo-'+String(i+1).padStart(2,'0'),name,theme:'初见花园'}))
  .concat(require('../../shared/photo-catalog.json'));
const photoFocus={'photo-01':.30,'photo-02':.33,'photo-08':.35,'photo-11':.34};
function photoName(id){return photos.find(p=>p.id===id)?.name||'';}
module.exports={photos,photoName,photoFocus};
