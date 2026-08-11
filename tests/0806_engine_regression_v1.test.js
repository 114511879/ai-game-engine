const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {
  console,
  Date,
  JSON,
  Math,
  setTimeout(fn) { fn(); return 1; },
  clearTimeout() {}
};
sandbox.window = sandbox;
sandbox.document = {
  addEventListener() {},
  getElementById() { return null; }
};
vm.createContext(sandbox);

function load(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInContext(source, sandbox, {filename: file});
}

[
  'core/dsl/Config.js',
  'core/engine/GameStandard.js',
  'core/engine/GameState.js',
  'core/runtime/helpers.js',
  'core/runtime/Collision.js',
  'core/runtime/Enemy.js',
  'core/runtime/Powerup.js',
  'core/runtime/Particle.js',
  'core/runtime/Player.js',
  'core/runtime/Physics.js',
  'core/runtime/Spawner.js',
  'core/runtime/Renderer.js',
  'core/dsl/Rules.js',
  'core/dsl/PhaseManager.js',
  'core/dsl/SkillEngine.js',
  'core/dsl/LevelManager.js',
  'core/dsl/MapSystem.js',
  'core/dsl/AssetSystem.js',
  'core/dsl/BossSystem.js',
  'core/dsl/SkillSystem.js',
  'core/dsl/DSLBinder.js',
  'plugins/rpg/DungeonPlugin.js',
  'core/engine/Engine.js',
  'ai/tester/agent.js'
].forEach(load);

const A = sandbox.AGE;
const generated = {
  meta: {game_type: 'dungeon', title: 'Regression Dungeon'},
  player: {hp: 8},
  rules: {win_condition: 'boss_kill', win_value: 1},
  entities: {
    enemies: [{type: 'spike', speed: 2, spawn_rate: 40, size: 22}],
    boss: {name: 'Final Boss', hp: 400, phase: 3, theme: 'dark'}
  },
  levels: [
    {name: 'Level 1', map: {rooms: [{type: 'enemy'}]}},
    {name: 'Level 2', map: {rooms: [{type: 'treasure'}]}},
    {name: 'Level 3', map: {rooms: [{type: 'boss'}]}}
  ]
};

const dsl = A.DSLBinder.bind(generated, 'dungeon boss');
const bossLevelIndex = dsl.levels.findIndex(level => level.boss);
assert(bossLevelIndex >= 0, 'entities.boss must be attached to a boss level');
assert.strictEqual(dsl.levels[bossLevelIndex].boss.name, 'Final Boss');
assert.strictEqual(dsl.levels[0].boss, null);

function fakeContext() {
  const gradient = {addColorStop() {}};
  return new Proxy({}, {
    get(target, key) {
      if (key === 'createLinearGradient') return () => gradient;
      if (key === 'measureText') return () => ({width: 0});
      if (!(key in target)) target[key] = function() {};
      return target[key];
    },
    set(target, key, value) { target[key] = value; return true; }
  });
}

const canvas = {width: 800, height: 400, getContext: fakeContext};
const engine = new A.GameEngine(canvas);
const legacyDsl = JSON.parse(JSON.stringify(dsl));
legacyDsl.levels[bossLevelIndex].boss = null;
engine.load(legacyDsl, A.DungeonPlugin);
A.setGameState(A.STATE.RUNNING);

let bossAppeared = false;
for (let frame = 0; frame < 7000 && !bossAppeared; frame++) {
  engine.update();
  engine.enemyMgr.enemies.forEach(enemy => { enemy.hp = 0; });
  bossAppeared = !!(engine.bossSystem && engine.bossSystem.hp > 0);
}
assert(bossAppeared, 'clearing dungeon waves must create the configured boss');
assert.strictEqual(engine.bossSystem.name, 'Final Boss');

const usedSkills = [];
const pressedKeys = [];
const agentEngine = {
  _gameType: 'dungeon',
  dsl: {meta: {game_type: 'dungeon'}},
  canvas: {width: 800, height: 400},
  groundY: 330,
  player: {x: 120, y: 300, w: 28, h: 28, hp: 8, isJumping: false, isCharging: false},
  enemyMgr: {enemies: [{x: 300, y: 308, w: 22, h: 22, hp: 2}]},
  powerupMgr: {powerups: []},
  _projectiles: [],
  bossSystem: null,
  gameOver: false,
  _win: false,
  levelMgr: {getLevelIndex() { return 0; }},
  skillSystem: {use(name) { usedSkills.push(name); return true; }},
  plugin: {onAllKeys(_engine, key) { pressedKeys.push(key); }},
  startCharge() { this.player.isCharging = true; },
  releaseJump() { this.player.isCharging = false; this.player.isJumping = true; }
};

const agent = new A.AITestAgent(agentEngine);
agent.start('progress');
agent.update();
agent.update();
assert(usedSkills.includes('fireball'), 'progress mode must attack visible enemies');

agentEngine.player.isJumping = false;
agentEngine.bossSystem = {hp: 350, maxHp: 400, phaseManager: {currentPhase: 2}};
agentEngine._projectiles = [{x: 130, y: 300, w: 10, h: 10, hp: 1, fromBoss: true}];
agent.update();
agent.update();
assert(usedSkills.includes('shield'), 'progress mode must defend against boss projectiles');
assert.strictEqual(agent.generateReport().progress.bossSeen, true);

console.log('engine regression tests passed');
