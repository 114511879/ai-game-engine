const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {console, JSON, Math, Date, isFinite, Promise, AbortController, setTimeout, clearTimeout};
sandbox.window = sandbox;
sandbox.AGE = {};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
}

load('playtest/EpisodeTracker.js');
load('playtest/MacroActionExecutor.js');

const A = sandbox.AGE;

async function run() {
  const tracker = new A.EpisodeTracker({
    max_macro_transitions: 40,
    max_simulation_ticks: 1200,
    no_progress_transition_limit: 8,
    wall_clock_timeout_ms: 120000,
    clock: () => 1000
  });
  tracker.start({state_id: 's0', progress_signature: 'p0'});
  let result;
  for (let index = 0; index < 7; index++) {
    result = tracker.recordTransition({
      state_id: 's0', events: [], finding_ids: [], progress_signature: 'p0', simulation_ticks: 1
    });
    assert.strictEqual(result.status, 'running');
  }
  result = tracker.recordTransition({
    state_id: 's0', events: [], finding_ids: [], progress_signature: 'p0', simulation_ticks: 1
  });
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(result.termination_reason, 'no_progress');

  const resetTracker = new A.EpisodeTracker({no_progress_transition_limit: 3, clock: () => 1000});
  resetTracker.start({state_id: 's0', progress_signature: 'p0'});
  resetTracker.recordTransition({state_id: 's0', events: [], finding_ids: [], progress_signature: 'p0'});
  resetTracker.recordTransition({state_id: 's0', events: [], finding_ids: [], progress_signature: 'p0'});
  result = resetTracker.recordTransition({state_id: 's0', events: ['collision'], finding_ids: [], progress_signature: 'p0'});
  assert.strictEqual(result.status, 'running');
  assert.strictEqual(result.no_progress_transitions, 0);

  const terminal = new A.EpisodeTracker({clock: () => 1000});
  terminal.start({state_id: 's0', progress_signature: 'p0'});
  result = terminal.recordTransition({state_id: 's1', events: [], finding_ids: [], progress_signature: 'p1', terminal: 'death'});
  assert.strictEqual(result.status, 'completed');
  assert.strictEqual(result.termination_reason, 'death');

  const tickBound = new A.EpisodeTracker({max_simulation_ticks: 2, clock: () => 1000});
  tickBound.start({state_id: 's0', progress_signature: 'p0'});
  result = tickBound.recordTransition({state_id: 's1', events: [], finding_ids: [], progress_signature: 'p1', simulation_ticks: 2});
  assert.strictEqual(result.termination_reason, 'simulation_tick_budget');

  const calls = [];
  const executor = new A.MacroActionExecutor({
    inputDriver: {
      apply(inputs, frames) { calls.push('apply:' + frames + ':' + Object.keys(inputs).sort().join(',')); },
      releaseAllInputs() { calls.push('release'); }
    }
  });
  await executor.execute({
    action_id: 'EDGE_PRESSURE',
    duration_frames: 5,
    sequence: [
      {frames: 2, inputs: {right: true}},
      {frames: 3, inputs: {right: true, jump: true}}
    ]
  }, {});
  assert.deepStrictEqual(calls, ['apply:2:right', 'apply:3:jump,right', 'release']);

  const errorCalls = [];
  const failing = new A.MacroActionExecutor({
    inputDriver: {
      apply() { errorCalls.push('apply'); throw new Error('input failed'); },
      releaseAllInputs() { errorCalls.push('release'); }
    }
  });
  await assert.rejects(() => failing.execute({action_id: 'FAIL', duration_frames: 1, sequence: [{frames: 1, inputs: {}}]}, {}), /input failed/);
  assert.deepStrictEqual(errorCalls, ['apply', 'release']);

  const cancelledCalls = [];
  const controller = new AbortController();
  controller.abort();
  const cancelled = new A.MacroActionExecutor({
    inputDriver: {
      apply() { cancelledCalls.push('apply'); },
      releaseAllInputs() { cancelledCalls.push('release'); }
    }
  });
  await assert.rejects(() => cancelled.execute({action_id: 'CANCEL', duration_frames: 1, sequence: [{frames: 1, inputs: {}}]}, {signal: controller.signal}), /aborted|cancelled/i);
  assert.deepStrictEqual(cancelledCalls, ['release']);

  console.log('episode v4 tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
