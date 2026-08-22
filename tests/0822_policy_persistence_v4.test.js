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

load('playtest/PolicyStore.js');
load('playtest/TrainingMemory.js');
load('playtest/PolicyPromoter.js');

const A = sandbox.AGE;

function storage(shouldFail) {
  const data = {};
  return {
    getItem(key) { return data[key] || null; },
    setItem(key, value) { if (shouldFail && shouldFail()) throw new Error('storage failed'); data[key] = String(value); },
    removeItem(key) { delete data[key]; }
  };
}

function policy(version, epsilon) {
  return {
    policy_id: 'bug_hunter',
    policy_version: version,
    status: 'candidate',
    parent_version: null,
    policy_hash: 'policy:' + version,
    epsilon,
    compatibility: {state_encoder_version: 'core-v4.0', action_schema_version: 'macro-v4.0', reward_profile_version: 'bug-discovery-v1', engine_capability_hash: 'cap:1'},
    q_table: {s0: {EDGE_PRESSURE: 1}}
  };
}

async function run() {
  const store = new A.PolicyStore(storage());
  const memory = new A.TrainingMemory(storage());
  const first = policy('pt-v4-0008', 0.18);
  const second = policy('pt-v4-0009', 0.171);
  assert.strictEqual(store.commitPromotion(first).status, 'active');
  assert.strictEqual(store.commitPromotion(second).status, 'active');
  assert.strictEqual(store.currentActive().policy_version, 'pt-v4-0009');
  assert.strictEqual(store.get('pt-v4-0008').status, 'superseded');
  assert.strictEqual(store.rollback('pt-v4-0008').policy_version, 'pt-v4-0008');
  assert.strictEqual(store.currentActive().epsilon, 0.18);

  for (let index = 0; index < 52; index++) {
    memory.append({training_run_id: 'train-' + index, status: 'completed'});
  }
  assert.strictEqual(memory.all().length, 50);
  assert.strictEqual(memory.all()[0].training_run_id, 'train-2');

  const promoter = new A.PolicyPromoter({store, trainingMemory: memory, idFactory: () => 'pt-v4-0010'});
  const promoted = await promoter.promote({
    candidate: policy('pt-v4-0010-candidate', 0.171),
    validation: {status: 'promotion_eligible', deciding_metric: 'confirmed_bug_count'},
    training_run: {training_run_id: 'train-promote', status: 'completed'}
  });
  assert.strictEqual(promoted.status, 'promoted');
  assert.strictEqual(store.currentActive().policy_version, 'pt-v4-0010');
  assert.strictEqual(store.currentActive().status, 'active');

  const noImprovement = await promoter.promote({
    candidate: policy('pt-v4-0011-candidate', 0.162),
    validation: {status: 'no_improvement', reason: 'validation_scorecard_equal'},
    training_run: {training_run_id: 'train-no-improvement', status: 'completed'}
  });
  assert.strictEqual(noImprovement.status, 'no_improvement');
  assert.strictEqual(store.currentActive().policy_version, 'pt-v4-0010');
  assert.strictEqual(store.rejectedMetadata().some(row => row.policy_version === 'pt-v4-0011-candidate'), false);
  assert(memory.all().some(row => row.training_run_id === 'train-no-improvement'));

  const rejected = await promoter.promote({
    candidate: policy('pt-v4-0012-candidate', 0.162),
    validation: {status: 'rejected', reason: 'non_regression_failed'},
    training_run: {training_run_id: 'train-rejected', status: 'completed'}
  });
  assert.strictEqual(rejected.status, 'rejected');
  assert(store.rejectedMetadata().some(row => row.policy_version === 'pt-v4-0012-candidate'));
  assert.strictEqual(store.currentActive().policy_version, 'pt-v4-0010');

  let failWrites = true;
  const failingMemory = new A.TrainingMemory(storage(() => failWrites));
  const failingPromoter = new A.PolicyPromoter({store, trainingMemory: failingMemory, idFactory: () => 'pt-v4-0013'});
  const failed = await failingPromoter.promote({
    candidate: policy('pt-v4-0013-candidate', 0.154),
    validation: {status: 'promotion_eligible', deciding_metric: 'confirmed_bug_count'},
    training_run: {training_run_id: 'train-failed', status: 'completed'}
  });
  assert.strictEqual(failed.status, 'failed');
  assert.strictEqual(store.currentActive().policy_version, 'pt-v4-0010');
  failWrites = false;

  console.log('policy persistence v4 tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
