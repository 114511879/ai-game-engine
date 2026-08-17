const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {console, JSON, Math, Date, isFinite, Promise};
sandbox.window = sandbox;
sandbox.AGE = {};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
}

load('evolution/EvolutionPromoter.js');

const A = sandbox.AGE;
const baseline = {meta: {title: 'baseline', game_id: 'game-1'}};
const winnerDsl = {meta: {title: 'winner', game_id: 'game-1'}};
const evaluation = {schema_version: '1.0', status: 'completed', episodes: 1};
const fitnessResult = {schema_version: '2.0', final_fitness: 0.82, confidence: {overall: 0.9}};

async function run() {
  const events = [];
  let committedData = null;
  const store = {
    begin() { events.push('begin'); return {current_version: 'v1'}; },
    commit(data) { committedData = data; events.push('commit:' + data.promoted_version_id); return data; },
    rollback() { events.push('rollback'); }
  };
  const engine = {
    load(dsl) { events.push('load:' + dsl.meta.title); },
    reset() { events.push('reset'); },
    teardown() { events.push('teardown'); }
  };
  const promoter = new A.EvolutionPromoter({
    finalQA: {validate() { events.push('qa'); return {admitted: true, findings: []}; }},
    engine,
    store,
    idFactory() { return 'v4'; }
  });
  const promoted = await promoter.promote({
    run_id: 'run-1',
    game_id: 'game-1',
    baseline: {version_id: 'v1', dsl: baseline},
    winner: {candidate_id: 'g2-c2', dsl: winnerDsl, evaluation, fitness_result: fitnessResult, changes: [{path: 'player.hp'}]}
  });
  assert.strictEqual(promoted.status, 'promoted');
  assert.strictEqual(promoted.promoted_version_id, 'v4');
  assert.deepStrictEqual(events, ['qa', 'begin', 'load:winner', 'commit:v4']);
  assert.strictEqual(committedData.parent_version, 'v1');
  assert.strictEqual(committedData.evaluation, evaluation);
  assert.strictEqual(committedData.fitness, fitnessResult);

  const failedEvents = [];
  const failureStore = {
    begin() { failedEvents.push('begin'); return {current_version: 'v1'}; },
    commit(data) { failedEvents.push('commit:' + data.promoted_version_id); throw new Error('storage failed'); },
    rollback(snapshot) { assert.strictEqual(snapshot.current_version, 'v1'); failedEvents.push('rollback'); }
  };
  const failurePromoter = new A.EvolutionPromoter({
    finalQA: {validate() { failedEvents.push('qa'); return {admitted: true, findings: []}; }},
    engine: {
      load(dsl) { failedEvents.push('load:' + dsl.meta.title); },
      teardown() { failedEvents.push('teardown'); },
      reset() { failedEvents.push('reset'); }
    },
    store: failureStore,
    idFactory() { return 'v4'; }
  });
  const failed = await failurePromoter.promote({
    baseline: {version_id: 'v1', dsl: baseline},
    winner: {candidate_id: 'g2-c2', dsl: winnerDsl, evaluation, fitness_result: fitnessResult}
  });
  assert.strictEqual(failed.status, 'failed');
  assert.strictEqual(failed.promoted_version_id, undefined);
  assert.deepStrictEqual(failedEvents, [
    'qa', 'begin', 'load:winner', 'commit:v4', 'rollback', 'teardown', 'reset', 'load:baseline'
  ]);

  const fallbackEvents = [];
  const fallbackPromoter = new A.EvolutionPromoter({
    finalQA: {
      validate(dsl) {
        fallbackEvents.push('qa:' + dsl.meta.title);
        return {admitted: dsl.meta.title === 'fallback', findings: []};
      }
    },
    engine: {load(dsl) { fallbackEvents.push('load:' + dsl.meta.title); }, reset() {}},
    store: {
      begin() { fallbackEvents.push('begin'); return {}; },
      commit() { fallbackEvents.push('commit'); },
      rollback() { fallbackEvents.push('rollback'); }
    },
    idFactory() { return 'v5'; }
  });
  const fallback = await fallbackPromoter.promote({
    baseline: {version_id: 'v1', dsl: baseline},
    winner: {candidate_id: 'c1', dsl: winnerDsl, evaluation, fitness_result: fitnessResult},
    ranked_candidates: [
      {candidate_id: 'c1', dsl: winnerDsl, evaluation, fitness_result: fitnessResult},
      {candidate_id: 'c2', dsl: {meta: {title: 'fallback'}}, evaluation, fitness_result: fitnessResult}
    ]
  });
  assert.strictEqual(fallback.status, 'promoted');
  assert.strictEqual(fallback.candidate_id, 'c2');
  assert.deepStrictEqual(fallbackEvents, [
    'qa:winner', 'qa:fallback', 'begin', 'load:fallback', 'commit'
  ]);

  let rejectedStoreCalls = 0;
  const rejectedPromoter = new A.EvolutionPromoter({
    finalQA: {validate() { return {admitted: false, findings: [{severity: 'error'}]}; }},
    engine: {load() { throw new Error('must not load'); }},
    store: {begin() { rejectedStoreCalls++; }},
    idFactory() { throw new Error('must not allocate'); }
  });
  const rejected = await rejectedPromoter.promote({
    baseline: {version_id: 'v1', dsl: baseline},
    winner: {candidate_id: 'c1', dsl: winnerDsl, evaluation, fitness_result: fitnessResult}
  });
  assert.strictEqual(rejected.status, 'rejected');
  assert.strictEqual(rejected.reason, 'winner_qa_rejected');
  assert.strictEqual(rejectedStoreCalls, 0);

  console.log('evolution promotion v3 tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
