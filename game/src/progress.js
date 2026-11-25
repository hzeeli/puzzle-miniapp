function migrate(data){
  data.settings=Object.assign({sound:true,music:true,haptic:true,reduceMotion:false},data.settings);
  data.schemaVersion=3;
  return data;
}
module.exports={migrate};
