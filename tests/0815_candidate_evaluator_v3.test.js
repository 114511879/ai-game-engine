const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {
  console,
  JSON,
  Math,
  Date,
  isFinite,
  TextEncoder,
  AbortController,
  setTimeout,
  clearTimeout,
  Promise
};
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
const validDsl = {meta: {game_type: 'runner', game_id: 'g'}, player: {hp: 8}};
const intent = {game_type: 'runner'};
const blueprint = {levels: []};

function fitnessResult(value) {
  return A.FitnessTypes.fitnessResult({
    fitness_id: 'f',
    game_id: 'g',
    version_id: 'candidate',
    scores: {fun_proxy: 0.7, playability: 0.8, balance: 0.8, novelty: 0.5, stability: 0.8},
    weights: {fun_proxy: 0.3, playability: 0.2, balance: 0.2, novelty: 0.1, stability: 0.2},
    final_fitness: value,
    confidence: {overall: 0.8}
  });
}

async function run() {
  const calls = [];
  const evaluator = new A.CandidateEvaluator({
    finalQA: {validate() { calls.push('qa'); return {admitted: true, findings: [], structural: {valid: true}}; }},
    engine: {
      reset() { calls.push('reset'); },
      load() { calls.push('load'); },
      teardown() { calls.push('teardown'); }
    },
    simulation: {
      async run(_engine, options) {
        calls.push('simulation:' + options.seed);
        return A.AgentProtocols.evaluationResult({
          simulation_id: 's',
          persona: 'new_player',
          episodes: 1,
          metrics: {completion_rate: 0.7, death_rate: 0.3, coverage: 0.8, engagement_proxy: 7},
          simulation_deterministic: true
        });
      }
    },
    fitnessFactory() {
      return {calculateFitness() { calls.push('fitness'); return fitnessResult(0.75); }};
    }
  });
  const result = await evaluator.evaluate(validDsl, {
    candidate_seed: 'run:g0:c1',
    intent,
    blueprint,
    optimization_scope_hash: 'ga3:x',
    persona: 'new_player',
    episodes: 1,
    timeout_ms: 1000,
    fitness_profile: 'default_v2',
    deterministic: true
  });
  assert.strictEqual(result.status, 'evaluated');
  assert.strictEqual(result.fitness.final_fitness, 0.75);
  assert.strictEqual(result.simulation_deterministic, true);
  assert.deepStrictEqual(calls, ['qa', 'reset', 'load', 'simulation:run:g0:c1', 'fitness', 'teardown', 'reset']);

  let simulationCalls = 0;
  const rejected = new A.CandidateEvaluator({
    finalQA: {validate() { return {admitted: false, findings: [{severity: 'error'}]}; }},
    engine: {reset() { throw new Error('engine must not run'); }, load() {}, teardown() {}},
    simulation: {run() { simulationCalls++; }},
    fitnessFactory() { throw new Error('fitness must not run'); }
  });
  const rejectedResult = await rejected.evaluate(validDsl, {intent, blueprint});
  assert.strictEqual(rejectedResult.status, 'qa_rejected');
  assert.strictEqual(simulationCalls, 0);

  let abortQaCalls = 0;
  const externallyCancelled = new A.CandidateEvaluator({
    finalQA: {validate() { abortQaCalls++; return {admitted: true}; }},
    engine: {},
    simulation: {},
    fitnessFactory() {}
  });
  const cancelledResult = await externallyCancelled.evaluate(validDsl, {signal: {aborted: true}});
  assert.strictEqual(cancelledResult.status, 'cancelled');
  assert.strictEqual(abortQaCalls, 0);

  const duringQaController = new AbortController();
  let postQaEngineCalls = 0;
  const cancelledAfterQa = new A.CandidateEvaluator({
    finalQA: {validate() { duringQaController.abort(); return {admitted: true, findings: []}; }},
    engine: {reset() { postQaEngineCalls++; }, load() { postQaEngineCalls++; }, teardown() { postQaEngineCalls++; }},
    simulation: {run() { throw new Error('simulation must not run'); }},
    fitnessFactory() { throw new Error('fitness must not run'); }
  });
  const cancelledAfterQaResult = await cancelledAfterQa.evaluate(validDsl, {signal: duringQaController.signal});
  assert.strictEqual(cancelledAfterQaResult.status, 'cancelled');
  assert.strictEqual(postQaEngineCalls, 0, 'abort after QA must prevent Engine admission');

  const timeoutCalls = [];
  const timed = new A.CandidateEvaluator({
    finalQA: {validate() { timeoutCalls.push('qa'); return {admitted: true, findings: []}; }},
    engine: {
      reset() { timeoutCalls.push('reset'); },
      load() { timeoutCalls.push('load'); },
      teardown() { timeoutCalls.push('teardown'); }
    },
    simulation: {
      run(_engine, options) {
        timeoutCalls.push('simulation');
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          }, {once: true});
        });
      }
    },
    fitnessFactory() { throw new Error('fitness must not run'); }
  });
  const timeoutResult = await timed.evaluate(validDsl, {timeout_ms: 5});
  assert.strictEqual(timeoutResult.status, 'timeout');
  assert.deepStrictEqual(timeoutCalls, ['qa', 'reset', 'load', 'simulation', 'teardown', 'reset']);

  const invalidFitness = new A.CandidateEvaluator({
    finalQA: {validate() { return {admitted: true, findings: []}; }},
    engine: {reset() {}, load() {}, teardown() {}},
    simulation: {async run() { return A.AgentProtocols.evaluationResult({episodes: 1}); }},
    fitnessFactory() { return {calculateFitness() { return {schema_version: '2.0', final_fitness: NaN}; }}; }
  });
  assert.strictEqual((await invalidFitness.evaluate(validDsl, {})).status, 'failed');

  console.log('candidate evaluator v3 tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
