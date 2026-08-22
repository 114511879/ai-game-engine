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
load('playtest/RewardLedger.js');
load('playtest/ReplayBuffer.js');

const A = sandbox.AGE;

function transition(stratum, id) {
  return {
    transition_id: id,
    state_id: 's-' + id,
    action_id: 'EDGE_PRESSURE',
    reward: stratum === 'confirmed' ? 1 : 0.1,
    next_state_id: 'n-' + id,
    terminal: false,
    trajectory_id: 't-' + id,
    finding_id: stratum === 'confirmed' ? 'f-' + id : null,
    reward_ledger_ref: 'r-' + id,
    source_run_id: 'run-1',
    stratum
  };
}

function run() {
  const ledger = new A.RewardLedger({
    factor_caps: {coverage: 0.2, boundary_state: 0.2, novel_sequence: 0.2, ordinary_movement: 0.1}
  });
  const provisional = ledger.record({
    reward_event_id: 'reward-1',
    event_id: 'event-1',
    finding_id: 'finding-1',
    factor: 'first_anomaly',
    value: 0.2,
    episode_id: 'episode-1',
    trajectory_id: 'trajectory-1',
    bug_fingerprint: 'bug:one'
  });
  assert.strictEqual(provisional.status, 'provisional');
  assert.strictEqual(provisional.original_value, 0.2);

  const finalized = ledger.finalizeFinding('finding-1', {factor: 'confirmed_novel_bug', value: 1});
  assert.strictEqual(finalized.length, 1);
  assert.strictEqual(finalized[0].status, 'finalized');
  assert.strictEqual(finalized[0].confirmed, true);
  assert.strictEqual(finalized[0].original_value, 0.2);
  assert.strictEqual(finalized[0].final_value, 1);

  const rejected = ledger.record({
    reward_event_id: 'reward-2', event_id: 'event-2', finding_id: 'finding-2',
    factor: 'first_anomaly', value: 0.2, episode_id: 'episode-1'
  });
  assert.strictEqual(rejected.status, 'provisional');
  const revoked = ledger.rejectFinding('finding-2', {value: 0});
  assert.strictEqual(revoked[0].status, 'revoked');
  assert.strictEqual(revoked[0].final_value, 0);

  const incomplete = ledger.record({
    reward_event_id: 'reward-3', event_id: 'event-3', finding_id: 'finding-3',
    factor: 'first_anomaly', value: 0.2, episode_id: 'episode-1', status: 'provisional'
  });
  ledger.markIncomplete('finding-3');
  assert.strictEqual(ledger.byFinding('finding-3')[0].status, 'provisional');
  assert.strictEqual(incomplete.finding_id, 'finding-3');

  for (let index = 0; index < 20; index++) {
    ledger.record({reward_event_id: 'coverage-' + index, event_id: 'coverage-' + index, factor: 'coverage', value: 0.1, episode_id: 'episode-2'});
    ledger.record({reward_event_id: 'boundary-' + index, event_id: 'boundary-' + index, factor: 'boundary_state', value: 0.1, episode_id: 'episode-2'});
    ledger.record({reward_event_id: 'sequence-' + index, event_id: 'sequence-' + index, factor: 'novel_sequence', value: 0.1, episode_id: 'episode-2'});
  }
  const shapingTotal = ledger.entries()
    .filter(entry => entry.episode_id === 'episode-2')
    .reduce((sum, entry) => sum + entry.final_value, 0);
  assert(shapingTotal <= 0.6, 'shaping factors must remain independently capped');

  assert.strictEqual(ledger.duplicateReward('bug:known', 1), 1);
  assert.strictEqual(ledger.duplicateReward('bug:known', 1), 0.25);
  assert.strictEqual(ledger.duplicateReward('bug:known', 1), 0.1);
  assert.strictEqual(ledger.duplicateReward('bug:known', 1), 0);

  const buffer = new A.ReplayBuffer({
    max_transitions: 6,
    max_source_runs: 2,
    sample_repetition: {confirmed: 4, negative_evidence: 2, exploration: 1}
  });
  buffer.append(transition('confirmed', 'c1'));
  buffer.append(transition('negative_evidence', 'n1'));
  buffer.append(transition('exploration', 'e1'));
  assert.strictEqual(buffer.append(Object.assign(transition('exploration', 'bad'), {status: 'incomplete'})), false);
  buffer.append(Object.assign(transition('exploration', 'e2'), {source_run_id: 'run-2'}));
  const snapshot = buffer.snapshot();
  snapshot.layers.confirmed[0].reward = 0;
  assert.strictEqual(buffer.all().find(row => row.transition_id === 'c1').reward, 1, 'snapshot must be immutable');
  assert(buffer.all().some(row => row.stratum === 'confirmed'), 'exploration FIFO must not evict confirmed data');

  const trainingRows = buffer.trainingSequence('train-seed-1');
  const counts = trainingRows.reduce((out, row) => {
    out[row.stratum] = (out[row.stratum] || 0) + 1;
    return out;
  }, {});
  assert.strictEqual(counts.confirmed, 4);
  assert.strictEqual(counts.negative_evidence, 2);
  assert.strictEqual(counts.exploration, 2);
  assert.strictEqual(JSON.stringify(trainingRows), JSON.stringify(buffer.trainingSequence('train-seed-1')));

  console.log('reward and replay buffer v4 tests passed');
}

run();
