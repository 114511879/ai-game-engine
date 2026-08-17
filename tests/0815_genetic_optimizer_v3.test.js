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

[
  'evolution/EvolutionProtocols.js',
  'evolution/EvolutionProfiles.js',
  'evolution/SeededPRNG.js',
  'evolution/GeneEncoder.js',
  'evolution/DuplicateDetector.js',
  'evolution/MutationEngine.js',
  'evolution/CrossoverEngine.js',
  'evolution/SelectionEngine.js',
  'evolution/GeneticOptimizer.js'
].forEach(load);

const A = sandbox.AGE;
const profile = A.EvolutionProfiles.resolve('default_ga_v3');
const schema = [
  {name: 'hp', path: 'player.hp', type: 'integer', range: [3, 16], step: 2, mutation_rate: 0.7, importance: 'high'},
  {name: 'gravity', path: 'world.gravity', type: 'number', range: [0.5, 2], step: 0.1, mutation_rate: 0.5},
  {name: 'mode', path: 'mode', type: 'enum', values: ['a', 'b', 'c'], mutation_rate: 0.4},
  {name: 'shield', path: 'shield', type: 'boolean', mutation_rate: 0.3}
];
const vector = [
  {path: 'player.hp', value: 9},
  {path: 'world.gravity', value: 1},
  {path: 'mode', value: 'a'},
  {path: 'shield', value: true}
];

const optimizer = new A.GeneticOptimizer();
const initialOptions = {
  baselineGeneVector: vector,
  geneSchema: schema,
  profile,
  runSeed: 'ga-game1-run1'
};
const initial = optimizer.createInitialPopulation(initialOptions);
assert.strictEqual(initial.generation, 0);
assert.strictEqual(initial.candidates.length, 6);
assert.strictEqual(initial.candidates[0].candidate_id, 'g0-c0');
assert.deepStrictEqual(JSON.parse(JSON.stringify(initial.candidates[0].gene_vector)), vector);
assert.strictEqual(initial.candidates[0].lineage, 'baseline');
assert.strictEqual(initial.candidates[0].candidate_seed, 'ga-game1-run1:g0:c0');
assert(initial.candidates.slice(1).every(candidate => candidate.changes.length >= 1));
assert.deepStrictEqual(initial, optimizer.createInitialPopulation(initialOptions));

const evaluated = initial.candidates.map((candidate, index) => Object.assign({}, candidate, {
  status: 'evaluated',
  fitness_result: {final_fitness: 0.5 + index * 0.05, confidence: {overall: 0.8}}
}));
const nextOptions = {
  generation: 1,
  evaluatedPopulation: evaluated,
  geneSchema: schema,
  profile,
  runSeed: 'ga-game1-run1'
};
const next = optimizer.nextGeneration(nextOptions);
assert.strictEqual(next.generation, 1);
assert.strictEqual(next.candidates.length, 6);
assert.strictEqual(next.candidates.filter(candidate => candidate.lineage === 'elite').length, 2);
assert.deepStrictEqual(
  Array.from(next.candidates.slice(0, 2)).map(candidate => candidate.candidate_id),
  ['g1-c0', 'g1-c1']
);
assert(next.candidates.filter(candidate => candidate.lineage !== 'elite').every(candidate => candidate.generation === 1));
assert(next.candidates.filter(candidate => candidate.lineage !== 'elite').every(candidate => !candidate.fitness_result));
assert(next.stats.generated_attempts >= 4);
assert(next.stats.duplicates_rejected >= 0);
assert.strictEqual(next.stats.reused_candidates, 2);
assert.deepStrictEqual(next, optimizer.nextGeneration(nextOptions));

const narrowProfile = Object.assign({}, profile, {population_size: 3, elite_count: 1});
const narrow = optimizer.createInitialPopulation({
  baselineGeneVector: [{path: 'flag', value: true}],
  geneSchema: [{name: 'flag', path: 'flag', type: 'boolean', mutation_rate: 1}],
  profile: narrowProfile,
  runSeed: 'narrow'
});
assert.strictEqual(narrow.candidates[1].status, 'pending');
assert.strictEqual(narrow.candidates[2].status, 'duplicate_exhausted');
assert.strictEqual(narrow.candidates[2].candidate_seed, 'narrow:g0:c2:retry5');
assert.strictEqual(narrow.stats.duplicates_rejected, 6);
assert.strictEqual(narrow.stats.failed_candidates, 1);
assert.strictEqual(narrow.stats.generated_attempts, 7);

const source = fs.readFileSync(path.join(root, 'evolution/GeneticOptimizer.js'), 'utf8');
['Math.random', '_currentEngine', 'SimulationAgent', 'FinalQA', 'localStorage'].forEach(forbidden => {
  assert(!source.includes(forbidden), forbidden + ' must not appear in GeneticOptimizer');
});

console.log('genetic optimizer v3 tests passed');
