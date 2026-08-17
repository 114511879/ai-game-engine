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
load('evolution/GeneEncoder.js');
load('evolution/MutationEngine.js');
load('evolution/CrossoverEngine.js');
load('evolution/SelectionEngine.js');

const A = sandbox.AGE;
const schema = [
  {name: 'hp', path: 'player.hp', type: 'integer', range: [3, 16], step: 2, mutation_rate: 1, importance: 'high'},
  {name: 'gravity', path: 'world.gravity', type: 'number', range: [0.5, 2], step: 0.1, mutation_rate: 1},
  {name: 'mode', path: 'mode', type: 'enum', values: ['a', 'b', 'c'], mutation_rate: 1},
  {name: 'shield', path: 'shield', type: 'boolean', mutation_rate: 1}
];
const vector = [
  {path: 'player.hp', value: 9},
  {path: 'world.gravity', value: 1},
  {path: 'mode', value: 'a'},
  {path: 'shield', value: true}
];

const mutation = new A.MutationEngine();
const first = mutation.mutate(vector, schema, {seed: 'run:g0:c1', max_mutated_variables: 3});
const second = mutation.mutate(vector, schema, {seed: 'run:g0:c1', max_mutated_variables: 3});
assert.deepStrictEqual(first, second);
assert.strictEqual(first.changes.length, 3);
assert.strictEqual(first.applied_mutations, 3);
assert.strictEqual(first.triggered_genes, 4);
assert(first.gene_vector.find(gene => gene.path === 'player.hp').value % 2 === 1, 'integer grid must anchor at 3');
assert.notStrictEqual(first.gene_vector.find(gene => gene.path === 'mode').value, 'a');
assert.deepStrictEqual(vector.map(gene => gene.value), [9, 1, 'a', true], 'parent vector must remain immutable');

const zeroRates = schema.map(gene => Object.assign({}, gene, {mutation_rate: 0}));
const forced = mutation.mutate(vector, zeroRates, {seed: 'forced', max_mutated_variables: 5});
assert.strictEqual(forced.changes.length, 1);
assert.strictEqual(forced.triggered_genes, 0);
assert.strictEqual(forced.applied_mutations, 1);

const boundary = mutation.mutate(
  [{path: 'player.hp', value: 3}],
  [{name: 'hp', path: 'player.hp', type: 'integer', range: [3, 7], step: 2, mutation_rate: 1}],
  {seed: 'boundary', max_mutated_variables: 1}
);
assert.strictEqual(boundary.gene_vector[0].value, 5, 'boundary mutation must reverse direction instead of doing nothing');

const crossover = new A.CrossoverEngine();
const crossedA = crossover.cross(vector, first.gene_vector, {seed: 'cross'});
const crossedB = crossover.cross(vector, first.gene_vector, {seed: 'cross'});
assert.deepStrictEqual(crossedA, crossedB);
crossedA.forEach(gene => {
  const allowed = [
    vector.find(parentGene => parentGene.path === gene.path).value,
    first.gene_vector.find(parentGene => parentGene.path === gene.path).value
  ];
  assert(allowed.includes(gene.value));
});

const population = [
  {candidate_id: 'c2', fitness: {final_fitness: 0.8, confidence: {overall: 0.9}}, changes: [1, 2]},
  {candidate_id: 'c1', fitness: {final_fitness: 0.8, confidence: {overall: 0.9}}, changes: [1]},
  {candidate_id: 'c3', fitness: {final_fitness: 0.7, confidence: {overall: 1}}, changes: []}
];
const selection = new A.SelectionEngine();
assert.strictEqual(selection.sort(population)[0].candidate_id, 'c1');
assert.deepStrictEqual(
  selection.tournament(population, {seed: 't', size: 3}),
  selection.tournament(population, {seed: 't', size: 3})
);
const elites = selection.elites(population, 2);
assert.deepStrictEqual(Array.from(elites).map(candidate => candidate.candidate_id), ['c1', 'c2']);
elites[0].changes.push('mutated');
assert.strictEqual(population[1].changes.length, 1, 'elite copies must not mutate the prior generation');

console.log('genetic operators v3 tests passed');
