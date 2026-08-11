const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {console, JSON, Math, Date, isFinite};
sandbox.window = sandbox;
sandbox.AGE = {};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
}

load('fitness/types.js');
load('fitness/WeightProfile.js');
load('fitness/MetricsNormalizer.js');
load('fitness/PenaltyCalculator.js');
load('fitness/FitnessCalculator.js');

const A = sandbox.AGE;

assert(A.FitnessProfiles.default_v2);
assert.strictEqual(Object.keys(A.FitnessProfiles.default_v2.weights).length, 5);
assert(Math.abs(Object.values(A.FitnessProfiles.default_v2.weights).reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
assert.throws(() => A.FitnessProfiles.register('bad', {weights: {fun_proxy: 2}}), /invalid_weight_profile/);
assert.strictEqual(A.FitnessProfiles.resolve('missing').name, 'default_v2');

function evaluation(metrics, overrides) {
  return Object.assign({
    schema_version: '1.0',
    status: 'completed',
    episodes: 3,
    metrics: Object.assign({
      engagement_proxy: 8,
      completion_rate: 0.65,
      death_rate: 0.3,
      coverage: 0.8,
      play_time: 900,
      exploration_rate: 0.75,
      skill_usage_diversity: 0.7,
      route_variation: 0.5,
      early_failure_rate: 0.1,
      progression_quality: 0.8,
      retry_rate: 0.6
    }, metrics || {}),
    bugs: []
  }, overrides || {});
}

const calculator = new A.FitnessCalculator({game_id: 'game-1', version_id: 'v3'});
const runtime = {
  started: true,
  crashed: false,
  boot_failures: 0,
  uncaught_errors: 0,
  invalid_state_count: 0,
  soft_failures: 0,
  frame_drop_rate: 0.04,
  avg_fps: 58,
  target_fps: 60
};
const metadata = {
  game_id: 'game-1',
  version_id: 'v3',
  mechanics: ['dodge_combat', 'skill_tree', 'random_map'],
  level_structure: {type: 'branching', exploration_depth: 0.72},
  enemy_features: {enemy_types: 12, boss_patterns: 5},
  skill_features: {skill_count: 20, interaction_count: 8}
};

const complete = calculator.calculateFitness(
  evaluation(),
  {findings: []},
  runtime,
  {points: 2, previous_fitness: 0.68},
  metadata
);

assert.strictEqual(complete.schema_version, '2.0');
assert.strictEqual(complete.profile, 'default_v2');
assert(complete.final_fitness >= 0 && complete.final_fitness <= 1);
assert(complete.base_fitness >= 0 && complete.base_fitness <= 1);
assert(complete.scores.fun_proxy > 0 && complete.scores.playability > 0);
assert.strictEqual(complete.penalties.qa_penalty, 0);
assert.strictEqual(complete.trend.improvement_delta, Number((complete.final_fitness - 0.68).toFixed(4)));
assert(complete.confidence.overall > 0.8);

const missingMetadata = calculator.calculateFitness(evaluation(), {findings: []}, {}, {});
assert.strictEqual(missingMetadata.scores.novelty, 0.5);
assert.strictEqual(missingMetadata.confidence.novelty, 0.3);
assert(missingMetadata.confidence.overall < complete.confidence.overall);

const qaResult = calculator.calculateFitness(evaluation(), {
  findings: [
    {severity: 'blocking', code: 'bad_dsl'},
    {severity: 'warning', code: 'slow_hint'},
    {severity: 'warning', code: 'empty_reward'}
  ]
}, runtime, {}, metadata);
assert(qaResult.penalties.qa_penalty > 0);
assert(qaResult.penalties.qa_penalty <= 0.35);
assert.strictEqual(qaResult.scores.fun_proxy, complete.scores.fun_proxy, 'QA must not alter fun_proxy');

const simulationBugResult = calculator.calculateFitness(evaluation({}, {
  bugs: [
    {severity: 'critical', code: 'engine_crash'},
    {severity: 'warning', code: 'stuck_corner'}
  ]
}), {findings: []}, runtime, {}, metadata);
assert.strictEqual(simulationBugResult.penalties.critical_bugs, 1);
assert(simulationBugResult.penalties.qa_penalty > 0, 'simulation bugs must contribute to the independent penalty');
assert.strictEqual(simulationBugResult.scores.fun_proxy, complete.scores.fun_proxy, 'simulation bugs must not alter fun_proxy');

const runtimeResult = calculator.calculateFitness(evaluation(), {findings: []}, {
  started: false,
  crashed: true,
  boot_failures: 3,
  uncaught_errors: 20,
  soft_failures: 80
}, {});
assert(runtimeResult.penalties.runtime_penalty <= 0.4);
assert(runtimeResult.final_fitness >= 0 && runtimeResult.final_fitness <= 1);

const clamped = calculator.calculateFitness(evaluation({
  completion_rate: -1,
  death_rate: 4,
  engagement_proxy: 100
}), {}, {}, {});
Object.values(clamped.scores).forEach(score => assert(score >= 0 && score <= 1));

const confidenceChanged = JSON.parse(JSON.stringify(complete));
confidenceChanged.confidence.overall = 0.01;
assert.strictEqual(confidenceChanged.final_fitness, complete.final_fitness, 'confidence must not alter fitness');

const repeated = calculator.calculateFitness(
  evaluation(),
  {findings: []},
  runtime,
  {points: 2, previous_fitness: 0.68},
  metadata
);
assert.deepStrictEqual(JSON.parse(JSON.stringify(repeated)), JSON.parse(JSON.stringify(complete)));

const custom = A.FitnessProfiles.register('novelty_heavy', {
  weights: {fun_proxy: 0.15, playability: 0.15, balance: 0.15, novelty: 0.4, stability: 0.15},
  completion_band: [0.4, 0.8],
  target_death_rate: 0.3
});
assert.strictEqual(custom.name, 'novelty_heavy');
const customResult = new A.FitnessCalculator({profile: 'novelty_heavy', game_id: 'game-1', version_id: 'v3'})
  .calculateFitness(evaluation(), {findings: []}, runtime, {}, metadata);
assert.strictEqual(customResult.weights.novelty, 0.4);

console.log('fitness calculator v2 tests passed');
