const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {console, JSON, Math, Date, isFinite, Promise, AbortController};
sandbox.window = sandbox;
sandbox.AGE = {};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
}

load('playtest/PolicyValidator.js');
load('playtest/TrainingCoordinator.js');
load('playtest/ValidationRunner.js');

const A = sandbox.AGE;

function policy(version, epsilon) {
  return {policy_version: version, policy_hash: 'policy:' + version, epsilon, q_table: {s0: {A: 1}}, compatibility: {state_encoder_version: 'core-v4.0'}};
}

async function run() {
  const events = [];
  const validator = new A.PolicyValidator();
  const trainingMemory = {append(run) { events.push('memory:' + run.training_run_id); return run; }};
  const trainer = {train(input) { events.push('train'); return {policy_version: 'candidate', policy_hash: 'policy:candidate', epsilon: input.parent_policy.epsilon, q_table: {s0: {A: 2}}, updates_applied: 1}; }};
  const promoter = {promote(input) { events.push('promote:' + input.validation.status); return Promise.resolve({status: 'promoted', policy_version: 'candidate'}); }};
  const ledger = {finalizeAll() { events.push('finalize'); }};
  const buffer = {
    snapshot() { events.push('snapshot'); return {layers: {confirmed: [], negative_evidence: [], exploration: []}}; },
    all() { return [{transition_id: 't1', state_id: 's0', action_id: 'A', reward: 1, next_state_id: 's1', terminal: true, stratum: 'confirmed'}]; }
  };
  const validationRunner = {run() { events.push('validate'); return Promise.resolve({decision: {status: 'promotion_eligible'}, active_scorecard: {}, candidate_scorecard: {}}); }};
  const coordinator = new A.TrainingCoordinator({ledger, buffer, trainer, trainingMemory, validationRunner, promoter});
  const cancelledEvolution = await coordinator.trainAfterRunClose({
    run_id: 'run-cancelled',
    run_status: 'cancelled',
    parent_policy: policy('active', 0.2),
    training_profile: {alpha: 0.1, gamma: 0.95},
    training_seed: 'train-1',
    signal: new AbortController().signal
  });
  assert.strictEqual(cancelledEvolution.status, 'promoted');
  assert.deepStrictEqual(events, ['finalize', 'snapshot', 'train', 'memory:run-cancelled', 'validate', 'promote:promotion_eligible']);

  const abortedController = new AbortController();
  abortedController.abort();
  let trainCalls = 0;
  const cancelledTraining = await new A.TrainingCoordinator({
    ledger,
    buffer,
    trainer: {train() { trainCalls++; }},
    trainingMemory,
    validationRunner,
    promoter
  }).trainAfterRunClose({run_id: 'run-training-cancel', parent_policy: policy('active', 0.2), signal: abortedController.signal});
  assert.strictEqual(cancelledTraining.status, 'cancelled');
  assert.strictEqual(trainCalls, 0);

  const validationCalls = [];
  const holdout = new A.ValidationRunner({
    validator,
    runPolicy(policyValue, context) {
      validationCalls.push({version: policyValue.policy_version, context});
      return policyValue.policy_version === 'candidate'
        ? {confirmed_bug_count: 5, reproduction_success_rate: 0.82, novel_finding_count: 8, invalid_action_rate: 0.12, no_progress_rate: 0.07}
        : {confirmed_bug_count: 4, reproduction_success_rate: 0.8, novel_finding_count: 7, invalid_action_rate: 0.1, no_progress_rate: 0.08};
    }
  });
  const validation = await holdout.run({
    active_policy: policy('active', 0.2),
    candidate_policy: policy('candidate', 0.2),
    scenarios: ['holdout-a', 'holdout-b'],
    seeds: ['seed-a', 'seed-b']
  });
  assert.strictEqual(validation.decision.status, 'promotion_eligible');
  assert.strictEqual(validation.proposed_epsilon, 0.19);
  assert.strictEqual(validationCalls.length, 2);
  assert(validationCalls.every(call => call.context.holdout === true));
  assert(validationCalls.every(call => call.context.training_access === false));

  console.log('training coordinator v4 tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
