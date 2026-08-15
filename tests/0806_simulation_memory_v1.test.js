const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const data = {age_conversations_v10: 'keep'};
const storage = {
  getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
  setItem(key, value) { data[key] = String(value); },
  removeItem(key) { delete data[key]; }
};
const sandbox = {console, JSON, Math, Date, isFinite};
sandbox.window = sandbox;
sandbox.AGE = {};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
}

load('ai/protocols/AgentProtocols.js');
load('ai/simulation/SimulationMemory.js');
load('ai/simulation/SimulationAgent.js');

const memory = new sandbox.AGE.SimulationMemory(storage);
memory.append({
  run_id: 'run-1', game_id: 'game-1', version_id: 'v1', parent_version: null,
  persona: 'new_player', changes: [], evaluation: {death_rate: 0.67}, created_at: 1
});
memory.append({
  run_id: 'run-2', game_id: 'game-1', version_id: 'v2', parent_version: 'v1',
  persona: 'new_player', changes: ['boss_damage -20%'], evaluation: {death_rate: 0.40},
  fitness: {schema_version: '2.0', final_fitness: 0.78, confidence: {overall: 0.88}}, created_at: 2
});

assert.deepStrictEqual(Array.from(memory.history('game-1', 'new_player')).map(row => row.version_id), ['v1', 'v2']);
assert.strictEqual(memory.history('game-1', 'new_player')[1].parent_version, 'v1');
assert.strictEqual(memory.history('game-1', 'new_player')[1].fitness.final_fitness, 0.78);
assert.strictEqual(Object.prototype.hasOwnProperty.call(memory.history('game-1', 'new_player')[0], 'fitness'), false);
assert.strictEqual(memory.trend('game-1', 'new_player', 'death_rate').delta, -0.27);
assert.strictEqual(data.age_conversations_v10, 'keep');

data.age_simulation_memory_v1 = JSON.stringify([{broken: true}, {run_id: 'ok', game_id: 'g', version_id: 'v'}]);
assert.strictEqual(memory.all().length, 1, 'corrupt records must be isolated');
data.age_simulation_memory_v1 = '{invalid';
assert.deepStrictEqual(Array.from(memory.all()), []);
assert.strictEqual(data.age_conversations_v10, 'keep');

async function run() {
  const episodeSeeds = [];
  const agent = new sandbox.AGE.SimulationAgent({
    async episodeRunner(_engine, persona, index, options) {
      episodeSeeds.push(options.seed);
      return {
        persona,
        play_time: 100 + index,
        death: index === 0,
        completed: index > 0,
        coverage: 0.5 + index * 0.1,
        engagement_proxy: 6 + index,
        bugs: index === 0 ? [{code: 'stuck'}] : []
      };
    }
  });
  const evaluation = await agent.run({}, {persona: 'new_player', episodes: 3, simulation_id: 'sim-1', seed: 'candidate', deterministic: true});
  assert.strictEqual(evaluation.schema_version, '1.0');
  assert.strictEqual(evaluation.episodes, 3);
  assert.strictEqual(evaluation.metrics.death_rate, 1 / 3);
  assert.strictEqual(evaluation.metrics.completion_rate, 2 / 3);
  assert.strictEqual(evaluation.bugs.length, 1);
  assert(evaluation.reward > 0);
  assert.strictEqual(evaluation.simulation_deterministic, true);
  assert.deepStrictEqual(episodeSeeds, ['candidate:episode0', 'candidate:episode1', 'candidate:episode2']);

  await assert.rejects(
    () => agent.run({}, {signal: {aborted: true}}),
    error => error && error.name === 'AbortError'
  );

  let observedEngine = null;
  sandbox.AGE.AITestAgent = function(engine) {
    this.eng = engine;
    this.frame = 0;
    this.maxFrames = 1;
    this._active = false;
    this._done = true;
  };
  sandbox.AGE.AITestAgent.prototype.start = function() {};
  sandbox.AGE.AITestAgent.prototype.stop = function() {};
  sandbox.AGE.AITestAgent.prototype.generateReport = function() {
    return {survivalTime: 0, totalActions: 0, progress: {maxLevel: 0}, endState: {gameOver: false, win: true}};
  };
  sandbox.AGE.GameObserver = function(engine) {
    observedEngine = engine;
  };
  sandbox.AGE.GameObserver.prototype.start = function() {};
  sandbox.AGE.GameObserver.prototype.stop = function() {};
  sandbox.AGE.GameObserver.prototype.update = function() {};
  sandbox.AGE.AnomalyDetector = function() {};
  sandbox.AGE.AnomalyDetector.prototype.start = function() {};
  sandbox.AGE.AnomalyDetector.prototype.stop = function() {};
  sandbox.AGE.AnomalyDetector.prototype.update = function() {};
  sandbox.AGE.AnomalyDetector.prototype.generateReport = function() { return {anomalies: []}; };
  const engine = {gameOver: false, _win: true, playTester: null, dsl: {levels: []}};
  await new sandbox.AGE.SimulationAgent().runEngineEpisode(engine, 'new_player', 0, {maxFrames: 1});
  assert.strictEqual(observedEngine, engine, 'GameObserver must observe the simulated Engine');
  console.log('simulation memory tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
