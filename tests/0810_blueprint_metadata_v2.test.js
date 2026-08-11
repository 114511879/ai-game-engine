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

load('ai/evaluation/BlueprintMetadata.js');

const blueprint = {
  request_id: 'game-1',
  gameplay: {
    mechanics: ['Dodge Combat', 'Skill Tree', 'dodge_combat'],
    interactions: ['fire_oil', 'ice_water', 'parry_counter'],
    level_structure: {type: 'branching', exploration_depth: 0.72}
  },
  world: {theme: 'dark_fantasy', tags: ['soulslike']},
  balance: {
    combat: {
      enemy_types: ['knight', 'mage', 'beast'],
      boss: {patterns: ['slash', 'charge', 'phase_shift']}
    }
  }
};
const dsl = {
  meta: {version_id: 'v3'},
  levels: [{id: 1}, {id: 2}],
  skills: [{name: 'parry'}, {name: 'fireball'}, {name: 'dash'}],
  enemies: [{type: 'knight'}, {type: 'mage'}, {type: 'knight'}]
};
const intent = {request_id: 'game-1', theme: {world: 'dark_fantasy'}};

const metadata = sandbox.AGE.BlueprintMetadata.fromBlueprint(blueprint, dsl, intent);
assert.strictEqual(metadata.game_id, 'game-1');
assert.strictEqual(metadata.version_id, 'v3');
assert.deepStrictEqual(Array.from(metadata.mechanics), ['dodge_combat', 'skill_tree']);
assert.strictEqual(metadata.level_structure.type, 'branching');
assert.strictEqual(metadata.level_structure.size, 'small');
assert.strictEqual(metadata.level_structure.exploration_depth, 0.72);
assert.strictEqual(metadata.enemy_features.enemy_types, 3);
assert.strictEqual(metadata.enemy_features.boss_patterns, 3);
assert.strictEqual(metadata.skill_features.skill_count, 3);
assert.strictEqual(metadata.skill_features.interaction_count, 3);
assert.deepStrictEqual(Array.from(metadata.theme_tags), ['dark_fantasy', 'soulslike']);

const repeated = sandbox.AGE.BlueprintMetadata.fromBlueprint(blueprint, dsl, intent);
assert.deepStrictEqual(JSON.parse(JSON.stringify(repeated)), JSON.parse(JSON.stringify(metadata)));

const sparse = sandbox.AGE.BlueprintMetadata.fromBlueprint({request_id: 'game-2'}, {}, {});
assert.strictEqual(sparse.game_id, 'game-2');
assert.strictEqual(Object.prototype.hasOwnProperty.call(sparse, 'mechanics'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(sparse, 'enemy_features'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(sparse, 'skill_features'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(sparse, 'theme_tags'), false);

console.log('blueprint metadata v2 tests passed');
