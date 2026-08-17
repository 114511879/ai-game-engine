const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {console, JSON, Math, Date, Promise, isFinite};
sandbox.window = sandbox;
sandbox.AGE = {setStatus() {}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'ai/director/GameDirector.js'), 'utf8'), sandbox, {filename: 'GameDirector.js'});

const A = sandbox.AGE;
const baselineDsl = {meta: {title: 'baseline', game_id: 'game-1', game_type: 'runner'}, player: {hp: 3}};
const winnerDsl = {meta: {title: 'winner', game_id: 'game-1', game_type: 'runner'}, player: {hp: 5}};
const fitness = {schema_version: '2.0', final_fitness: 0.7, confidence: {overall: 0.9}};
const qa = {admitted: true, semantic_qa: {status: 'passed', optimization_scope_hash: 'ga3:x'}};

async function run() {
  let runnerCalls = 0;
  let promoterCalls = 0;
  const runner = {
    async runEvolution(receivedDsl, options) {
      runnerCalls++;
      assert.strictEqual(receivedDsl, baselineDsl);
      assert.strictEqual(options.random_seed, 'run-1');
      return {
        schema_version: '3.0', status: 'completed', stopped_reason: 'max_generations',
        baseline: {version_id: 'v1', fitness: 0.7},
        best_candidate: {
          candidate_id: 'g2-c2', dsl: winnerDsl, fitness: 0.82,
          evaluation: {status: 'completed'}, fitness_result: {schema_version: '2.0', final_fitness: 0.82}
        },
        promotion: {status: 'not_requested'}
      };
    }
  };
  const promoter = {
    async promote(input) {
      promoterCalls++;
      assert.strictEqual(input.baseline.version_id, 'v1');
      assert.strictEqual(input.winner.candidate_id, 'g2-c2');
      return {status: 'promoted', promoted_version_id: 'v4', candidate_id: 'g2-c2', dsl: winnerDsl};
    }
  };
  const director = new A.GameDirector({evolutionRunner: runner, evolutionPromoter: promoter});

  const disabled = await director.runEvolution(baselineDsl, {enabled: false});
  assert.strictEqual(disabled.promotion.status, 'not_requested');
  assert.strictEqual(disabled.dsl, baselineDsl);
  assert.strictEqual(runnerCalls, 0);
  assert.strictEqual(promoterCalls, 0);

  let dslOptInCalls = 0;
  const dslOptInDirector = new A.GameDirector({
    evolutionRunner: {async runEvolution(receivedDsl) {
      dslOptInCalls++;
      assert.strictEqual(receivedDsl.evolution.enabled, true);
      return {status: 'completed', stopped_reason: 'max_generations', best_candidate: null, promotion: {status: 'not_requested'}};
    }}
  });
  const dslOptIn = Object.assign({}, baselineDsl, {evolution: {enabled: true, profile: 'default_ga_v3'}});
  await dslOptInDirector.runEvolution(dslOptIn, {});
  assert.strictEqual(dslOptInCalls, 1, 'DSL evolution.enabled must explicitly opt in to EvolutionRunner');

  const result = await director.runEvolution(baselineDsl, {
    enabled: true,
    baseline_version: 'v1',
    baseline_fitness: fitness,
    baseline_qa: qa,
    random_seed: 'run-1',
    intent: {game_type: 'runner'},
    blueprint: {levels: []}
  });
  assert.strictEqual(runnerCalls, 1);
  assert.strictEqual(promoterCalls, 1);
  assert.strictEqual(result.promotion.status, 'promoted');
  assert.strictEqual(result.promotion.promoted_version_id, 'v4');
  assert.strictEqual(result.dsl.meta.title, 'winner');

  let cancelPromotions = 0;
  const cancelledDirector = new A.GameDirector({
    evolutionRunner: {async runEvolution() {
      return {status: 'completed', stopped_reason: 'cancelled', best_candidate: {dsl: winnerDsl}, promotion: {status: 'not_requested'}};
    }},
    evolutionPromoter: {promote() { cancelPromotions++; }}
  });
  const cancelled = await cancelledDirector.runEvolution(baselineDsl, {enabled: true});
  assert.strictEqual(cancelled.stopped_reason, 'cancelled');
  assert.strictEqual(cancelled.promotion.status, 'not_requested');
  assert.strictEqual(cancelled.dsl, baselineDsl);
  assert.strictEqual(cancelPromotions, 0);

  let rejectedPromotions = 0;
  const rejectedDirector = new A.GameDirector({
    evolutionRunner: {async runEvolution() {
      return {status: 'rejected', stopped_reason: 'no_valid_genes', best_candidate: null, promotion: {status: 'not_requested'}};
    }},
    evolutionPromoter: {promote() { rejectedPromotions++; }}
  });
  const rejected = await rejectedDirector.runEvolution(baselineDsl, {enabled: true});
  assert.strictEqual(rejected.status, 'rejected');
  assert.strictEqual(rejected.dsl, baselineDsl);
  assert.strictEqual(rejectedPromotions, 0);

  const failedPromotionDirector = new A.GameDirector({
    evolutionRunner: {async runEvolution() {
      return {status: 'completed', stopped_reason: 'max_generations', best_candidate: {candidate_id: 'c1', dsl: winnerDsl}, promotion: {status: 'not_requested'}};
    }},
    evolutionPromoter: {async promote() { return {status: 'failed', reason: 'engine_load_failed'}; }}
  });
  const failedPromotion = await failedPromotionDirector.runEvolution(baselineDsl, {enabled: true, baseline_version: 'v1'});
  assert.strictEqual(failedPromotion.promotion.status, 'failed');
  assert.strictEqual(failedPromotion.dsl, baselineDsl);
  assert.strictEqual(failedPromotion.promotion.promoted_version_id, undefined);

  console.log('evolution director v3 tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
