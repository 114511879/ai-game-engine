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

load('playtest/CanonicalStateSerializer.js');
load('playtest/GameTypeStateAdapter.js');
load('playtest/CoreStateEncoder.js');
load('playtest/MacroActionSchema.js');

const A = sandbox.AGE;

function snapshot(overrides) {
  return Object.assign({
    position_region: 'center',
    velocity_x: -2.4,
    velocity_y: 0.2,
    health: 7,
    collision_state: 'wall',
    boundary_state: 'inside',
    nearest_enemy_distance: 48.2,
    movement_state: 'moving',
    game_phase: 'active',
    grounded: true,
    recent_damage: false,
    recent_failure: false,
    x: 10.01
  }, overrides || {});
}

function run() {
  const adapter = new A.GameTypeStateAdapter({
    id: 'runner-v1',
    encode() {
      return {z_platform: 'edge', a_jump_phase: 'ground'};
    }
  });
  const encoder = new A.CoreStateEncoder();
  const first = encoder.encode(snapshot(), adapter);
  const second = encoder.encode(snapshot({x: 999.99, velocity_x: -2.9}), adapter);

  assert.strictEqual(typeof first.state_id, 'string');
  assert(first.state_id.indexOf('state:') === 0);
  assert.strictEqual(first.state_id, second.state_id, 'bucketed semantic state must ignore exact continuous values');
  assert.strictEqual(first.vector['core.position_region'], 'center');
  assert.strictEqual(first.vector['core.collision_state'], 'wall');
  assert.strictEqual(first.vector['core.unknown_extra'], undefined);
  assert.strictEqual(first.vector['adapter.a_jump_phase'], 'ground');
  assert.strictEqual(first.vector['adapter.z_platform'], 'edge');
  assert(!first.state_id.includes('10.01'), 'raw coordinates must not enter state_id');

  const unknown = encoder.encode(snapshot({nearest_enemy_distance: undefined}), adapter);
  assert.strictEqual(unknown.vector['core.nearest_enemy_distance'], 'unknown');

  assert.throws(() => new A.GameTypeStateAdapter({
    id: 'too-wide',
    encode() {
      return {a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7};
    }
  }).encode(snapshot()), /adapter_feature_budget_exceeded/);

  const action = {
    action_id: 'JUMP_FORWARD',
    duration_frames: 8,
    requires: ['jump'],
    precondition: {field: 'grounded', equals: true},
    sequence: [{frames: 8, inputs: {right: true, jump: true}}]
  };
  assert.strictEqual(A.MacroActionSchema.validate(action, {jump: true}, {grounded: true}).valid, true);

  const unavailable = A.MacroActionSchema.validate(action, {jump: false}, {grounded: true});
  assert(unavailable.findings.some(finding => finding.code === 'capability_unavailable'));

  const precondition = A.MacroActionSchema.validate(action, {jump: true}, {grounded: false});
  assert(precondition.findings.some(finding => finding.code === 'precondition_failed'));

  const random = A.MacroActionSchema.validate(Object.assign({}, action, {random: true}), {jump: true}, {grounded: true});
  assert(random.findings.some(finding => finding.code === 'macro_randomness_forbidden'));

  const dynamic = A.MacroActionSchema.validate(Object.assign({}, action, {sequence: function() {}}), {jump: true}, {grounded: true});
  assert(dynamic.findings.some(finding => finding.code === 'runtime_action_generation_forbidden'));

  const tooLong = A.MacroActionSchema.validate(Object.assign({}, action, {duration_frames: 121}), {jump: true}, {grounded: true});
  assert(tooLong.findings.some(finding => finding.code === 'macro_duration_invalid'));

  console.log('state and action v4 tests passed');
}

run();
