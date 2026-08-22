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

load('playtest/PlayTestProtocols.js');

const P = sandbox.AGE.PlayTestProtocols;

function run() {
  assert(P, 'PlayTestProtocols must be exported on AGE');

  const profile = P.playtestProfile({});
  assert.strictEqual(profile.schema_version, '4.0');
  assert.strictEqual(profile.state_space.max_adapter_features, 6);
  assert.strictEqual(profile.action_space.max_adapter_actions, 6);
  assert.strictEqual(profile.action_space.max_macro_frames, 120);
  assert.strictEqual(profile.episode.max_macro_transitions, 40);
  assert.strictEqual(profile.episode.max_simulation_ticks, 1200);
  assert.strictEqual(profile.episode.wall_clock_timeout_ms, 120000);
  assert.strictEqual(profile.replay_confirmation.deterministic.attempts, 1);
  assert.strictEqual(profile.replay_confirmation.deterministic.required_successes, 1);
  assert.strictEqual(profile.replay_confirmation.non_deterministic_or_unknown.attempts, 3);
  assert.strictEqual(profile.replay_confirmation.non_deterministic_or_unknown.required_successes, 2);
  assert.strictEqual(profile.training.alpha, 0.1);
  assert.strictEqual(profile.training.gamma, 0.95);
  assert.strictEqual(profile.training.epochs_per_run, 3);
  assert.strictEqual(profile.training.max_updates_per_run, 5000);
  assert.strictEqual(profile.training.sample_repetition.confirmed, 4);
  assert.strictEqual(profile.training.sample_repetition.negative_evidence, 2);
  assert.strictEqual(profile.training.sample_repetition.exploration, 1);
  assert.strictEqual(profile.policy_store.max_retained_promoted_versions, 10);
  assert.strictEqual(profile.training_memory.max_training_runs, 50);
  assert.strictEqual(profile.validation.tie_policy, 'no_promotion_without_strict_validation_improvement');

  const custom = P.playtestProfile({
    episode: {max_macro_transitions: 12},
    training: {alpha: 0.2}
  });
  assert.strictEqual(custom.episode.max_macro_transitions, 12);
  assert.strictEqual(custom.training.alpha, 0.2);
  assert.strictEqual(profile.episode.max_macro_transitions, 40, 'profile must be deeply isolated');

  assert.strictEqual(P.isStatus('provisional', 'finding'), true);
  assert.strictEqual(P.isStatus('finalized', 'finding'), true);
  assert.strictEqual(P.isStatus('revoked', 'finding'), true);
  assert.strictEqual(P.isStatus('confirmed', 'replay'), true);
  assert.strictEqual(P.isStatus('incomplete', 'replay'), true);
  assert.strictEqual(P.isStatus('no_improvement', 'policy_decision'), true);
  assert.strictEqual(P.isStatus('active', 'policy'), true);
  assert.strictEqual(P.isStatus('unknown', 'finding'), false);
  assert.strictEqual(P.isStatus('active', 'finding'), false);

  console.log('playtest protocols v4 tests passed');
}

run();
