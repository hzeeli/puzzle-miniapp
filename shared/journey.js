'use strict';

const {levels}=require('./levels');
const {generateLevel,GENERATOR_VERSION,getTemplate}=require('./generate-level');
const mature=require('./mature-levels.json');

// 每格依次是规则模板、局面种子变体、已重放的参考步数。null 采用手工棋面用来教新机制。
const FIRST_RELEASE=[
  [[1,null,2], [2,null,5], [2,3,6], [2,0,6], [3,null,8], [2,0,6], [3,3,8], [2,5,6], [3,0,8], [3,7,8]],
  [[3,0,8], [5,null,6], [5,4,8], [2,0,7], [5,0,9], [3,2,8], [5,4,9], [3,1,8], [5,2,9], [5,14,10]],
  [[13,0,10], [13,1,10], [13,2,11], [13,1,11], [13,1,12], [4,3,14], [4,14,14], [13,1,12], [4,4,15], [4,4,15]],
  [[8,null,11], [8,1,12], [13,6,12], [8,5,13], [4,8,15], [8,0,13], [4,0,16], [8,5,14], [4,6,16], [8,35,15]],
  [[7,null,15], [7,1,15], [8,2,13], [7,1,16], [4,3,15], [6,2,17], [7,2,16], [8,0,13], [6,0,18], [7,0,17]],
  [[9,null,18], [9,1,17], [8,2,13], [9,2,18], [7,1,16], [9,0,18], [6,0,17], [8,0,14], [9,1,19], [9,1,18]],
  [[10,null,20], [9,1,18], [8,12,14], [10,1,19], [7,5,16], [10,4,20], [9,12,18], [8,0,14], [10,4,20], [10,4,20]],
  [[11,null,21], [11,0,20], [8,7,14], [11,0,20], [9,5,18], [10,5,19], [11,20,21], [8,16,14], [11,8,21], [11,1,21]],
  [[12,0,18], [10,0,19], [9,0,17], [12,4,20], [11,6,21], [10,0,19], [12,5,23], [8,5,14], [11,0,20], [12,10,21]],
  [[10,0,19], [11,0,20], [9,0,18], [12,10,21], [12,8,23], [11,0,20], [10,1,20], [9,10,17], [12,8,22], [12,3,21]]
];
const firstDesigns=FIRST_RELEASE.flat();
const FIRST_RELEASE_COUNT=firstDesigns.length;
const STORY_VERSION=3;
const LEGACY_TEMPLATES=[
  1,2,3,2,4,3,2,4,3,4, 5,5,6,5,7,6,5,7,6,7,
  8,8,4,8,9,8,7,9,8,9, 6,7,9,6,10,7,9,10,8,10,
  11,8,11,9,11,10,12,9,11,12, 7,9,10,11,8,12,10,11,9,12
];
const counts=[0,...levels.map(level=>level.photoIds.length),getTemplate(13).photoIds.length];
function prefixSlots(templates){
  const slots=[0];
  for(const id of templates)slots.push(slots[slots.length-1]+counts[id]);
  return slots;
}
const firstSlots=prefixSlots(firstDesigns.map(([template])=>template));
const lateSlots=prefixSlots(mature.map(row=>row.templateId));
const legacySlots=prefixSlots(LEGACY_TEMPLATES);

// 九个题材交错，36 张一组，仅在组内打乱同题材的四张照片，跨轮也至少隔 72 个出场位。
const themes=[1,2,3,0,4,5,6,7,8];
const photos=Array.from({length:108},(_,i)=>
  'photo-'+String(themes[i%9]*12+Math.floor(i/9)+1).padStart(2,'0'));
function blockOrder(block,cycle){
  const ids=photos.slice(block*36,(block+1)*36);
  if(cycle===0)return ids;
  let key=2166136261;
  for(const ch of 'story|'+cycle+'|'+block)key=Math.imul(key^ch.charCodeAt(0),16777619);
  for(let theme=0;theme<9;theme++){
    for(let row=3;row>0;row--){
      key=(Math.imul(key,1664525)+1013904223)>>>0;
      const i=theme+row*9,j=theme+Math.floor(key/4294967296*(row+1))*9;
      [ids[i],ids[j]]=[ids[j],ids[i]];
    }
  }
  return ids;
}
function drawPhotos(slot,count){
  const selected=[];
  while(selected.length<count){
    const position=slot%108,start=position%36;
    const block=blockOrder(Math.floor(position/36),Math.floor(slot/108));
    const batch=block.slice(start,start+count-selected.length);
    selected.push(...batch);
    slot+=batch.length;
  }
  return selected;
}
function dealAt(index,version){
  if(!Number.isSafeInteger(index)||index<1||!Number.isSafeInteger(index*8))throw new RangeError('关号无效');
  const i=index-1;
  if(version===1){
    if(i>=LEGACY_TEMPLATES.length)throw new RangeError('旧存档关号无效');
    return {templateId:LEGACY_TEMPLATES[i],slot:legacySlots[i],seed:'story/'+index,manual:index<=3};
  }
  if(version!==STORY_VERSION)throw new RangeError('不支持的关卡编排版本');
  if(i<FIRST_RELEASE_COUNT){
    const [templateId,variant,referenceMoves]=firstDesigns[i];
    return {templateId,slot:firstSlots[i],seed:'main3/'+index+'/'+(variant??0),manual:variant===null,referenceMoves};
  }
  const offset=index-FIRST_RELEASE_COUNT-1;
  const cycle=Math.floor(offset/mature.length),position=offset%mature.length;
  const row=mature[position],size=row.moves.length,epoch=Math.floor(cycle/size);
  // 48 种变体逐一取遍。轮组边界从奇数序号跳到偶数序号，相邻两轮不会撞上同一道棋面。
  const strides=[1,5,7,11,13,17,19,23];
  const variant=((cycle%size)*strides[(epoch+position)%strides.length]+2*((epoch+position)%size))%size;
  const slot=firstSlots[FIRST_RELEASE_COUNT]+cycle*lateSlots[mature.length]+lateSlots[position];
  return {templateId:row.templateId,slot,seed:'platform3/'+position+'/'+variant,manual:false,referenceMoves:row.moves[variant]};
}
function storySession(index,version=STORY_VERSION){
  const {templateId,slot,seed}=dealAt(index,version);
  return {mode:'story',version,generatorVersion:GENERATOR_VERSION,index,templateId,seed,photoIds:drawPhotos(slot,counts[templateId])};
}
function buildLevel(session){
  if(!session||session.mode!=='story'||session.generatorVersion!==GENERATOR_VERSION)throw new RangeError('无效的闯关存档');
  const {index,version,templateId,seed,photoIds}=session;
  const deal=dealAt(index,version);
  if(deal.templateId!==templateId||deal.seed!==seed||!Array.isArray(photoIds)||photoIds.length!==counts[templateId]||
     new Set(photoIds).size!==photoIds.length||!photoIds.every(id=>photos.includes(id)))throw new RangeError('关卡存档与编排不一致');
  const generated=generateLevel({templateId,seed,photoIds,generatorVersion:session.generatorVersion});
  if(deal.manual){
    const template=getTemplate(templateId);
    generated.board=template.board.slice();
    generated.goldMoves=template.goldMoves;
    generated.parMoves=template.parMoves;
    generated.difficulty={...template.difficulty};
  }
  if(version===STORY_VERSION){
    const budget=deal.referenceMoves;
    generated.goldMoves=Math.ceil(budget*1.2);
    generated.parMoves=Math.ceil(budget*1.6);
    generated.difficulty.verifiedMoves=budget;
  }
  const description=generated.pinnedTokens.length?'围着雏菊花扣拼齐照片，花扣就会松开':
    generated.hiddenTokens.length?'移动云片，或在它旁边接合相纸以拂开晨雾':
    generated.queues.some(queue=>queue.length)?'拼好照片后，上方明信片会落到空位':'拖动碎片或整组相纸，拼好每一张照片';
  return {...generated,id:index,version:5,title:'第 '+index+' 关',description,session:{...session,photoIds:photoIds.slice()}};
}
module.exports={FIRST_RELEASE_COUNT,STORY_VERSION,storySession,buildLevel};
