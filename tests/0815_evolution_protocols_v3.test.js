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
load('evolution/EvolutionProfiles.js');
load('evolution/SeededPRNG.js');

const A = sandbox.AGE;
const P = A.EvolutionProtocols;

assert.strictEqual(P.VERSION, '3.0');
assert.strictEqual(P.fnv1a('hello'), '4f9f2cab');
assert.strictEqual(
  P.scopeHash({variables: [{path: 'player.hp', type: 'integer'}], immutable: ['assets']}),
  P.scopeHash({immutable: ['assets'], variables: [{type: 'integer', path: 'player.hp'}]})
);
assert.strictEqual(
  P.geneFingerprint([{path: 'world.gravity', value: 1}, {path: 'player.hp', value: 8}]),
  P.geneFingerprint([{path: 'player.hp', value: 8}, {path: 'world.gravity', value: 1}])
);

const first = new A.SeededPRNG('ga-game1-run1');
const second = new A.SeededPRNG('ga-game1-run1');
assert.deepStrictEqual(
  [first.next(), first.next(), first.next()],
  [second.next(), second.next(), second.next()]
);
assert.notDeepStrictEqual(
  Array.from(new A.SeededPRNG('a').sample([1, 2, 3, 4], 2)),
  Array.from(new A.SeededPRNG('b').sample([1, 2, 3, 4], 2))
);

const profile = A.EvolutionProfiles.resolve('default_ga_v3');
assert.strictEqual(profile.population_size, 6);
assert.strictEqual(profile.elite_count, 2);
assert.strictEqual(profile.max_generations, 3);
assert.strictEqual(profile.max_candidates, 18);
assert.strictEqual(profile.episodes_per_candidate, 1);
assert.strictEqual(profile.max_mutated_variables, 5);
assert.deepStrictEqual(Array.from(profile.supported_types), ['integer', 'number', 'enum', 'boolean']);
assert.throws(
  () => A.EvolutionProfiles.register('bad', {population_size: 2, elite_count: 2}),
  /invalid_evolution_profile/
);

const copy = A.EvolutionProfiles.resolve('default_ga_v3');
copy.population_size = 100;
assert.strictEqual(A.EvolutionProfiles.resolve('default_ga_v3').population_size, 6);

console.log('evolution protocols v3 tests passed');
