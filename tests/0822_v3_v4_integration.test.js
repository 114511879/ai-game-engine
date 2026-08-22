const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {console, JSON, Math, Date, isFinite, TextEncoder, AbortController, setTimeout, clearTimeout, Promise};
sandbox.window = sandbox;
sandbox.AGE = {};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
}

load('ai/protocols/AgentProtocols.js');
load('fitness/types.js');
load('evolution/CandidateEvaluator.js');

const A = sandbox.AGE;
const dsl = {meta: {game_id: 'g', game_type: 'runner'}, player: {hp: 3}};

function fitness() {
  return A.FitnessTypes.fitnessResult({
    fitness_id: 'f', game_id: 'g', version_id: 'candidate',
    scores: {fun_proxy: 0.7, playability: 0.8, balance: 0.8, novelty: 0.5, stability: 0.8},
    weights: {fun_proxy: 0.3, playability: 0.2, balance: 0.2, novelty: 0.1, stability: 0.2},
    final_fitness: 0.75, confidence: {overall: 0.8}
  });
}

async function run() {
  const calls = [];
  let playtestCalls = 0;
  const dependencies = {
    finalQA: {validate() { calls.push('qa'); return {admitted: true, findings: []}; }},
    engine: {
      reset() { calls.push('reset'); },
      load() { calls.push('load'); },
      teardown() { calls.push('teardown'); }
    },
    simulation: {
      async run() {
        calls.push('simulation');
        return A.AgentProtocols.evaluationResult({simulation_id: 's', episodes: 1, metrics: {completion_rate: 0.7}, simulation_deterministic: true});
      }
    },
    fitnessFactory() { return {calculateFitness() { calls.push('fitness'); return fitness(); }}; },
    playtest: {
      async evaluate() {
        playtestCalls++;
        calls.push('playtest');
        return {enabled: true, status: 'incomplete', reason: 'timeout', findings: [{bug_fingerprint: 'bug:v4'}]};
      }
    }
  };
  const evaluator = new A.CandidateEvaluator(dependencies);
  const disabled = await evaluator.evaluate(dsl, {candidate_seed: 'seed-1'});
  assert.strictEqual(disabled.status, 'evaluated');
  assert.strictEqual(disabled.fitness.final_fitness, 0.75);
  assert.strictEqual(disabled.playtest, undefined);
  assert.strictEqual(playtestCalls, 0);

  calls.length = 0;
  const enabled = await evaluator.evaluate(dsl, {candidate_seed: 'seed-1', playtest_enabled: true, playtest_options: {policy_version: 'pt-v4-1'}});
  assert.strictEqual(enabled.status, 'evaluated');
  assert.strictEqual(enabled.fitness.final_fitness, 0.75);
  assert.strictEqual(enabled.playtest.status, 'incomplete');
  assert(!((enabled.evaluation.bugs || []).some(bug => bug.bug_fingerprint === 'bug:v4')), 'V4 findings must not enter V3 EvaluationResult.bugs');
  assert.deepStrictEqual(calls, ['qa', 'reset', 'load', 'simulation', 'fitness', 'teardown', 'reset', 'playtest', 'teardown', 'reset']);
  assert.strictEqual(playtestCalls, 1);

  const rejected = new A.CandidateEvaluator(Object.assign({}, dependencies, {
    finalQA: {validate() { return {admitted: false, findings: [{severity: 'error'}]}; }}
  }));
  const rejectedResult = await rejected.evaluate(dsl, {playtest_enabled: true});
  assert.strictEqual(rejectedResult.status, 'qa_rejected');
  assert.strictEqual(playtestCalls, 1, 'QA-rejected candidates must not call V4');

  console.log('v3/v4 integration tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
