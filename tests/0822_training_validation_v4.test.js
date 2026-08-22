const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {console, JSON, Math, Date, isFinite, TextEncoder};
sandbox.window = sandbox;
sandbox.AGE = {};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
}

load('evolution/EvolutionProtocols.js');
load('evolution/SeededPRNG.js');
load('playtest/QLearningTrainer.js');
load('playtest/PolicyValidator.js');

const A = sandbox.AGE;

function transitions() {
  return [
    {transition_id: 't1', state_id: 's0', action_id: 'A', reward: 1, next_state_id: 's1', terminal: true, stratum: 'confirmed'},
    {transition_id: 't2', state_id: 's0', action_id: 'B', reward: 0.5, next_state_id: 's1', terminal: false, stratum: 'exploration'},
    {transition_id: 't3', state_id: 's1', action_id: 'A', reward: 2, next_state_id: 's2', terminal: true, stratum: 'negative_evidence'}
  ];
}

function scorecard(values) {
  return Object.assign({
    confirmed_bug_count: 4,
    reproduction_success_rate: 0.8,
    novel_finding_count: 7,
    invalid_action_rate: 0.1,
    no_progress_rate: 0.08
  }, values || {});
}

function run() {
  const trainer = new A.QLearningTrainer();
  const snapshot = {snapshot_id: 'dataset-1', snapshot_hash: 'dataset:1', transitions: transitions()};
  const profile = {
    alpha: 1,
    gamma: 0.95,
    epochs_per_run: 3,
    max_updates_per_run: 5000,
    sample_repetition: {confirmed: 4, negative_evidence: 2, exploration: 1}
  };
  const first = trainer.train({
    parent_policy: {policy_hash: 'policy:parent', epsilon: 0.2, q_table: {}},
    dataset_snapshot: snapshot,
    training_profile: profile,
    training_seed: 'train-seed-1'
  });
  const second = trainer.train({
    parent_policy: {policy_hash: 'policy:parent', epsilon: 0.2, q_table: {}},
    dataset_snapshot: snapshot,
    training_profile: profile,
    training_seed: 'train-seed-1'
  });
  assert.strictEqual(first.policy_hash, second.policy_hash);
  assert.strictEqual(JSON.stringify(first.q_table), JSON.stringify(second.q_table));
  assert.strictEqual(first.q_table.s0.A, 1, 'terminal transition must not bootstrap');
  assert.strictEqual(first.epsilon, 0.2, 'training must not decay epsilon');
  assert(first.updates_applied <= 5000);
  assert(first.epochs_completed <= 3);

  const bounded = trainer.train({
    parent_policy: {policy_hash: 'policy:parent', epsilon: 0.2, q_table: {}},
    dataset_snapshot: snapshot,
    training_profile: Object.assign({}, profile, {epochs_per_run: 10, max_updates_per_run: 2}),
    training_seed: 'train-seed-2'
  });
  assert.strictEqual(bounded.updates_applied, 2);
  assert.strictEqual(bounded.stopped_reason, 'update_budget_exhausted');

  const validator = new A.PolicyValidator();
  assert.strictEqual(validator.proposedEpsilon(0.2), 0.19);
  assert.strictEqual(validator.proposedEpsilon(0.04), 0.05);

  const eligible = validator.compare({
    active_scorecard: scorecard(),
    candidate_scorecard: scorecard({confirmed_bug_count: 5, reproduction_success_rate: 0.82, novel_finding_count: 8, invalid_action_rate: 0.12, no_progress_rate: 0.07}),
    hard_gates: {schema_compatible: true, reproducibility_hash_match: true, finite_q_values: true, fatal_runtime_regressions: 0}
  });
  assert.strictEqual(eligible.status, 'promotion_eligible');
  assert.strictEqual(eligible.deciding_metric, 'confirmed_bug_count');

  const regression = validator.compare({
    active_scorecard: scorecard(),
    candidate_scorecard: scorecard({confirmed_bug_count: 6, reproduction_success_rate: 0.7}),
    hard_gates: {schema_compatible: true, reproducibility_hash_match: true, finite_q_values: true, fatal_runtime_regressions: 0}
  });
  assert.strictEqual(regression.status, 'rejected');
  assert.strictEqual(regression.reason, 'non_regression_failed');

  const hardFailure = validator.compare({
    active_scorecard: scorecard(),
    candidate_scorecard: scorecard({confirmed_bug_count: 9}),
    hard_gates: {schema_compatible: true, reproducibility_hash_match: false, finite_q_values: true, fatal_runtime_regressions: 0}
  });
  assert.strictEqual(hardFailure.status, 'rejected');
  assert.strictEqual(hardFailure.reason, 'hard_gate_failed');

  const equal = validator.compare({
    active_scorecard: scorecard(),
    candidate_scorecard: scorecard(),
    hard_gates: {schema_compatible: true, reproducibility_hash_match: true, finite_q_values: true, fatal_runtime_regressions: 0}
  });
  assert.strictEqual(equal.status, 'no_improvement');

  const bothNull = validator.compare({
    active_scorecard: scorecard({reproduction_success_rate: null}),
    candidate_scorecard: scorecard({reproduction_success_rate: null, confirmed_bug_count: 5}),
    hard_gates: {schema_compatible: true, reproducibility_hash_match: true, finite_q_values: true, fatal_runtime_regressions: 0}
  });
  assert.strictEqual(bothNull.status, 'promotion_eligible');

  const oneNull = validator.compare({
    active_scorecard: scorecard({reproduction_success_rate: null}),
    candidate_scorecard: scorecard({reproduction_success_rate: 0.1}),
    hard_gates: {schema_compatible: true, reproducibility_hash_match: true, finite_q_values: true, fatal_runtime_regressions: 0}
  });
  assert.notStrictEqual(oneNull.status, 'rejected');

  console.log('training and validation v4 tests passed');
}

run();
