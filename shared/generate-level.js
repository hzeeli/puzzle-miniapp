'use strict';

const {getLevel} = require('./levels');
const Rules = require('./rules');

const GENERATOR_VERSION = 1;
const plainRefill = {...getLevel(8,4),id:13,pinnedTokens:[]};
function getTemplate(id){
  return id===13?plainRefill:getLevel(id,4);
}

function randomStream(seed) {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  return size => {
    state = (state + 0x6d2b79f5) >>> 0;
    let bits = Math.imul(state ^ (state >>> 15), state | 1);
    bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61);
    return Math.floor(((bits ^ (bits >>> 14)) >>> 0) / 4294967296 * size);
  };
}

function choosePhotos(template, seed, photoIds, photoPool) {
  if ((photoIds === undefined) === (photoPool === undefined)) throw new TypeError('必须指定照片池或已选照片');
  const source = photoIds === undefined ? photoPool : photoIds;
  const count = template.photoIds.length;
  if (!Array.isArray(source) || source.some(id => typeof id !== 'string' || !id.trim()) ||
      source.length < count || new Set(source).size !== source.length) throw new TypeError('照片编号须唯一，且数量须满足模板');
  const ids = source.slice();
  if (photoIds !== undefined) {
    if (ids.length !== count) throw new TypeError('已选照片数与模板不一致');
    return ids;
  }
  ids.sort();
  const random = randomStream(seed + '|photos');
  for (let i = 0; i < count; i++) {
    const j = i + random(ids.length - i);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0,count);
}

function reversibleSwap(state, from, to, seen) {
  const forward = Rules.applyMove(state,from,to);
  if (!forward.ok || forward.events.length !== 1 || seen.has(forward.state.board.join(','))) return null;
  const reverse = Rules.applyMove(forward.state,to,from);
  if (!reverse.ok || reverse.events.length !== 1 || !reverse.state.board.every((t,i) => t === state.board[i])) return null;
  return forward.state;
}

function deal(template, seed) {
  const random = randomStream(seed + '|board');
  let state = Rules.createState(template), steps = 0;
  const seen = new Set([state.board.join(',')]);
  const count = 3 + random(5);
  while (steps < count) {
    let next = null;
    // 与 256 互质的步长保证走遍全部有向落点；无新交换时回退到最后一个已验证的局面。
    const start = random(256), stride = 2 * random(128) + 1;
    for (let offset = 0; offset < 256 && !next; offset++) {
      const pair = (start + offset * stride) % 256;
      next = reversibleSwap(state,Math.floor(pair/16),pair%16,seen);
    }
    if (!next) break;
    state = next;
    seen.add(state.board.join(','));
    steps++;
  }
  return {board:state.board,steps};
}

function generateLevel({seed, templateId, photoPool, photoIds, generatorVersion = GENERATOR_VERSION}) {
  if (generatorVersion !== GENERATOR_VERSION) throw new RangeError('未知的冲印生成版本');
  if (!(typeof seed === 'string' && seed.length > 0) && !Number.isSafeInteger(seed)) throw new TypeError('种子须为非空文本或安全整数');
  const template = getTemplate(templateId);
  if (!template) throw new RangeError('无效的冲印关卡模板');
  const key = String(seed), stream = generatorVersion + '|' + templateId + '|' + key;
  const chosen = choosePhotos(template,stream,photoIds,photoPool);
  const {board,steps} = deal(template,stream);
  let initialEdges = 0;
  for (let i = 0; i < 16; i++) {
    for (const j of [i+1,i+4]) if (j<16 && Rules.joined(board,i,j,template.hiddenTokens)) initialEdges++;
  }
  // 每次交换验证了逆操作。倒序走回模板后接其固定解，即得此布局的一条完整解。
  return {
    ...template, seed:key, templateId, generatorVersion, board, photoIds:chosen,
    featuredPhotoId:chosen[template.photoIds.indexOf(template.featuredPhotoId)],
    queues:template.queues.map(q => q.slice()),
    hiddenTokens:template.hiddenTokens.slice(), pinnedTokens:template.pinnedTokens.slice(),
    goldMoves:template.goldMoves+steps, parMoves:template.parMoves+steps,
    difficulty:{
      rank:template.difficulty.rank, initialEdges, initialAvailablePhotos:template.difficulty.initialAvailablePhotos,
      reserveCount:template.difficulty.reserveCount, verifiedMoves:template.difficulty.verifiedMoves+steps
    }
  };
}

module.exports = {GENERATOR_VERSION, generateLevel, getTemplate};
