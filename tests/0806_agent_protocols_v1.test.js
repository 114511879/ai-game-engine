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

load('fitness/types.js');
load('ai/protocols/AgentProtocols.js');
load('core/dsl/Config.js');
load('core/engine/GameStandard.js');
load('ai/intent/IntentParserAgent.js');
load('ai/quality/PreQAValidator.js');
load('ai/quality/ConstraintEngine.js');

const P = sandbox.AGE.AgentProtocols;
const proposal = P.agentProposal({
  task_id: 'combat-1',
  agent: 'CombatAgent',
  proposal: {style: 'souls_like'},
  confidence: 0.9
});

assert.strictEqual(P.validateProposal(proposal).valid, true);
assert.strictEqual(P.validateProposal({agent: 'CombatAgent'}).valid, false);
assert.strictEqual(P.agentContext({agent: 'CombatAgent', offline: true}).offline, true);
assert.strictEqual(P.evaluationResult({persona: 'new_player'}).metrics.death_rate, 0);
assert.strictEqual(proposal.schema_version, '1.0');
assert.deepStrictEqual(Array.from(proposal.risks), []);
assert.strictEqual(P.gameBlueprint({request_id: 'request-1'}).request_id, 'request-1');
const fitness = P.fitnessResult({
  fitness_id: 'fitness-game-1-v2', game_id: 'game-1', version_id: 'v2',
  scores: {fun_proxy: 2, playability: 0.8},
  final_fitness: 1.5,
  confidence: {overall: 0.7, novelty: 0.3}
});
assert.strictEqual(fitness.schema_version, '2.0');
assert.strictEqual(fitness.scores.fun_proxy, 1);
assert.strictEqual(fitness.final_fitness, 1);
assert.strictEqual(fitness.confidence.novelty, 0.3);

const badBoss = P.agentProposal({
  task_id: 'combat-2',
  agent: 'CombatAgent',
  confidence: 0.9,
  proposal: {player_hp: 100, boss: {damage: 1000}}
});
const preqa = new sandbox.AGE.PreQAValidator().validate([badBoss]);
assert(preqa.findings.some(finding => finding.code === 'boss_one_shot_risk'));
const missingDependency = P.agentProposal({
  task_id: 'designer-2',
  agent: 'DesignerAgent',
  confidence: 0.8,
  proposal: {core_loop: []},
  dependencies: ['EconomyAgent']
});
const dependencyQA = new sandbox.AGE.PreQAValidator().validate([missingDependency]);
assert(dependencyQA.findings.some(finding => finding.code === 'missing_dependency'));

const constraintEngine = new sandbox.AGE.ConstraintEngine();
const first = constraintEngine.evaluate(
  {game_type: 'action_rpg', combat: {difficulty: 'hard'}},
  [badBoss]
);
const second = constraintEngine.evaluate(
  {game_type: 'action_rpg', combat: {difficulty: 'hard'}},
  [badBoss]
);
assert.deepStrictEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
assert(first.decisions.every(decision => decision.rule_id && decision.path));
assert(first.decisions.some(decision => decision.rule_id === 'HARD_MODE_TUTORIAL'));

console.log('agent protocol tests passed');
