const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {console, JSON, Math, Date, isFinite, TextEncoder, Promise, AbortController};
sandbox.window = sandbox;
sandbox.AGE = {};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
}

[
  'evolution/EvolutionProtocols.js',
  'evolution/SeededPRNG.js',
  'playtest/PlayTestProtocols.js',
  'playtest/CanonicalStateSerializer.js',
  'playtest/GameTypeStateAdapter.js',
  'playtest/CoreStateEncoder.js',
  'playtest/MacroActionSchema.js',
  'playtest/EpisodeTracker.js',
  'playtest/MacroActionExecutor.js',
  'playtest/ObservationNormalizer.js',
  'playtest/AnomalyRuleRegistry.js',
  'playtest/FindingFingerprintBuilder.js',
  'playtest/ReplayRunner.js',
  'playtest/RewardLedger.js',
  'playtest/ReplayBuffer.js',
  'playtest/QLearningTrainer.js',
  'playtest/PolicyValidator.js',
  'playtest/PolicyStore.js',
  'playtest/TrainingMemory.js',
  'playtest/EngineAdapter.js',
  'playtest/PlayTestEvaluator.js',
  'playtest/PlayTestRunCoordinator.js',
  'playtest/ValidationRunner.js',
  'playtest/TrainingCoordinator.js',
  'playtest/PolicyPromoter.js'
].forEach(load);

const A = sandbox.AGE;

function run() {
  const first = new A.SeededPRNG('release-seed');
  const second = new A.SeededPRNG('release-seed');
  assert.deepStrictEqual([first.next(), first.next(), first.next()], [second.next(), second.next(), second.next()]);

  const encoder = new A.CoreStateEncoder();
  const adapter = new A.GameTypeStateAdapter({id: 'runner-v1', encode: () => ({platform: 'edge'})});
  const stateA = encoder.encode({position_region: 'center', velocity_x: 0.1, velocity_y: 0, health: 4, collision_state: 'none', boundary_state: 'inside', nearest_enemy_distance: 40, movement_state: 'moving', game_phase: 'active', grounded: true, recent_damage: false, recent_failure: false, x: 1}, adapter);
  const stateB = encoder.encode({position_region: 'center', velocity_x: 0.2, velocity_y: 0, health: 4, collision_state: 'none', boundary_state: 'inside', nearest_enemy_distance: 41, movement_state: 'moving', game_phase: 'active', grounded: true, recent_damage: false, recent_failure: false, x: 999}, adapter);
  assert.strictEqual(stateA.state_id, stateB.state_id);
  assert.strictEqual(A.MacroActionSchema.validate({action_id: 'JUMP', duration_frames: 121, sequence: []}, {jump: true}, {}).valid, false);

  const tracker = new A.EpisodeTracker({max_macro_transitions: 1, clock: () => 1000});
  tracker.start({state_id: 's0'});
  assert.strictEqual(tracker.recordTransition({state_id: 's1', progress_signature: 'p1'}).termination_reason, 'macro_budget_exhausted');

  const fingerprint = new A.FindingFingerprintBuilder();
  const finding = fingerprint.build({rule_id: 'physics.boundary_escape', rule_version: '1.0', component: 'player', region: 'right_edge', invariant_signature: 'outside', trigger_sequence: ['EDGE_PRESSURE']});
  assert.strictEqual(finding.bug_fingerprint, fingerprint.build(Object.assign({}, finding, {timestamp: 'different', exact_x: 900})).bug_fingerprint);
  assert.strictEqual(A.PlayTestProtocols.playtestProfile({}).replay_confirmation.non_deterministic_or_unknown.required_successes, 2);

  const ledger = new A.RewardLedger();
  ledger.record({event_id: 'e1', finding_id: 'f1', factor: 'first_anomaly', value: 0.2});
  assert.strictEqual(ledger.finalizeFinding('f1', {value: 1})[0].status, 'finalized');
  const buffer = new A.ReplayBuffer({max_transitions: 6});
  assert.strictEqual(buffer.append({transition_id: 't', state_id: 's', action_id: 'a', reward: 1, next_state_id: 'n', terminal: true, stratum: 'confirmed'}), true);
  assert.strictEqual(buffer.append({transition_id: 'bad', state_id: 's', action_id: 'a', reward: 1, next_state_id: 'n', status: 'incomplete', stratum: 'confirmed'}), false);

  const trainer = new A.QLearningTrainer();
  const trainedA = trainer.train({parent_policy: {policy_hash: 'p', epsilon: 0.2, q_table: {}}, dataset_snapshot: {snapshot_id: 'd', snapshot_hash: 'd', transitions: buffer.all()}, training_profile: {alpha: 0.1, gamma: 0.95, epochs_per_run: 1, max_updates_per_run: 10, sample_repetition: {confirmed: 1, negative_evidence: 1, exploration: 1}}, training_seed: 'train'});
  const trainedB = trainer.train({parent_policy: {policy_hash: 'p', epsilon: 0.2, q_table: {}}, dataset_snapshot: {snapshot_id: 'd', snapshot_hash: 'd', transitions: buffer.all()}, training_profile: {alpha: 0.1, gamma: 0.95, epochs_per_run: 1, max_updates_per_run: 10, sample_repetition: {confirmed: 1, negative_evidence: 1, exploration: 1}}, training_seed: 'train'});
  assert.strictEqual(trainedA.policy_hash, trainedB.policy_hash);
  assert.strictEqual(new A.PolicyValidator().proposedEpsilon(0.2), 0.19);

  const candidateEvaluatorSource = fs.readFileSync(path.join(root, 'evolution/CandidateEvaluator.js'), 'utf8');
  assert(candidateEvaluatorSource.includes('playtest_enabled'));
  assert(candidateEvaluatorSource.includes('if(playtest)output.playtest=playtest'));
  assert(!candidateEvaluatorSource.includes('evaluation.bugs.push'));
  assert(fs.readFileSync(path.join(root, 'AI-ENGINE启动.html'), 'utf8').includes('playtest_enabled') || fs.readFileSync(path.join(root, 'main.js'), 'utf8').includes('playtest_enabled:playtestEnabled'));

  console.log('v4 release gate tests passed');
}

run();
