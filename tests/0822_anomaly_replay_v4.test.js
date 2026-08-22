const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {console, JSON, Math, Date, isFinite, Promise};
sandbox.window = sandbox;
sandbox.AGE = {};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
}

load('playtest/ObservationNormalizer.js');
load('playtest/AnomalyRuleRegistry.js');
load('playtest/FindingFingerprintBuilder.js');
load('playtest/ReplayRunner.js');

const A = sandbox.AGE;

async function run() {
  const normalized = A.ObservationNormalizer.normalize({
    tick: 5,
    timestamp: 'wall-clock-must-not-survive',
    snapshot: {
      game_phase: 'active',
      player_hp: 0,
      player_state: 'alive',
      boundary_state: 'inside',
      game_over: false
    },
    events: [{type: 'damage', tick: 5}]
  });
  assert.strictEqual(normalized.tick, 5);
  assert.strictEqual(normalized.snapshot.player_hp, 0);
  assert.strictEqual(normalized.timestamp, undefined);
  assert.strictEqual(JSON.stringify(normalized.events), JSON.stringify([{tick: 5, type: 'damage'}]));

  const registry = new A.AnomalyRuleRegistry({registry_version: 'anomaly-rules-v4.0'});
  const stateFindings = registry.detect(normalized.snapshot, normalized.events, [], {game_type: 'runner'});
  assert(stateFindings.some(finding => finding.rule_id === 'state.hp_zero_alive'));

  const boundaryFindings = registry.detect({
    game_phase: 'active',
    boundary_state: 'outside_playable_area',
    player_state: 'alive',
    player_hp: 5
  }, [], [], {game_type: 'runner'});
  assert(boundaryFindings.some(finding => finding.rule_id === 'physics.boundary_escape'));

  const temporalFindings = registry.detect({game_phase: 'active'}, [{type: 'move_input', tick: 2}], [{type: 'death', tick: 1}], {window: 2});
  assert(temporalFindings.some(finding => finding.rule_id === 'temporal.input_after_death'));

  const fingerprintBuilder = new A.FindingFingerprintBuilder({schema_version: 'bugfp-v1'});
  const findingA = fingerprintBuilder.build({
    rule_id: 'physics.boundary_escape',
    rule_version: '1.0',
    game_type: 'runner',
    component: 'player',
    region: 'right_edge',
    invariant_signature: 'outside_playable_area',
    trigger_sequence: ['EDGE_PRESSURE', 'JUMP_FORWARD'],
    finding_id: 'run-a-1',
    timestamp: 'one',
    exact_x: 801.2
  });
  const findingB = fingerprintBuilder.build({
    rule_id: 'physics.boundary_escape',
    rule_version: '1.0',
    game_type: 'runner',
    component: 'player',
    region: 'right_edge',
    invariant_signature: 'outside_playable_area',
    trigger_sequence: ['EDGE_PRESSURE', 'JUMP_FORWARD'],
    finding_id: 'run-b-9',
    timestamp: 'two',
    exact_x: 809.8
  });
  assert.strictEqual(findingA.bug_fingerprint, findingB.bug_fingerprint);
  const changed = fingerprintBuilder.build(Object.assign({}, findingB, {trigger_sequence: ['EDGE_PRESSURE', 'REVERSE_DIRECTION']}));
  assert.notStrictEqual(findingA.bug_fingerprint, changed.bug_fingerprint);

  let replayCalls = 0;
  const replay = new A.ReplayRunner({
    restoreCheckpoint() {},
    executeSequence(sequence, context) {
      replayCalls++;
      assert.strictEqual(JSON.stringify(sequence), JSON.stringify(['EDGE_PRESSURE', 'JUMP_FORWARD']));
      return {bug_fingerprint: 'bug:abc', replay_seed: context.replay_seed};
    }
  });
  const confirmed = await replay.confirm({
    finding_id: 'f1',
    bug_fingerprint: 'bug:abc',
    trigger_sequence: ['EDGE_PRESSURE', 'JUMP_FORWARD'],
    candidate_seed: 'candidate-1',
    finding_index: 0
  }, {replay_deterministic: true});
  assert.strictEqual(confirmed.status, 'confirmed');
  assert.strictEqual(confirmed.attempts_run, 1);
  assert.strictEqual(confirmed.successes, 1);
  assert.strictEqual(replayCalls, 1);
  assert.strictEqual(confirmed.attempts[0].replay_seed, 'candidate-1:finding:0:replay:1');

  let noisyCalls = 0;
  const noisyReplay = new A.ReplayRunner({
    restoreCheckpoint() {},
    executeSequence() {
      noisyCalls++;
      return {bug_fingerprint: noisyCalls < 3 ? 'bug:abc' : 'bug:other'};
    }
  });
  const noisy = await noisyReplay.confirm({finding_id: 'f2', bug_fingerprint: 'bug:abc', trigger_sequence: [], candidate_seed: 'candidate-2', finding_index: 1}, {replay_deterministic: false});
  assert.strictEqual(noisy.status, 'confirmed');
  assert.strictEqual(noisy.attempts_run, 2, '2/3 should stop after two successes');

  const mismatchReplay = new A.ReplayRunner({
    restoreCheckpoint() {},
    executeSequence() { return {bug_fingerprint: 'bug:different'}; }
  });
  const rejected = await mismatchReplay.confirm({finding_id: 'f3', bug_fingerprint: 'bug:abc', trigger_sequence: [], candidate_seed: 'candidate-3', finding_index: 2}, {replay_deterministic: true});
  assert.strictEqual(rejected.status, 'rejected');
  assert.strictEqual(JSON.stringify(rejected.mismatched_fingerprints), JSON.stringify(['bug:different']));

  const incompleteReplay = new A.ReplayRunner({
    restoreCheckpoint() {},
    executeSequence() { const error = new Error('timeout'); error.code = 'timeout'; throw error; }
  });
  const incomplete = await incompleteReplay.confirm({finding_id: 'f4', bug_fingerprint: 'bug:abc', trigger_sequence: [], candidate_seed: 'candidate-4', finding_index: 3}, {replay_deterministic: true});
  assert.strictEqual(incomplete.status, 'incomplete');

  console.log('anomaly and replay v4 tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
