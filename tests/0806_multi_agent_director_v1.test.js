const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {console, JSON, Math, Date, Promise, isFinite};
sandbox.window = sandbox;
sandbox.AGE = {};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
}

load('ai/protocols/AgentProtocols.js');
load('ai/agents/BaseAgent.js');
load('ai/agents/DesignerAgent.js');
load('ai/agents/LevelAgent.js');
load('ai/agents/CombatAgent.js');
load('ai/agents/StoryAgent.js');
load('ai/agents/EconomyAgent.js');
load('ai/agents/AssetAgent.js');
load('ai/agents/AgentRegistry.js');
load('ai/research/ContextRouter.js');
load('core/dsl/Config.js');
load('core/engine/GameStandard.js');
load('ai/intent/IntentParserAgent.js');
load('ai/quality/PreQAValidator.js');
load('ai/quality/ConstraintEngine.js');
load('ai/quality/FinalQA.js');
load('ai/director/DirectorAgent.js');

async function run() {
  const A = sandbox.AGE;
  const calls = [];
  const client = {
    async retrieve(query) {
      calls.push(query);
      return {
        documents: [{title: query, content: 'knowledge', metadata: {url: 'https://example.test/' + calls.length}}],
        coverage: 0.8,
        plan: {limitations: ['side_scroll_only']}
      };
    }
  };

  const router = new A.ContextRouter({client});
  const contexts = await router.route(
    {game_type: 'action_rpg', theme: {world: 'dark_fantasy'}, combat: {style: 'souls_like'}},
    ['CombatAgent', 'LevelAgent']
  );

  assert.strictEqual(calls.length, 2);
  assert.notStrictEqual(calls[0], calls[1]);
  assert.strictEqual(contexts.CombatAgent.agent, 'CombatAgent');
  assert.strictEqual(contexts.LevelAgent.coverage, 0.8);
  assert.strictEqual(contexts.CombatAgent.citations.length, 1);

  const offlineRouter = new A.ContextRouter({
    client: {async retrieve() { return {available: false, error: 'offline'}; }}
  });
  const offline = await offlineRouter.route({game_type: 'runner'}, ['DesignerAgent']);
  assert.strictEqual(offline.DesignerAgent.offline, true);
  assert.strictEqual(offline.DesignerAgent.coverage, 0);
  assert(offline.DesignerAgent.limitations.includes('offline'));

  const registry = new A.AgentRegistry();
  assert.deepStrictEqual(Array.from(registry.rolesFor({game_type: 'runner'})), [
    'DesignerAgent', 'LevelAgent', 'CombatAgent'
  ]);
  assert(registry.rolesFor({game_type: 'story'}).includes('StoryAgent'));
  assert(registry.rolesFor({game_type: 'simulation'}).includes('EconomyAgent'));
  assert(registry.rolesFor({game_type: 'dungeon', theme: {world: 'dark_fantasy'}}).includes('AssetAgent'));

  const combat = registry.create('CombatAgent', {
    ai: async function() { return {proposal: {style: 'melee'}, confidence: 0.8}; }
  });
  const combatResult = await combat.run(
    {task_id: 'combat-1', intent: {combat: {difficulty: 'hard'}}},
    A.AgentProtocols.agentContext({agent: 'CombatAgent'})
  );
  assert.strictEqual(A.AgentProtocols.validateProposal(combatResult).valid, true);
  assert.strictEqual(combatResult.proposal.style, 'melee');

  const fallback = await registry.create('DesignerAgent', {ai: null}).run(
    {task_id: 'designer-1', intent: {}},
    A.AgentProtocols.agentContext({agent: 'DesignerAgent', offline: true})
  );
  assert.strictEqual(fallback.status, 'fallback');
  assert(fallback.confidence <= 0.35);

  const started = [];
  const statuses = [];
  const fakeRegistry = {
    rolesFor() { return ['DesignerAgent', 'LevelAgent', 'CombatAgent']; },
    create(role) {
      return {
        async run(task) {
          started.push(role);
          assert.strictEqual(task.intent.research, undefined, 'experts must only receive routed AgentContext');
          if(role === 'LevelAgent') throw new Error('level failed');
          await Promise.resolve();
          return A.AgentProtocols.agentProposal({
            task_id: task.task_id,
            agent: role,
            confidence: 0.8,
            proposal: {role}
          });
        }
      };
    }
  };
  const fakeRouter = {
    async route(_intent, roles) {
      const result = {};
      roles.forEach(role => { result[role] = A.AgentProtocols.agentContext({agent: role}); });
      return result;
    }
  };
  const director = new A.DirectorAgent({
    registry: fakeRegistry,
    router: fakeRouter,
    ai: null,
    onStatus(stage) { statuses.push(stage); }
  });
  const design = await director.design({
    schema_version: '1.0', request_id: 'request-1', game_type: 'runner',
    research: {context_text: 'generic context must not reach experts'}
  }, 'run game');

  assert.deepStrictEqual(Array.from(started), ['DesignerAgent', 'LevelAgent', 'CombatAgent']);
  assert.strictEqual(design.success, true);
  assert(design.proposals.some(proposal => proposal.agent === 'LevelAgent' && proposal.status === 'fallback'));
  assert.strictEqual(design.blueprint.schema_version, '1.0');
  assert.deepStrictEqual(Array.from(statuses), ['context', 'experts', 'preqa', 'synthesis']);
  assert(design.trace.some(entry => entry.stage === 'experts'));

  const missingIntent = await director.design({game_type: 'runner'}, 'run game');
  assert.strictEqual(missingIntent.success, false);
  assert.strictEqual(missingIntent.error, 'confirmed_intent_required');

  const blockedRegistry = {
    rolesFor() { return ['DesignerAgent']; },
    create() {
      return {
        async run(task) {
          return A.AgentProtocols.agentProposal({
            task_id: task.task_id,
            agent: 'DesignerAgent',
            confidence: 0.8,
            proposal: {core_loop: []},
            dependencies: ['EconomyAgent']
          });
        }
      };
    }
  };
  const blockedDirector = new A.DirectorAgent({registry: blockedRegistry, router: fakeRouter, ai: null});
  const blocked = await blockedDirector.design({
    schema_version: '1.0', request_id: 'request-blocked', game_type: 'runner'
  }, 'run game');
  assert.strictEqual(blocked.success, false);
  assert.strictEqual(blocked.error, 'preqa_blocked');

  const finalQA = new A.FinalQA({ai: null});
  const invalidAdmission = await finalQA.admit(
    {meta: {game_type: 'dungeon'}, player: {hp: 0}, rules: {}},
    {game_type: 'action_rpg'},
    {gameplay: {}}
  );
  assert.strictEqual(invalidAdmission.admitted, false);
  const validDsl = {
    meta: {game_type: 'runner', title: 'Run'},
    player: {hp: 3},
    rules: {win_condition: 'survive_time'}
  };
  const validAdmission = await finalQA.admit(validDsl, {game_type: 'runner'}, {gameplay: {}});
  assert.strictEqual(validAdmission.admitted, true);

  const semanticQA = new A.FinalQA({
    ai: async function() {
      return {findings: [{severity: 'error', code: 'blueprint_mismatch', path: 'rules'}]};
    }
  });
  const semanticAdmission = await semanticQA.admit(validDsl, {game_type: 'runner'}, {gameplay: {}});
  assert.strictEqual(semanticAdmission.admitted, false);

  const appHtml = fs.readFileSync(path.join(root, 'AI-ENGINE启动.html'), 'utf8');
  const gameHtml = fs.readFileSync(path.join(root, 'game.html'), 'utf8');
  function before(html, first, second) {
    const firstIndex = html.indexOf(first);
    const secondIndex = html.indexOf(second);
    return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
  }
  assert(before(appHtml, 'ai/protocols/AgentProtocols.js', 'ai/intent/IntentParserAgent.js'));
  assert(before(appHtml, 'ai/intent/IntentParserAgent.js', 'ai/consultant/GameConsultant.js'));
  assert(before(appHtml, 'ai/research/RAGClient.js', 'ai/research/ContextRouter.js'));
  assert(before(appHtml, 'ai/research/ContextRouter.js', 'ai/director/DirectorAgent.js'));
  assert(before(appHtml, 'ai/director/DirectorAgent.js', 'ai/director/GameDirector.js'));
  assert(before(appHtml, 'ai/simulation/SimulationAgent.js', 'ai/director/GameDirector.js'));
  ['fitness/types.js', 'fitness/WeightProfile.js', 'fitness/MetricsNormalizer.js', 'fitness/PenaltyCalculator.js', 'fitness/FitnessCalculator.js'].forEach(file => {
    assert(before(appHtml, file, 'ai/director/GameDirector.js'), file + ' must load before GameDirector in app entry');
    assert(before(gameHtml, file, 'ai/director/GameDirector.js'), file + ' must load before GameDirector in game entry');
  });
  assert(before(appHtml, 'ai/evaluation/BlueprintMetadata.js', 'ai/director/GameDirector.js'));
  assert(before(gameHtml, 'ai/evaluation/BlueprintMetadata.js', 'ai/director/GameDirector.js'));
  assert(before(gameHtml, 'ai/research/RAGClient.js', 'ai/research/ContextRouter.js'));
  assert(before(gameHtml, 'ai/director/DirectorAgent.js', 'ai/director/GameDirector.js'));

  const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert(mainSource.includes('result.fitness.final_fitness'));
  assert(mainSource.includes('Fitness:'));

  console.log('multi-agent director tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
