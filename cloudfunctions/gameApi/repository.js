'use strict';

function createRepository(db) {
  function documents(source) {
    return {
      async get(collection, id) {
        const result = await source.collection(collection).doc(id).get();
        return result.data || null;
      },
      async put(collection, id, value) {
        const { _id, ...data } = value;
        await source.collection(collection).doc(id).set({ data });
      },
      async remove(collection, id) {
        await source.collection(collection).doc(id).remove();
      },
    };
  }
  const direct = documents(db);
  return {
    ...direct,
    transaction: (work) => db.runTransaction((tx) => work(documents(tx))),
    async listBest(owner, activeLevels) {
      const _ = db.command;
      const result = await db.collection('bestScores').where(_.and([{ owner }, _.or(activeLevels)])).limit(activeLevels.length).get();
      return result.data;
    },
    async topScores(levelId, levelVersion) {
      const result = await db.collection('bestScores').where({ levelId, levelVersion })
        .orderBy('durationMs', 'asc').orderBy('achievedAt', 'asc').orderBy('playerId', 'asc')
        .limit(10).get();
      return result.data;
    },
    async rankOf(score) {
      const _ = db.command;
      const before = _.or([
        { durationMs: _.lt(score.durationMs) },
        { durationMs: score.durationMs, achievedAt: _.lt(score.achievedAt) },
        { durationMs: score.durationMs, achievedAt: score.achievedAt, playerId: _.lt(score.playerId) },
      ]);
      const result = await db.collection('bestScores').where(_.and([
        { levelId: score.levelId, levelVersion: score.levelVersion }, before,
      ])).count();
      return result.total + 1;
    },
    async removeOwned(collection, owner, playerId) {
      for (;;) {
        const result = await db.collection(collection).where({ owner, playerId }).remove();
        if (result.stats.removed === 0) return;
      }
    },
  };
}
module.exports = { createRepository };
