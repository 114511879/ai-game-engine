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
load('evolution/GeneSchemaValidator.js');
load('evolution/OptimizationSchemaBuilder.js');

const A = sandbox.AGE;
const baseline = {
  meta: {game_type: 'runner', game_id: 'game-1'},
  player: {hp: 9, speed: 3, jump_power: -12},
  world: {gravity: 1, scroll_speed: 5},
  skills: [{cooldown: 30}],
  assets: {characters: []}
};
const schema = {
  immutable: ['assets', 'meta.game_id'],
  variables: [
    {name: 'hp', path: 'player.hp', type: 'integer', range: [3, 16], step: 2, mutation_rate: 0.1, importance: 'high'},
    {name: 'gravity', path: 'world.gravity', type: 'number', range: [0.5, 2], step: 0.1, mutation_rate: 0.2, importance: 'medium'},
    {name: 'mode', path: 'meta.game_type', type: 'enum', values: ['runner', 'dungeon'], mutation_rate: 0.1},
    {name: 'missing', path: 'player.missing', type: 'boolean', mutation_rate: 0.1},
    {name: 'asset_parent', path: 'assets', type: 'boolean', mutation_rate: 0.1}
  ]
};

const result = new A.GeneSchemaValidator().validate(baseline, schema);
assert.deepStrictEqual(Array.from(result.valid_genes).map(gene => gene.name), ['hp', 'gravity', 'mode']);
assert.strictEqual(result.status, 'valid');
assert(result.findings.some(finding => finding.code === 'GENE_PATH_MISSING'));
assert(result.findings.some(finding => finding.code === 'GENE_IMMUTABLE_CONFLICT'));

const outOfRange = new A.GeneSchemaValidator().validate(
  {player: {hp: 17}},
  {variables: [{name: 'hp', path: 'player.hp', type: 'integer', range: [3, 16], step: 1, mutation_rate: 0.1}], immutable: []}
);
assert(outOfRange.findings.some(finding => finding.code === 'GENE_BASELINE_OUT_OF_RANGE'));

const ancestorConflict = new A.GeneSchemaValidator().validate(
  {player: {hp: 8}},
  {variables: [{name: 'player', path: 'player', type: 'boolean', mutation_rate: 0.1}], immutable: ['player.hp']}
);
assert(ancestorConflict.findings.some(finding => finding.code === 'GENE_IMMUTABLE_CONFLICT'));

const invalid = new A.GeneSchemaValidator().validate(
  {value: 4, flag: 1, mode: 'missing'},
  {immutable: [], variables: [
    {name: 'value', path: 'value', type: 'integer', range: [0, 10], step: 3, mutation_rate: 2},
    {name: 'value', path: 'flag', type: 'boolean', mutation_rate: 0.1},
    {name: 'mode', path: 'mode', type: 'enum', values: ['a', 'a'], mutation_rate: 0.1}
  ]}
);
assert(invalid.findings.some(finding => finding.code === 'GENE_MUTATION_RATE_INVALID'));
assert(invalid.findings.some(finding => finding.code === 'GENE_NAME_DUPLICATE'));
assert(invalid.findings.some(finding => finding.code === 'GENE_ENUM_VALUES_INVALID'));
assert.strictEqual(invalid.status, 'no_valid_genes');

const offGrid = new A.GeneSchemaValidator().validate(
  {value: 4},
  {immutable: [], variables: [{name: 'value', path: 'value', type: 'integer', range: [0, 10], step: 3, mutation_rate: 0.1}]}
);
assert(offGrid.findings.some(finding => finding.code === 'GENE_BASELINE_OFF_GRID'));

const floatNoise = new A.GeneSchemaValidator().validate(
  {value: 0.30000000000000004},
  {immutable: [], variables: [{name: 'value', path: 'value', type: 'number', range: [0, 1], step: 0.1, mutation_rate: 0.1}]}
);
assert.strictEqual(floatNoise.valid_genes.length, 1);

const built = A.OptimizationSchemaBuilder.build(baseline, {engine_capability_version: '1.0'});
assert(built.variables.some(variable => variable.path === 'player.hp'));
assert(built.variables.some(variable => variable.path === 'skills.0.cooldown'));
assert(built.variables.every(variable => A.EvolutionProtocols.getPath(baseline, variable.path) !== undefined));
assert.strictEqual(built.target, 'maximize_final_fitness');
assert.strictEqual(built.builder_version, '3.0');
assert.deepStrictEqual(Array.from(built.immutable), ['meta.game_id', 'meta.engine_version', 'assets']);

const builtAgain = A.OptimizationSchemaBuilder.build(baseline, {engine_capability_version: '1.0'});
assert.strictEqual(A.EvolutionProtocols.canonical(built), A.EvolutionProtocols.canonical(builtAgain));

console.log('gene schema v3 tests passed');
