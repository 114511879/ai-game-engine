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

[
  'evolution/EvolutionProtocols.js',
  'evolution/EvolutionProfiles.js',
  'evolution/GeneSchemaValidator.js',
  'evolution/OptimizationSchemaBuilder.js',
  'evolution/GeneEncoder.js',
  'evolution/SelectionEngine.js',
  'evolution/EvolutionMemory.js',
  'evolution/EvolutionRunner.js'
].forEach(load);

const A = sandbox.AGE;

function storageAdapter() {
  const data = {};
  return {
    data,
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; }
  };
}

const boundedStorage = storageAdapter();
const boundedMemory = new A.EvolutionMemory(boundedStorage);
for (let index = 0; index < 51; index++) {
  boundedMemory.append({
    run_id: 'r' + index,
    game_id: 'g',
    status: index === 10 ? 'failed' : 'completed',
    created_at: index,
    best_candidate: {dsl: {large: true}},
    generations: [{candidates: [{candidate_id: 'c', dsl: {large: true}}]}],
    optimization_trace: []
  });
}
assert.strictEqual(boundedMemory.all().length, 50);
assert.strictEqual(boundedMemory.all()[0].run_id, 'r1');
assert(boundedMemory.all().some(run => run.status === 'failed'));
assert.strictEqual(boundedMemory.all()[0].best_candidate.dsl, undefined);
assert.strictEqual(boundedMemory.all()[0].generations[0].candidates[0].dsl, undefined);
assert.throws(() => boundedMemory.append({run_id: '', game_id: 'g'}), /invalid_evolution_run/);

const baselineDsl = {
  meta: {game_id: 'game-1', game_type: 'runner'},
  player: {hp: 3},
  optimization: {
    target: 'maximize_final_fitness',
    immutable: ['meta.game_id'],
    variables: [{name: 'hp', path: 'player.hp', type: 'integer', range: [3, 20], step: 1, mutation_rate: 1, importance: 'high'}]
  }
};
const scopeHash = A.EvolutionProtocols.scopeHash(baselineDsl.optimization);
const baselineFitness = {schema_version: '2.0', final_fitness: 0.4, confidence: {overall: 0.9}};
const baselineQa = {admitted: true, semantic_qa: {status: 'passed', optimization_scope_hash: scopeHash}};

function candidate(generation, index, hp, lineage, status) {
  return {
    generation,
    candidate_id: 'g' + generation + '-c' + index,
    candidate_seed: 'run:g' + generation + ':c' + index,
    lineage,
    status,
    gene_vector: [{path: 'player.hp', value: hp}],
    changes: hp === 3 ? [] : [{name: 'hp', path: 'player.hp', old: 3, new: hp, importance: 'high'}]
  };
}

class FakeOptimizer {
  createInitialPopulation() {
    return {
      generation: 0,
      candidates: [
        candidate(0, 0, 3, 'baseline', 'baseline_reuse'),
        candidate(0, 1, 4, 'mutation', 'pending'),
        candidate(0, 2, 5, 'mutation', 'pending'),
        candidate(0, 3, 6, 'mutation', 'pending'),
        candidate(0, 4, 7, 'mutation', 'pending'),
        candidate(0, 5, 8, 'mutation', 'pending')
      ],
      stats: {generated_attempts: 5, duplicates_rejected: 0, evaluated_candidates: 0, reused_candidates: 1, failed_candidates: 0}
    };
  }

  nextGeneration(options) {
    const ranked = options.evaluatedPopulation.slice().sort((left, right) => right.fitness_result.final_fitness - left.fitness_result.final_fitness);
    const candidates = ranked.slice(0, 2).map((source, index) => Object.assign({}, source, {
      generation: options.generation,
      candidate_id: 'g' + options.generation + '-c' + index,
      lineage: 'elite',
      status: 'reused'
    }));
    const startHp = options.generation === 1 ? 7 : 11;
    for (let index = 2; index < 6; index++) {
      candidates.push(candidate(options.generation, index, startHp + index, 'offspring', 'pending'));
    }
    return {
      generation: options.generation,
      candidates,
      stats: {generated_attempts: 4, duplicates_rejected: 0, evaluated_candidates: 0, reused_candidates: 2, failed_candidates: 0}
    };
  }
}

function createRunner(options) {
  options = options || {};
  const memory = options.memory || new A.EvolutionMemory(storageAdapter());
  return new A.EvolutionRunner({
    optimizer: options.optimizer || new FakeOptimizer(),
    evaluator: options.evaluator,
    memory,
    schemaValidator: new A.GeneSchemaValidator(),
    schemaBuilder: A.OptimizationSchemaBuilder,
    finalQA: options.finalQA || {validate() { return {admitted: true, findings: []}; }},
    selection: new A.SelectionEngine(),
    engineAdapter: options.engineAdapter || {async restoreBaseline() {}},
    onStatus: options.onStatus || function() {},
    clock: options.clock || (() => 100)
  });
}

async function run() {
  const preconditionRunner = createRunner({evaluator: {evaluate() { throw new Error('must not evaluate'); }}});
  assert.strictEqual(
    (await preconditionRunner.runEvolution(baselineDsl, {baseline_qa: baselineQa})).stopped_reason,
    'baseline_fitness_required'
  );
  assert.strictEqual(
    (await preconditionRunner.runEvolution(baselineDsl, {baseline_fitness: baselineFitness})).stopped_reason,
    'baseline_qa_required'
  );
  const changedScopeQa = {admitted: true, semantic_qa: {status: 'passed', optimization_scope_hash: 'ga3:changed'}};
  assert.strictEqual(
    (await preconditionRunner.runEvolution(baselineDsl, {baseline_fitness: baselineFitness, baseline_qa: changedScopeQa})).stopped_reason,
    'optimization_scope_changed'
  );

  const duplicateRunner = createRunner({
    optimizer: {
      createInitialPopulation() {
        return {
          generation: 0,
          candidates: [candidate(0, 0, 3, 'baseline', 'baseline_reuse')].concat(
            [1, 2, 3, 4, 5].map(index => candidate(0, index, 4, 'mutation', 'duplicate_exhausted'))
          ),
          stats: {generated_attempts: 30, duplicates_rejected: 30, evaluated_candidates: 0, reused_candidates: 1, failed_candidates: 5}
        };
      }
    },
    evaluator: {evaluate() { throw new Error('duplicates must not evaluate'); }}
  });
  const duplicateResult = await duplicateRunner.runEvolution(baselineDsl, {
    baseline_fitness: baselineFitness,
    baseline_qa: baselineQa
  });
  assert.strictEqual(duplicateResult.stopped_reason, 'failure_budget_exceeded');
  assert.strictEqual(
    duplicateResult.optimization_trace.filter(entry => entry.status === 'duplicate_exhausted').length,
    4,
    'the fourth failed candidate must stop the run immediately'
  );

  const evaluationOrder = [];
  let restoreCalls = 0;
  let fitnessSequence = 0;
  const memory = new A.EvolutionMemory(storageAdapter());
  const runner = createRunner({
    memory,
    engineAdapter: {async restoreBaseline(dsl) { assert.strictEqual(dsl, baselineDsl); restoreCalls++; }},
    evaluator: {
      async evaluate(dsl, context) {
        evaluationOrder.push(context.candidate_id);
        fitnessSequence++;
        return {
          status: 'evaluated',
          qa: {admitted: true, findings: []},
          evaluation: {schema_version: '1.0', status: 'completed', episodes: 1, metrics: {completion_rate: 0.7}},
          runtime: {started: true},
          fitness: {schema_version: '2.0', final_fitness: 0.5 + fitnessSequence * 0.01, confidence: {overall: 0.8}},
          simulation_deterministic: true,
          elapsed_ms: 1,
          dslHp: dsl.player.hp
        };
      }
    }
  });
  const result = await runner.runEvolution(baselineDsl, {
    baseline_version: 'v1',
    baseline_fitness: baselineFitness,
    baseline_qa: baselineQa,
    random_seed: 'run',
    intent: {game_type: 'runner'},
    blueprint: {levels: []},
    deterministic: true
  });
  assert.deepStrictEqual(evaluationOrder, [
    'g0-c1', 'g0-c2', 'g0-c3', 'g0-c4', 'g0-c5',
    'g1-c2', 'g1-c3', 'g1-c4', 'g1-c5',
    'g2-c2', 'g2-c3', 'g2-c4', 'g2-c5'
  ]);
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(result.stopped_reason, 'max_generations');
  assert.strictEqual(result.best_candidate.candidate_id, 'g2-c5');
  assert.strictEqual(result.best_candidate.dsl.player.hp, 16);
  assert.strictEqual(result.promotion.status, 'not_requested');
  assert.strictEqual(restoreCalls, 1);
  assert.strictEqual(memory.all().length, 1);
  assert.strictEqual(memory.all()[0].best_candidate.dsl, undefined);

  const controller = new AbortController();
  const cancelledOrder = [];
  let cancelledRestores = 0;
  const cancelledMemory = new A.EvolutionMemory(storageAdapter());
  const cancelledRunner = createRunner({
    memory: cancelledMemory,
    engineAdapter: {async restoreBaseline() { cancelledRestores++; }},
    evaluator: {
      async evaluate(_dsl, context) {
        cancelledOrder.push(context.candidate_id);
        if (context.candidate_id === 'g1-c2') controller.abort();
        return {
          status: 'evaluated', qa: {admitted: true}, evaluation: {status: 'completed'}, runtime: {},
          fitness: {schema_version: '2.0', final_fitness: 0.6, confidence: {overall: 0.8}},
          simulation_deterministic: true
        };
      }
    }
  });
  const cancelled = await cancelledRunner.runEvolution(baselineDsl, {
    baseline_version: 'v1', baseline_fitness: baselineFitness, baseline_qa: baselineQa,
    random_seed: 'run', signal: controller.signal
  });
  assert.strictEqual(cancelled.stopped_reason, 'cancelled');
  assert.strictEqual(cancelled.promotion.status, 'not_requested');
  assert.strictEqual(cancelledOrder[cancelledOrder.length - 1], 'g1-c2');
  assert(!cancelledOrder.includes('g1-c3'));
  assert.strictEqual(cancelledRestores, 1);
  assert.strictEqual(cancelledMemory.all().length, 1);
  assert.strictEqual(cancelledMemory.all()[0].cancelled_at.candidate_id, 'g1-c2');

  console.log('evolution runner v3 tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
