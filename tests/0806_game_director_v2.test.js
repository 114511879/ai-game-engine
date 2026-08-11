const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {console, JSON, Math, Date, Promise, isFinite, setTimeout, clearTimeout};
sandbox.window = sandbox;
sandbox.AGE = {};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
}

load('core/dsl/Config.js');
load('core/engine/GameStandard.js');
load('fitness/types.js');
load('fitness/WeightProfile.js');
load('fitness/MetricsNormalizer.js');
load('fitness/PenaltyCalculator.js');
load('fitness/FitnessCalculator.js');
load('ai/protocols/AgentProtocols.js');
load('ai/intent/IntentParserAgent.js');
load('ai/quality/FinalQA.js');
load('ai/evaluation/BlueprintMetadata.js');
load('ai/simulation/SimulationMemory.js');
load('ai/simulation/SimulationAgent.js');
load('ai/director/GameDirector.js');

async function run() {
  const A = sandbox.AGE;
  const intent = A.IntentParserAgent.normalize(A.IntentParserAgent.local('生成一个跑酷游戏'), '生成一个跑酷游戏');
  const blueprint = A.AgentProtocols.gameBlueprint({
    request_id: intent.request_id,
    gameplay: {core_loop: ['run', 'avoid', 'reward']},
    world: {theme: 'forest'}
  });
  let designCalls = 0;
  const directorAgent = {
    async design(receivedIntent) {
      designCalls++;
      assert.strictEqual(receivedIntent.request_id, intent.request_id);
      return {
        success: true, blueprint, trace: [{stage: 'experts', status: 'completed'}], contexts: {},
        preqa: {status: 'review', findings: [{severity: 'warning', code: 'design_warning'}]}
      };
    }
  };
  let generationPrompt = '';
  A.callAI = async function(prompt) {
    generationPrompt = prompt;
    return {
      meta: {game_type: 'runner', title: 'Protocol Runner'},
      player: {hp: 3},
      rules: {win_condition: 'survive_time', win_value: 60},
      world: {theme: 'forest'}
    };
  };
  A.DSLBinder = {bind(raw) { return JSON.parse(JSON.stringify(raw)); }};
  A.PluginSelector = {select() { return {name: 'runner'}; }};
  A.PluginManager = {};
  A.STATE = {RUNNING: 'running'};
  A.setGameState = function() {};
  A.setStatus = function() {};
  A.DSLFixer = {fix(dsl) { return dsl; }};
  let loads = 0;
  A._currentEngine = {load() { loads++; }, playTester: null};
  let simulationCalls = 0;
  const simulationRecords = [];
  const simulationAgent = {
    async run() {
      simulationCalls++;
      return A.AgentProtocols.evaluationResult({
        simulation_id: 'sim-1', persona: 'new_player', episodes: 1,
        metrics: {death_rate: 0.25, completion_rate: 0.75, coverage: 0.8}
      });
    }
  };
  const simulationMemory = {
    history() { return [{version_id: 'v0', fitness: {final_fitness: 0.6}}]; },
    append(record) { simulationRecords.push(record); return record; }
  };
  let fitnessCalls = 0;
  const fitnessCalculator = {
    calculateFitness(evaluation, qa, runtime, trend, metadata) {
      fitnessCalls++;
      assert.strictEqual(evaluation.metrics.death_rate, 0.25);
      assert.strictEqual(qa.admitted, true);
      assert(qa.findings.some(finding => finding.code === 'design_warning'));
      assert.strictEqual(runtime.started, true);
      assert.strictEqual(trend.previous_fitness, 0.6);
      assert.strictEqual(metadata.game_id, intent.request_id);
      return A.FitnessTypes.fitnessResult({
        fitness_id: 'fitness-test-v1', game_id: intent.request_id, version_id: 'v1',
        scores: {fun_proxy: 0.8, playability: 0.8, balance: 0.7, novelty: 0.5, stability: 0.9},
        weights: {fun_proxy: 0.3, playability: 0.2, balance: 0.2, novelty: 0.1, stability: 0.2},
        base_fitness: 0.77, final_fitness: 0.77,
        confidence: {overall: 0.8, fun_proxy: 0.8, playability: 0.8, balance: 0.8, novelty: 0.3, stability: 1}
      });
    }
  };

  const gameDirector = new A.GameDirector({
    directorAgent,
    finalQA: new A.FinalQA({ai: null}),
    simulationAgent,
    simulationMemory,
    fitnessCalculator,
    runtimeMetrics: function() { return {started: true, crashed: false}; }
  });
  gameDirector.maxIterations = 0;
  const result = await gameDirector.runDirectorLoop('生成一个跑酷游戏', intent);

  assert.strictEqual(result.success, true);
  assert.strictEqual(designCalls, 1, 'GameDirector must delegate design to DirectorAgent');
  assert(generationPrompt.includes('Game Blueprint'));
  assert.strictEqual(result.design.blueprint.request_id, intent.request_id);
  assert.strictEqual(result.qa.admitted, true);
  assert.strictEqual(loads, 1);
  assert.strictEqual(simulationCalls, 1);
  assert.strictEqual(result.evaluation.metrics.death_rate, 0.25);
  assert.strictEqual(simulationRecords[0].parent_version, 'v0');
  assert.strictEqual(fitnessCalls, 1);
  assert.strictEqual(result.fitness.final_fitness, 0.77);
  assert.strictEqual(simulationRecords[0].fitness.final_fitness, 0.77);

  A.callAI = async function() {
    return {meta: {game_type: 'runner'}, player: {hp: 0}, rules: {}};
  };
  loads = 0;
  const rejectedDirector = new A.GameDirector({
    directorAgent,
    finalQA: new A.FinalQA({ai: null}),
    simulationAgent,
    simulationMemory
  });
  rejectedDirector.maxIterations = 0;
  const rejected = await rejectedDirector.runDirectorLoop('生成一个跑酷游戏', intent);
  assert.strictEqual(rejected.success, false);
  assert.strictEqual(rejected.error, '生成的Game DSL未通过Final QA');
  assert.strictEqual(loads, 0, 'invalid DSL must never load the Engine');
  assert.strictEqual(simulationCalls, 1, 'rejected DSL must never reach SimulationAgent');

  A.callAI = async function() {
    return {
      meta: {game_type: 'runner', title: 'Protocol Runner'},
      player: {hp: 3},
      rules: {win_condition: 'survive_time'}
    };
  };
  const incompleteRecords = [];
  const incompleteDirector = new A.GameDirector({
    directorAgent,
    finalQA: new A.FinalQA({ai: null}),
    simulationAgent: {async run() { throw new Error('simulation failed'); }},
    simulationMemory: {
      history() { return []; },
      append(record) { incompleteRecords.push(record); return record; }
    }
  });
  incompleteDirector.maxIterations = 0;
  const incomplete = await incompleteDirector.runDirectorLoop('生成一个跑酷游戏', intent);
  assert.strictEqual(incomplete.success, true);
  assert.strictEqual(incomplete.evaluation.status, 'incomplete');
  assert.strictEqual(incompleteRecords.length, 1, 'failed simulations must still be recorded');
  assert.strictEqual(incompleteRecords[0].status, 'incomplete');

  console.log('game director v2 tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
