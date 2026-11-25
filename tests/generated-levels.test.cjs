'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {generateLevel,GENERATOR_VERSION} = require('../shared/generate-level');
const {levels,getLevel} = require('../shared/levels');
const R = require('../shared/rules');
const {solve} = require('../scripts/generate-levels.cjs');
const pool = Array.from({length:180},(_,i) => 'collection-' + (i+1));

test('任意照片池可选片，同一版本、种子与已选照片能独立还原关卡和轨迹', () => {
  const args={templateId:11,seed:'相册 / 2026-11-23',photoPool:pool};
  const level=generateLevel(args);
  assert.deepEqual(generateLevel({...args,photoPool:pool.slice().reverse()}),level);
  const {templateId,seed,photoIds,generatorVersion}=level;
  const restored=generateLevel({templateId,seed,photoIds,generatorVersion});
  assert.deepEqual(restored,level);
  assert.equal(level.generatorVersion,GENERATOR_VERSION);
  assert.equal(level.featuredPhotoId,photoIds[getLevel(templateId).photoIds.indexOf(getLevel(templateId).featuredPhotoId)]);
  const moves=solve(R.createState(level));
  assert.ok(moves);
  assert.deepEqual(R.replay(level,moves),R.replay(restored,moves));
  assert.ok(R.replay(restored,moves).solved);
});

test('第一版生成协议的已存种子在更新后仍还原同一暗房双钉局', () => {
  const saved={generatorVersion:1,templateId:12,seed:'参考底片',photoIds:Array.from({length:8},(_,i)=>'A'+i)};
  const level=generateLevel(saved);
  assert.deepEqual(level.board,[3,20,0,16,19,11,14,21,15,8,5,6,1,2,4,7]);
  assert.deepEqual(level.hiddenTokens,[6,19,8,1]);
  assert.deepEqual(level.pinnedTokens,[7,0]);
  assert.deepEqual(level.queues,[[9,10,24,27,26,25],[12,13,29,28,30,31],[18,17],[23,22]]);
  assert.ok(R.replay(level,solve(R.createState(level))).solved);
});

test('每类模板不同种子产生不同实际局面，并保留全部机械约束和可继续完成的提示', () => {
  for (const template of levels) {
    const boards=new Set(), photoSets=new Set();
    for(let seed=0;seed<12;seed++) {
      const level=generateLevel({templateId:template.id,seed,photoPool:pool});
      const state=R.createState(level);
      assert.equal(level.photoIds.length,template.photoIds.length);
      assert.equal(new Set(level.photoIds).size,level.photoIds.length);
      assert.ok(level.photoIds.every(id => pool.includes(id)));
      assert.ok(level.photoIds.includes(level.featuredPhotoId));
      assert.deepEqual(level.queues,template.queues);
      assert.deepEqual(level.pinnedTokens,template.pinnedTokens);
      assert.deepEqual(level.hiddenTokens,template.hiddenTokens);
      assert.ok(R.groups(state.board,state.hidden).every(g=>g.length<4));
      for(const token of state.pinned)assert.equal(state.board.indexOf(token),template.board.indexOf(token));
      assert.notDeepEqual(state.board,template.board);
      boards.add(state.board.join(','));photoSets.add(level.photoIds.slice().sort().join(','));
      let current=state,random=seed+29;const moves=[];
      const cell=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random>>>28;};
      for(let i=0;i<28&&!R.isSolved(current);i++){
        const from=cell(),to=cell(),result=R.applyMove(current,from,to);
        if(result.ok){moves.push({from,to});current=result.state;}
      }
      const recovery=solve(current);
      assert.ok(recovery,'扰动后的提示应可恢复：'+template.id+'/'+seed);
      assert.equal(R.replay(level,moves.concat(recovery)).solved,true);
    }
    assert.equal(boards.size,12);assert.equal(photoSets.size,12);
  }
});

test('生成结果与模板独立；无效种子、模板、配置版本与照片不足时拒绝开局', () => {
  const template=getLevel(12),original=structuredClone(template);
  const args={templateId:12,seed:34,photoPool:pool};
  const level=generateLevel(args);
  level.board[0]=-1;level.hiddenTokens.length=0;level.pinnedTokens.length=0;
  level.queues[0].length=0;level.photoIds.length=0;
  assert.deepEqual(template,original);
  assert.equal(pool.length,180);
  for(const patch of [{seed:''},{seed:NaN},{templateId:0},{generatorVersion:0},
    {photoPool:[]},{photoPool:Array(8).fill('一幅照片')},{photoIds:template.photoIds},
    {photoPool:undefined,photoIds:['一幅照片']}])assert.throws(()=>generateLevel({...args,...patch}));
});
