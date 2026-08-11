# AI Game Director 2.0 V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working multi-agent Director pipeline with routed RAG context, deterministic validation, two-stage QA, engine admission, persona simulation, and persistent simulation history.

**Architecture:** Preserve `A.GameDirector` as the public browser API and add small IIFE modules under `window.AGE`. Intent parsing, context routing, expert execution, validation, synthesis, DSL admission, simulation, and memory communicate through versioned plain-object contracts. Existing ordinary generation remains compatible while Director mode adopts the new pipeline.

**Tech Stack:** Vanilla JavaScript ES2017, browser IIFEs, `window.AGE`, DeepSeek structured JSON calls, local Python RAG HTTP service, Canvas Engine, localStorage, Node `assert`/`vm` tests, Python `unittest` tests.

---

## Repository Note

The current workspace has no `.git` directory. Do not initialize a repository or invent commit history. Run every verification checkpoint below; commit steps can be added only after the project is restored to a real Git worktree.

For this Codex desktop workspace, initialize PowerShell verification sessions with:

```powershell
$node = 'C:\Users\administered0\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$python = 'C:\Users\administered0\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$env:NODE_PATH = 'C:\Users\administered0\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
```

## File Map

**Create:**

- `ai/protocols/AgentProtocols.js`: factories, normalization, and validation for shared contracts.
- `ai/intent/IntentParserAgent.js`: Intent DSL extraction, normalization, LLM parsing, and deterministic fallback.
- `ai/research/ContextRouter.js`: role-specific RAG query construction and context routing.
- `ai/agents/BaseAgent.js`: common structured-LLM execution and fallback behavior.
- `ai/agents/DesignerAgent.js`: core loop and target-player proposal.
- `ai/agents/LevelAgent.js`: map, level flow, and pacing proposal.
- `ai/agents/CombatAgent.js`: combat, skills, enemies, and Boss proposal.
- `ai/agents/StoryAgent.js`: narrative and event proposal.
- `ai/agents/EconomyAgent.js`: progression, rewards, and resource proposal.
- `ai/agents/AssetAgent.js`: art direction and asset proposal.
- `ai/agents/AgentRegistry.js`: deterministic expert selection and construction.
- `ai/quality/PreQAValidator.js`: proposal-level validation before synthesis.
- `ai/quality/ConstraintEngine.js`: deterministic hard rules and decisions.
- `ai/quality/FinalQA.js`: structural and semantic DSL admission.
- `ai/director/DirectorAgent.js`: orchestration, synthesis, trace, and deterministic merge.
- `ai/simulation/SimulationMemory.js`: isolated localStorage history and trend queries.
- `ai/simulation/SimulationAgent.js`: persona episode orchestration and evaluation aggregation.
- `tests/0806_agent_protocols_v1.test.js`: protocol, parser, and validator tests.
- `tests/0806_multi_agent_director_v1.test.js`: router, registry, concurrency, failure, and synthesis tests.
- `tests/0806_simulation_memory_v1.test.js`: simulation aggregation and persistence tests.

**Modify:**

- `ai/consultant/GameConsultant.js`: delegate intent work to `IntentParserAgent` while retaining consultation state.
- `ai/generator/AIGenerator.js`: add abortable timeout support to structured calls.
- `ai/director/GameDirector.js`: consume confirmed Intent DSL and invoke DirectorAgent/FinalQA/SimulationAgent.
- `main.js`: retain ordinary RAG flow and expose Director-stage context/status results without parsing intent.
- `AI-ENGINE启动.html`: load new modules in dependency order.
- `game.html`: load protocol, QA, and simulation modules needed by saved Director games.
- `tests/0806_consultant_intent_v1.test.js`: load parser before consultant and assert protocol metadata.
- `tests/0806_player_memory_v1.test.js`: load parser before consultant while preserving preference-memory assertions.
- `README.md`: document V1 pipeline and offline/failure behavior.

### Task 1: Shared Protocol Contracts

**Files:**
- Create: `ai/protocols/AgentProtocols.js`
- Create: `tests/0806_agent_protocols_v1.test.js`

- [ ] **Step 1: Write failing protocol tests**

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const sandbox = {console, JSON, Math, Date};
sandbox.window = sandbox;
sandbox.AGE = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'ai/protocols/AgentProtocols.js'), 'utf8'), sandbox);

const P = sandbox.AGE.AgentProtocols;
const proposal = P.agentProposal({task_id:'combat-1', agent:'CombatAgent', proposal:{style:'souls_like'}, confidence:0.9});
assert.strictEqual(P.validateProposal(proposal).valid, true);
assert.strictEqual(P.validateProposal({agent:'CombatAgent'}).valid, false);
assert.strictEqual(P.agentContext({agent:'CombatAgent', offline:true}).offline, true);
assert.strictEqual(P.evaluationResult({persona:'new_player'}).metrics.death_rate, 0);
console.log('agent protocol tests passed');
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `node tests/0806_agent_protocols_v1.test.js`

Expected: FAIL with `ENOENT` for `ai/protocols/AgentProtocols.js`.

- [ ] **Step 3: Implement versioned factories and strict envelope validation**

```js
/** AgentProtocols.js - versioned contracts shared by Director 2.0 modules. */
(function(){
var A=window.AGE=window.AGE||{}, VERSION='1.0';
function copy(v){return JSON.parse(JSON.stringify(v));}
function array(v){return Array.isArray(v)?copy(v):[];}
function number(v,d){return typeof v==='number'&&isFinite(v)?v:d;}
A.AgentProtocols={
  VERSION:VERSION,
  agentContext:function(input){input=input||{};return{schema_version:VERSION,agent:input.agent||'',documents:array(input.documents),coverage:number(input.coverage,0),limitations:array(input.limitations),citations:array(input.citations),offline:input.offline===true};},
  agentProposal:function(input){input=input||{};return{schema_version:VERSION,task_id:input.task_id||'',agent:input.agent||'',status:input.status||'completed',confidence:Math.max(0,Math.min(1,number(input.confidence,0))),proposal:copy(input.proposal||{}),constraints:array(input.constraints),risks:array(input.risks),dependencies:array(input.dependencies)};},
  evaluationResult:function(input){input=input||{};var m=input.metrics||{};return{schema_version:VERSION,simulation_id:input.simulation_id||'',persona:input.persona||'default',episodes:number(input.episodes,0),status:input.status||'completed',metrics:{play_time:number(m.play_time,0),death_rate:number(m.death_rate,0),completion_rate:number(m.completion_rate,0),coverage:number(m.coverage,0),engagement_proxy:number(m.engagement_proxy,0)},bugs:array(input.bugs),reward:number(input.reward,0)};},
  validateProposal:function(value){var errors=[];if(!value||typeof value!=='object')errors.push('proposal_not_object');else{if(value.schema_version!==VERSION)errors.push('schema_version');if(!value.task_id)errors.push('task_id');if(!value.agent)errors.push('agent');if(!value.proposal||typeof value.proposal!=='object'||Array.isArray(value.proposal))errors.push('proposal');if(typeof value.confidence!=='number'||value.confidence<0||value.confidence>1)errors.push('confidence');['constraints','risks','dependencies'].forEach(function(k){if(!Array.isArray(value[k]))errors.push(k);});}return{valid:errors.length===0,errors:errors};}
};
})();
```

- [ ] **Step 4: Run the protocol test**

Run: `node tests/0806_agent_protocols_v1.test.js`

Expected: `agent protocol tests passed`.

### Task 2: IntentParserAgent and Consultant Separation

**Files:**
- Create: `ai/intent/IntentParserAgent.js`
- Modify: `ai/consultant/GameConsultant.js`
- Modify: `tests/0806_consultant_intent_v1.test.js`
- Modify: `tests/0806_player_memory_v1.test.js`

- [ ] **Step 1: Extend the consultant test to require an external parser**

Add parser loading before `GameConsultant.js` and assertions after confirmation:

```js
load('ai/intent/IntentParserAgent.js');
load('ai/consultant/GameConsultant.js');

assert.strictEqual(horrorIntent.schema_version, '1.0');
assert(/^request_/.test(horrorIntent.request_id));
assert(sandbox.AGE.IntentParserAgent);
assert.strictEqual(sandbox.AGE.IntentDSL.engineType('action_rpg'), 'dungeon');
```

- [ ] **Step 2: Run the consultant test and verify failure**

Run: `node tests/0806_consultant_intent_v1.test.js`

Expected: FAIL because `IntentParserAgent.js` does not exist.

- [ ] **Step 3: Move intent inference and normalization behind IntentParserAgent**

Relocate the complete `emptyIntent`, `infer`, `mergeIntent`, and `normalize` function declarations currently located between `setIf` and `A.IntentDSL` in `GameConsultant.js` into `IntentParserAgent.js`, immediately before the public API below. Relocation means deleting those declarations from `GameConsultant.js`; their bodies and regular expressions remain byte-for-byte unchanged so all current intent cases keep passing. Define private `copy`, `has`, and `setIf` helpers in `IntentParserAgent.js`; retain the existing helpers in `GameConsultant.js` because consultation state and memory still use them. Keep `QUESTION_BANK`, `TYPE_QUESTIONS`, `questionFor`, `applyAnswer`, and `applyMemory` in `GameConsultant.js`. Delete the old `A.IntentDSL={...}` block from `GameConsultant.js` so the parser module is its only owner.

```js
/** IntentParserAgent.js - owns Intent DSL extraction and normalization. */
(function(){
var A=window.AGE=window.AGE||{}, seq=0;
function requestId(){seq++;return'request_'+Date.now()+'_'+seq;}
function ensureMeta(intent){intent.schema_version='1.0';intent.version='1.0';intent.request_id=intent.request_id||requestId();intent.reference=Array.isArray(intent.reference)?intent.reference:[];intent.constraints=Array.isArray(intent.constraints)?intent.constraints:[];return intent;}
A.IntentParserAgent=function(options){options=options||{};this.ai=options.ai||A.callStructuredAI||null;};
A.IntentParserAgent.local=function(raw,memory){return ensureMeta(infer(raw,memory));};
A.IntentParserAgent.merge=function(base,extra){return ensureMeta(mergeIntent(base,extra));};
A.IntentParserAgent.normalize=function(intent,raw,memory){return ensureMeta(normalize(intent,raw,memory));};
A.IntentParserAgent.prototype.parse=async function(raw,options){options=options||{};var local=A.IntentParserAgent.local(raw,options.memory);if(!this.ai)return A.IntentParserAgent.normalize(local,raw,options.memory);var parsed=await this.ai('你是Intent Parser，只输出Intent DSL JSON。',JSON.stringify({request:raw,answers:options.answers||[],lockedIntent:options.lockedIntent||null}),{max_tokens:1000,errorStatus:'意图解析失败，使用本地结果'});return A.IntentParserAgent.normalize(A.IntentParserAgent.merge(local,parsed||{}),raw,options.memory);};
A.IntentDSL={create:A.IntentParserAgent.local,normalize:A.IntentParserAgent.normalize,engineType:function(type){var map={action_rpg:'dungeon',horror:'dungeon',puzzle:'platformer',platform:'platformer'};return map[type]||type||'runner';},toGenerationPrompt:function(intent,raw){var type=this.engineType(intent.game_type);return'玩家原始需求:\n'+(raw||intent.raw_request||'')+'\n\n已确认的Intent DSL:\n'+JSON.stringify(intent,null,2)+'\n\n输出统一游戏DSL JSON，并确保meta.game_type="'+type+'"。';}};
})();
```

The moved helper bodies remain private in this module; do not duplicate them in `GameConsultant.js`.

- [ ] **Step 4: Delegate consultant state updates to the parser**

Replace direct calls to the removed helpers with the parser API:

```js
// constructor
this.parser=options.parser||new A.IntentParserAgent();

// begin: parsing is owned by the injected parser
var initialIntent=await this.parser.parse(raw,{memory:this.memory,lockedIntent:this.seedIntent});

// answers are already structured by QUESTION_BANK; applyAnswer mutates only the
// selected field and normalization remains owned by IntentParserAgent
applyAnswer(this.state.intent,id,value);

// skip, confirm, and ready state
this.state.intent=A.IntentParserAgent.normalize(this.state.intent,this.state.raw,this.memory);
```

Keep question selection, answer application, locked intent, and UI state in `GameConsultant.js`.

Change both consultant LLM system prompts to return only `{question:{id,text,choices},ready:boolean,summary:string}`. Remove `intent` from those response contracts and delete every `mergeIntent(this.state.intent, ai.intent)` call. The consultant decides what to ask; it no longer extracts user intent.

- [ ] **Step 5: Run intent and player-memory regressions**

Add `load('ai/intent/IntentParserAgent.js');` immediately before the existing `load('ai/consultant/GameConsultant.js');` call in `tests/0806_player_memory_v1.test.js`.

Run:

```powershell
node tests/0806_consultant_intent_v1.test.js
node tests/0806_player_memory_v1.test.js
```

Expected: both print their existing `passed` messages.

### Task 3: Role-Specific ContextRouter

**Files:**
- Create: `ai/research/ContextRouter.js`
- Modify: `tests/0806_multi_agent_director_v1.test.js`

- [ ] **Step 1: Write failing routing tests with a mocked RAG client**

```js
const calls=[];
A.RAGClient={retrieve:async function(query){calls.push(query);return{documents:[{title:query,content:'knowledge'}],coverage:0.8,plan:{limitations:['side_scroll_only']}};}};
const router=new A.ContextRouter();
const contexts=await router.route({game_type:'action_rpg',combat:{style:'souls_like'}},['CombatAgent','LevelAgent']);
assert.strictEqual(calls.length,2);
assert(calls[0]!==calls[1]);
assert.strictEqual(contexts.CombatAgent.agent,'CombatAgent');
assert.strictEqual(contexts.LevelAgent.coverage,0.8);

A.RAGClient.retrieve=async function(){return{available:false,error:'offline'};};
const offline=await router.route({game_type:'runner'},['DesignerAgent']);
assert.strictEqual(offline.DesignerAgent.offline,true);
```

- [ ] **Step 2: Run the test and verify ContextRouter is undefined**

Run: `node tests/0806_multi_agent_director_v1.test.js`

Expected: FAIL with `A.ContextRouter is not a constructor`.

- [ ] **Step 3: Implement role query routing and offline contexts**

```js
/** ContextRouter.js - the only expert-facing RAG caller. */
(function(){var A=window.AGE;
var FOCUS={DesignerAgent:'核心循环 目标玩家 节奏',CombatAgent:'战斗手感 技能 敌人 Boss 数值',LevelAgent:'地图 关卡 节奏 教学',StoryAgent:'叙事 事件 角色 分支',EconomyAgent:'成长 奖励 资源 平衡',AssetAgent:'美术风格 角色 场景 特效'};
A.ContextRouter=function(options){options=options||{};this.client=options.client||A.RAGClient;};
A.ContextRouter.prototype.queryFor=function(intent,role){return[(intent.game_type||'game'),(intent.theme&&intent.theme.world)||'',(intent.combat&&intent.combat.style)||'',FOCUS[role]||'游戏设计',role].filter(Boolean).join(' ');};
A.ContextRouter.prototype.route=async function(intent,roles){var self=this,pairs=await Promise.all(roles.map(async function(role){try{var result=await self.client.retrieve(self.queryFor(intent,role),intent);if(!result||result.available===false)throw new Error((result&&result.error)||'offline');var docs=result.documents||[];return[role,A.AgentProtocols.agentContext({agent:role,documents:docs,coverage:result.coverage||0,limitations:(result.plan&&result.plan.limitations)||[],citations:docs.map(function(d){return(d.metadata&&d.metadata.url)||d.title||'';}).filter(Boolean)})];}catch(e){return[role,A.AgentProtocols.agentContext({agent:role,offline:true,limitations:[e.message]})];}}));var out={};pairs.forEach(function(pair){out[pair[0]]=pair[1];});return out;};
})();
```

- [ ] **Step 4: Run routing tests**

Run: `node tests/0806_multi_agent_director_v1.test.js`

Expected: routing assertions pass; later not-yet-loaded Director assertions may still fail.

### Task 4: Expert Agents and Dynamic Registry

**Files:**
- Create: `ai/agents/BaseAgent.js`
- Create: `ai/agents/DesignerAgent.js`
- Create: `ai/agents/LevelAgent.js`
- Create: `ai/agents/CombatAgent.js`
- Create: `ai/agents/StoryAgent.js`
- Create: `ai/agents/EconomyAgent.js`
- Create: `ai/agents/AssetAgent.js`
- Create: `ai/agents/AgentRegistry.js`
- Modify: `tests/0806_multi_agent_director_v1.test.js`

- [ ] **Step 1: Add failing registry and uniform-output tests**

```js
const registry=new A.AgentRegistry();
assert.deepStrictEqual(Array.from(registry.rolesFor({game_type:'runner'})),['DesignerAgent','LevelAgent','CombatAgent']);
assert(registry.rolesFor({game_type:'story'}).includes('StoryAgent'));
assert(registry.rolesFor({game_type:'simulation'}).includes('EconomyAgent'));
assert(registry.rolesFor({game_type:'dungeon',theme:{world:'dark_fantasy'}}).includes('AssetAgent'));
const combat=registry.create('CombatAgent',{ai:async function(){return{proposal:{style:'melee'},confidence:0.8};}});
const result=await combat.run({task_id:'c1',objective:'combat',intent:{}},A.AgentProtocols.agentContext({agent:'CombatAgent'}));
assert.strictEqual(A.AgentProtocols.validateProposal(result).valid,true);
```

- [ ] **Step 2: Run the test and verify registry failure**

Run: `node tests/0806_multi_agent_director_v1.test.js`

Expected: FAIL because `AgentRegistry` is undefined.

- [ ] **Step 3: Implement BaseAgent with normalized success and fallback**

```js
/** BaseAgent.js - shared expert execution contract. */
(function(){var A=window.AGE;
A.BaseAgent=function(options){options=options||{};this.name=options.name||'BaseAgent';this.systemPrompt=options.systemPrompt||'';this.ai=options.ai||A.callStructuredAI;this.fallback=options.fallback||function(){return{};};};
A.BaseAgent.prototype.run=async function(task,context){var raw=null;try{if(this.ai)raw=await this.ai(this.systemPrompt,JSON.stringify({task:task,intent:task.intent,context:context}),{max_tokens:1200,timeout_ms:30000,errorStatus:this.name+'暂时不可用'});}catch(e){}var fallback=!raw;raw=raw||{proposal:this.fallback(task,context),confidence:context&&context.offline?0.35:0.5,risks:['使用本地默认提案']};return A.AgentProtocols.agentProposal({task_id:task.task_id,agent:this.name,status:fallback?'fallback':'completed',confidence:typeof raw.confidence==='number'?raw.confidence:(context&&context.offline?0.55:0.75),proposal:raw.proposal||raw,constraints:raw.constraints,risks:raw.risks,dependencies:raw.dependencies});};
})();
```

- [ ] **Step 4: Implement one focused constructor per role**

Add this helper to `BaseAgent.js` so every role file stays declarative:

```js
A.defineExpertAgent=function(name,systemPrompt,fallback){
  var Ctor=function(options){options=options||{};A.BaseAgent.call(this,{name:name,ai:options.ai,systemPrompt:systemPrompt,fallback:fallback});};
  Ctor.prototype=Object.create(A.BaseAgent.prototype);
  Ctor.prototype.constructor=Ctor;
  A[name]=Ctor;
};
```

Then create each complete role file with the same small public shape:

```js
/** CombatAgent.js */
(function(){var A=window.AGE;A.defineExpertAgent('CombatAgent','你是战斗设计专家。只输出结构化提案，设计战斗、技能、敌人和Boss，并遵守引擎限制。',function(task){var combat=(task.intent&&task.intent.combat)||{},hard=combat.difficulty==='hard';return{style:combat.style||'action',player_hp:hard?6:8,boss:{phases:3},skills:['attack','movement','defense']};});})();

/** DesignerAgent.js */
(function(){var A=window.AGE;A.defineExpertAgent('DesignerAgent','你是核心玩法设计专家。只输出结构化提案，定义目标玩家、核心循环和节奏。',function(){return{core_loop:['explore','challenge','reward','progress'],target_player:'general',pace:'medium'};});})();

/** LevelAgent.js */
(function(){var A=window.AGE;A.defineExpertAgent('LevelAgent','你是关卡设计专家。只输出结构化提案，定义地图、教学、挑战和Boss节奏。',function(){return{levels:[{id:1,purpose:'tutorial'},{id:2,purpose:'mastery'},{id:3,purpose:'boss'}]};});})();

/** StoryAgent.js */
(function(){var A=window.AGE;A.defineExpertAgent('StoryAgent','你是叙事设计专家。只输出结构化提案，定义前提、角色、事件和分支。',function(){return{premise:'player-driven adventure',events:[],characters:[]};});})();

/** EconomyAgent.js */
(function(){var A=window.AGE;A.defineExpertAgent('EconomyAgent','你是游戏经济设计专家。只输出结构化提案，定义成长、奖励、资源和消耗。',function(){return{currencies:['progress'],rewards:{frequency:'medium'},sinks:[]};});})();

/** AssetAgent.js */
(function(){var A=window.AGE;A.defineExpertAgent('AssetAgent','你是美术与资产设计专家。只输出结构化提案，定义风格、角色、环境和特效需求。',function(){return{style:'theme_consistent',characters:[],environments:[],effects:[]};});})();
```

- [ ] **Step 5: Implement deterministic role selection and construction**

```js
/** AgentRegistry.js */
(function(){var A=window.AGE;
var CTORS={DesignerAgent:'DesignerAgent',LevelAgent:'LevelAgent',CombatAgent:'CombatAgent',StoryAgent:'StoryAgent',EconomyAgent:'EconomyAgent',AssetAgent:'AssetAgent'};
A.AgentRegistry=function(options){this.options=options||{};};
A.AgentRegistry.prototype.rolesFor=function(intent){intent=intent||{};var roles=['DesignerAgent','LevelAgent','CombatAgent'],type=intent.game_type||'',details=intent.details||{},theme=(intent.theme&&intent.theme.world)||'';if(type==='story'||details.story_mode||details.rpg_growth==='story')roles.push('StoryAgent');if(['rpg','strategy','tower_defense','card','simulation'].indexOf(type)>=0||details.strategy_mode==='economy')roles.push('EconomyAgent');if(theme&&theme!=='default'||intent.reference&&intent.reference.length)roles.push('AssetAgent');return roles;};
A.AgentRegistry.prototype.create=function(role,options){var name=CTORS[role],Ctor=A[name];if(!Ctor)throw new Error('unknown_agent:'+role);return new Ctor(Object.assign({},this.options,options||{}));};
})();
```

- [ ] **Step 6: Run registry and proposal tests**

Run: `node tests/0806_multi_agent_director_v1.test.js`

Expected: registry and uniform proposal assertions pass.

### Task 5: Pre-QA and Deterministic Constraint Engine

**Files:**
- Create: `ai/quality/PreQAValidator.js`
- Create: `ai/quality/ConstraintEngine.js`
- Modify: `tests/0806_agent_protocols_v1.test.js`

- [ ] **Step 1: Add failing deterministic validation tests**

Load `core/dsl/Config.js`, `core/engine/GameStandard.js`, and `ai/intent/IntentParserAgent.js` into the test sandbox before the quality modules so `A.GAME_TYPES` and `A.IntentDSL.engineType` are available.

```js
const preqa=new A.PreQAValidator();
const badBoss=P.agentProposal({task_id:'c1',agent:'CombatAgent',confidence:0.9,proposal:{player_hp:100,boss:{damage:1000}},dependencies:[]});
assert(preqa.validate([badBoss]).findings.some(f=>f.code==='boss_one_shot_risk'));

const engine=new A.ConstraintEngine();
const first=engine.evaluate({game_type:'action_rpg',combat:{difficulty:'hard'}},[badBoss]);
const second=engine.evaluate({game_type:'action_rpg',combat:{difficulty:'hard'}},[badBoss]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(first)),JSON.parse(JSON.stringify(second)));
assert(first.decisions.every(d=>d.rule_id&&d.path));
```

- [ ] **Step 2: Run protocol tests and verify missing validators**

Run: `node tests/0806_agent_protocols_v1.test.js`

Expected: FAIL because `PreQAValidator` is undefined.

- [ ] **Step 3: Implement proposal-level Pre-QA findings**

```js
/** PreQAValidator.js */
(function(){var A=window.AGE;
A.PreQAValidator=function(){};
A.PreQAValidator.prototype.validate=function(proposals){var findings=[];(proposals||[]).forEach(function(p){var valid=A.AgentProtocols.validateProposal(p);valid.errors.forEach(function(code){findings.push({severity:'blocking',code:'schema_'+code,path:p.agent||'unknown',source_agent:p.agent||''});});var data=p.proposal||{},boss=data.boss||{};if(typeof boss.damage==='number'&&typeof data.player_hp==='number'&&boss.damage>=data.player_hp*2)findings.push({severity:'high',code:'boss_one_shot_risk',path:'combat.boss.damage',source_agent:p.agent});(p.dependencies||[]).forEach(function(dep){if(!dep)findings.push({severity:'medium',code:'empty_dependency',path:'dependencies',source_agent:p.agent});});});return{status:findings.some(function(f){return f.severity==='blocking';})?'blocked':'review',findings:findings};};
})();
```

- [ ] **Step 4: Implement stable rule IDs and immutable decisions**

```js
/** ConstraintEngine.js */
(function(){var A=window.AGE;
A.ConstraintEngine=function(){};
A.ConstraintEngine.prototype.evaluate=function(intent,proposals){var decisions=[],type=A.IntentDSL.engineType(intent&&intent.game_type);if(!A.GAME_TYPES||!A.GAME_TYPES[type])decisions.push({rule_id:'ENGINE_TYPE_SUPPORTED',severity:'blocking',path:'intent.game_type',action:'replace',value:'runner',source_agent:'IntentParserAgent'});(proposals||[]).forEach(function(p){var d=p.proposal||{},boss=d.boss||{};if(typeof d.player_hp==='number'&&typeof boss.damage==='number'&&boss.damage>=d.player_hp)decisions.push({rule_id:'COMBAT_SURVIVABLE_HIT',severity:'blocking',path:'combat.boss.damage',action:'cap',value:Math.max(1,d.player_hp-1),source_agent:p.agent});});if(intent&&intent.combat&&intent.combat.difficulty==='hard')decisions.push({rule_id:'HARD_MODE_TUTORIAL',severity:'required',path:'gameplay.tutorial',action:'set',value:true,source_agent:'IntentParserAgent'});return{status:decisions.some(function(d){return d.severity==='blocking';})?'corrected':'pass',decisions:decisions};};
})();
```

- [ ] **Step 5: Run protocol and deterministic-rule tests**

Run: `node tests/0806_agent_protocols_v1.test.js`

Expected: `agent protocol tests passed`.

### Task 6: DirectorAgent Parallel Orchestration

**Files:**
- Create: `ai/director/DirectorAgent.js`
- Modify: `tests/0806_multi_agent_director_v1.test.js`

- [ ] **Step 1: Add failing orchestration tests for concurrency and partial failure**

```js
const started=[];
const fakeRegistry={
  rolesFor(){return['DesignerAgent','LevelAgent','CombatAgent'];},
  create(role){return{run:async function(task){started.push(role);if(role==='LevelAgent')throw new Error('level failed');await Promise.resolve();return A.AgentProtocols.agentProposal({task_id:task.task_id,agent:role,confidence:0.8,proposal:{role:role}});}};}
};
const fakeRouter={route:async function(_intent,roles){const out={};roles.forEach(r=>out[r]=A.AgentProtocols.agentContext({agent:r}));return out;}};
const director=new A.DirectorAgent({registry:fakeRegistry,router:fakeRouter,ai:null});
const result=await director.design({schema_version:'1.0',request_id:'r1',game_type:'runner'},'run game');
assert.deepStrictEqual(Array.from(started),['DesignerAgent','LevelAgent','CombatAgent']);
assert.strictEqual(result.success,true);
assert(result.proposals.some(p=>p.agent==='LevelAgent'&&p.status==='fallback'));
assert(result.trace.some(t=>t.stage==='experts'));
```

- [ ] **Step 2: Run the test and verify DirectorAgent is missing**

Run: `node tests/0806_multi_agent_director_v1.test.js`

Expected: FAIL because `DirectorAgent` is undefined.

- [ ] **Step 3: Implement task creation, parallel execution, and partial fallback**

```js
/** DirectorAgent.js - multi-agent design orchestrator. */
(function(){var A=window.AGE;
function now(){return Date.now();}
A.DirectorAgent=function(options){options=options||{};this.registry=options.registry||new A.AgentRegistry();this.router=options.router||new A.ContextRouter();this.preqa=options.preqa||new A.PreQAValidator();this.constraints=options.constraints||new A.ConstraintEngine();this.ai=options.ai===undefined?A.callStructuredAI:options.ai;this.onStatus=options.onStatus||function(){};};
A.DirectorAgent.prototype.design=async function(intent,userPrompt){if(!intent||!intent.schema_version)return{success:false,error:'confirmed_intent_required'};var trace=[],roles=this.registry.rolesFor(intent),self=this,start=now();this.onStatus('context','按角色检索设计知识...');var contexts=await this.router.route(intent,roles);trace.push({stage:'context',status:'completed',elapsed_ms:now()-start,warnings:Object.keys(contexts).filter(function(k){return contexts[k].offline;})});this.onStatus('experts','专家Agent并行设计...');start=now();var settled=await Promise.allSettled(roles.map(function(role,index){var task={task_id:role.toLowerCase()+'-'+(index+1),role:role,objective:'为已确认Intent设计'+role,intent:intent,user_prompt:userPrompt||''};return self.registry.create(role).run(task,contexts[role]);}));var proposals=settled.map(function(item,index){if(item.status==='fulfilled'&&A.AgentProtocols.validateProposal(item.value).valid)return item.value;return A.AgentProtocols.agentProposal({task_id:roles[index].toLowerCase()+'-'+(index+1),agent:roles[index],status:'fallback',confidence:0.25,proposal:{},risks:[item.reason?String(item.reason.message||item.reason):'invalid_agent_output']});});trace.push({stage:'experts',status:proposals.every(function(p){return p.status==='fallback';})?'failed':'completed',elapsed_ms:now()-start,warnings:proposals.filter(function(p){return p.status==='fallback';}).map(function(p){return p.agent;})});if(proposals.every(function(p){return p.status==='fallback';}))return{success:false,error:'all_experts_failed',proposals:proposals,trace:trace};this.onStatus('preqa','执行Pre-QA和确定性规则...');var preqa=this.preqa.validate(proposals),rules=this.constraints.evaluate(intent,proposals);this.onStatus('synthesis','Director综合Game Blueprint...');var blueprint=await this.synthesize(intent,proposals,preqa,rules);return{success:true,intent:intent,contexts:contexts,proposals:proposals,preqa:preqa,constraints:rules,blueprint:blueprint,trace:trace};};
```

- [ ] **Step 4: Implement LLM synthesis with a deterministic fallback**

```js
A.DirectorAgent.prototype.synthesize=async function(intent,proposals,preqa,rules){var payload={intent:intent,proposals:proposals,preqa:preqa,constraint_decisions:rules.decisions};if(this.ai){var raw=await this.ai('你是Game Director。依据提案和不可覆盖的规则输出GameBlueprint JSON。',JSON.stringify(payload),{max_tokens:1800,timeout_ms:30000,errorStatus:'导演综合失败，使用确定性蓝图'});if(raw&&raw.gameplay&&raw.world)return this.normalizeBlueprint(intent,raw,proposals,rules);}return this.deterministicBlueprint(intent,proposals,rules);};
A.DirectorAgent.prototype.normalizeBlueprint=function(intent,raw,proposals,rules){return{schema_version:'1.0',request_id:intent.request_id,gameplay:raw.gameplay||{},world:raw.world||{},levels:Array.isArray(raw.levels)?raw.levels:[],characters:raw.characters||{},balance:raw.balance||{},art_direction:raw.art_direction||{},engine_constraints:rules.decisions||[],decisions:raw.decisions||[],agent_trace:proposals.map(function(p){return{agent:p.agent,task_id:p.task_id,confidence:p.confidence,status:p.status};})};};
A.DirectorAgent.prototype.deterministicBlueprint=function(intent,proposals,rules){var merged={};proposals.forEach(function(p){merged[p.agent]=p.proposal;});return this.normalizeBlueprint(intent,{gameplay:merged.DesignerAgent||{},world:{theme:(intent.theme&&intent.theme.world)||'default'},levels:(merged.LevelAgent&&merged.LevelAgent.levels)||[],characters:(merged.StoryAgent&&merged.StoryAgent.characters)||{},balance:{combat:merged.CombatAgent||{},economy:merged.EconomyAgent||{}},art_direction:merged.AssetAgent||{},decisions:rules.decisions||[]},proposals,rules);};
```

- [ ] **Step 5: Run orchestration tests**

Run: `node tests/0806_multi_agent_director_v1.test.js`

Expected: `multi-agent director tests passed`.

### Task 7: FinalQA and GameDirector Integration

**Files:**
- Create: `ai/quality/FinalQA.js`
- Modify: `ai/generator/AIGenerator.js`
- Modify: `ai/director/GameDirector.js`
- Modify: `tests/0806_multi_agent_director_v1.test.js`

- [ ] **Step 1: Add failing FinalQA admission tests**

```js
const finalQA=new A.FinalQA();
const invalid=finalQA.validate({meta:{game_type:'dungeon'},player:{hp:0},rules:{}},{game_type:'action_rpg'},{gameplay:{}});
assert.strictEqual(invalid.admitted,false);
const valid=finalQA.validate({meta:{game_type:'runner',title:'Run'},player:{hp:3},rules:{win_condition:'survive_time'}},{game_type:'runner'},{gameplay:{}});
assert.strictEqual(valid.admitted,true);
```

- [ ] **Step 2: Implement structural and semantic admission**

```js
/** FinalQA.js */
(function(){var A=window.AGE;
A.FinalQA=function(options){options=options||{};this.ai=options.ai===undefined?A.callStructuredAI:options.ai;};
A.FinalQA.prototype.validate=function(dsl,intent,blueprint){var structural=A.DSLValidator.validate(dsl),findings=[];if(A.IntentDSL.engineType(intent.game_type)!==(dsl.meta&&dsl.meta.game_type))findings.push({severity:'error',code:'intent_game_type_mismatch',path:'meta.game_type'});if(blueprint&&blueprint.levels&&blueprint.levels.length&&(!dsl.levels||!dsl.levels.length))findings.push({severity:'warning',code:'blueprint_levels_missing',path:'levels'});return{admitted:structural.valid&&!findings.some(function(f){return f.severity==='error';}),structural:structural,findings:findings};};
A.FinalQA.prototype.admit=async function(dsl,intent,blueprint){var result=this.validate(dsl,intent,blueprint);if(!result.admitted||!this.ai)return result;try{var semantic=await this.ai('你是Final QA Agent。检查Game DSL是否忠实实现Intent和Blueprint，只输出{findings:[{severity,code,path,reason}]}。',JSON.stringify({intent:intent,blueprint:blueprint,dsl:dsl}),{max_tokens:900,timeout_ms:20000,errorStatus:'Final QA语义检查离线'});result.findings=result.findings.concat((semantic&&semantic.findings)||[]);result.admitted=!result.findings.some(function(f){return f.severity==='error'||f.severity==='blocking';});}catch(e){result.findings.push({severity:'warning',code:'semantic_qa_offline',path:'$'});}return result;};
})();
```

- [ ] **Step 3: Add request timeouts to structured AI calls**

In `A.callStructuredAI`, construct the request body, create an AbortController, parse the response, and clear the timer in `finally`:

```js
var controller=new AbortController();
var timer=setTimeout(function(){controller.abort();},options.timeout_ms||30000);
try{
  var requestBody={model:options.model||'deepseek-chat',messages:[{role:'system',content:systemPrompt},{role:'user',content:userPrompt}],temperature:typeof options.temperature==='number'?options.temperature:0.35,max_tokens:options.max_tokens||1800};
  var r=await fetch('https://api.deepseek.com/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+A.API_KEY},body:JSON.stringify(requestBody)});
  if(!r.ok){var err=await r.json();throw new Error(err.error?err.error.message:'HTTP '+r.status);}
  var data=await r.json();
  var output=(data.choices||[])[0]?data.choices[0].message.content:'';
  return extractJSON(output);
}finally{
  clearTimeout(timer);
}
```

Preserve the existing `null` fallback and user-facing error status.

- [ ] **Step 4: Invoke DirectorAgent before generation and FinalQA before Engine load**

At the start of `runDirectorLoop`, require normalized Intent DSL and design the blueprint:

```js
if(!intentDSL||!intentDSL.schema_version)return{success:false,error:'AI导演需要已确认的Intent DSL'};
var multiDirector=new A.DirectorAgent();
var design=await multiDirector.design(intentDSL,userPrompt);
if(!design.success)return design;
this.intent=this.analyzeIntentDSL(intentDSL);
this.blueprint=design.blueprint;
var generationPrompt=A.IntentDSL.toGenerationPrompt(intentDSL,userPrompt)+'\n\n已确认Game Blueprint:\n'+JSON.stringify(design.blueprint,null,2);
```

After `DSLBinder.bind`, validate and regenerate at most once:

```js
var finalQA=new A.FinalQA(),qa=await finalQA.admit(dsl,intentDSL,design.blueprint);
if(!qa.admitted){
  var repaired=await A.callAI(generationPrompt+'\n\n上次DSL未通过Final QA:\n'+JSON.stringify(qa));
  if(repaired)dsl=A.DSLBinder.bind(repaired,generationPrompt);
  qa=await finalQA.admit(dsl,intentDSL,design.blueprint);
}
if(!qa.admitted)return{success:false,error:'生成的Game DSL未通过Final QA',qa:qa};
```

Return `design`, `qa`, and orchestration trace with the existing result. Keep `analyzeIntent` only for legacy callers; the multi-agent path must not call it.

- [ ] **Step 5: Add an integration assertion that invalid DSL never loads Engine**

```js
let loads=0;
A._currentEngine={load(){loads++;}};
// Mock callAI to return an invalid DSL twice, then call runDirectorLoop with a normalized intent.
assert.strictEqual(result.success,false);
assert.strictEqual(loads,0);
```

- [ ] **Step 6: Run Director, intent, and engine regressions**

Run:

```powershell
node tests/0806_multi_agent_director_v1.test.js
node tests/0806_consultant_intent_v1.test.js
node tests/0806_engine_regression_v1.test.js
```

Expected: all three print `passed`.

### Task 8: SimulationMemory

**Files:**
- Create: `ai/simulation/SimulationMemory.js`
- Create: `tests/0806_simulation_memory_v1.test.js`

- [ ] **Step 1: Write failing isolated-storage and trend tests**

```js
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),data={age_conversations_v10:'keep'};
const storage={getItem:k=>Object.prototype.hasOwnProperty.call(data,k)?data[k]:null,setItem:(k,v)=>data[k]=String(v),removeItem:k=>delete data[k]};
const sandbox={console,JSON,Math,Date,window:null};sandbox.window=sandbox;sandbox.AGE={};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'ai/simulation/SimulationMemory.js'),'utf8'),sandbox);
const memory=new sandbox.AGE.SimulationMemory(storage);
memory.append({run_id:'r1',game_id:'g1',version_id:'v1',parent_version:null,persona:'new_player',changes:[],evaluation:{death_rate:0.67},created_at:1});
memory.append({run_id:'r2',game_id:'g1',version_id:'v2',parent_version:'v1',persona:'new_player',changes:['boss_damage -20%'],evaluation:{death_rate:0.40},created_at:2});
assert.deepStrictEqual(Array.from(memory.history('g1','new_player')).map(x=>x.version_id),['v1','v2']);
assert.strictEqual(memory.trend('g1','new_player','death_rate').delta,-0.27);
assert.strictEqual(data.age_conversations_v10,'keep');
console.log('simulation memory tests passed');
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `node tests/0806_simulation_memory_v1.test.js`

Expected: FAIL with `ENOENT`.

- [ ] **Step 3: Implement isolated append, history, trend, and corruption filtering**

```js
/** SimulationMemory.js */
(function(){var A=window.AGE,KEY='age_simulation_memory_v1';
A.SimulationMemory=function(storage){this.storage=storage||window.localStorage;};
A.SimulationMemory.prototype.all=function(){try{var value=JSON.parse(this.storage.getItem(KEY)||'[]');return Array.isArray(value)?value.filter(function(x){return x&&x.run_id&&x.game_id&&x.version_id;}):[];}catch(e){return[];}};
A.SimulationMemory.prototype.append=function(record){var all=this.all(),safe={run_id:record.run_id,game_id:record.game_id,version_id:record.version_id,parent_version:record.parent_version||null,persona:record.persona||'default',changes:Array.isArray(record.changes)?record.changes.slice():[],evaluation:record.evaluation||{},status:record.status||'completed',created_at:record.created_at||Date.now()};all.push(safe);if(all.length>200)all=all.slice(all.length-200);this.storage.setItem(KEY,JSON.stringify(all));return safe;};
A.SimulationMemory.prototype.history=function(gameId,persona){return this.all().filter(function(x){return x.game_id===gameId&&(!persona||x.persona===persona);}).sort(function(a,b){return a.created_at-b.created_at;});};
A.SimulationMemory.prototype.trend=function(gameId,persona,metric){var rows=this.history(gameId,persona),first=rows[0],last=rows[rows.length-1],a=first&&Number(first.evaluation[metric]),b=last&&Number(last.evaluation[metric]);return{metric:metric,points:rows.length,first:isFinite(a)?a:null,last:isFinite(b)?b:null,delta:isFinite(a)&&isFinite(b)?Number((b-a).toFixed(4)):null};};
})();
```

- [ ] **Step 4: Run memory tests**

Run: `node tests/0806_simulation_memory_v1.test.js`

Expected: `simulation memory tests passed`.

### Task 9: SimulationAgent and Director History

**Files:**
- Create: `ai/simulation/SimulationAgent.js`
- Modify: `ai/director/GameDirector.js`
- Modify: `tests/0806_simulation_memory_v1.test.js`

- [ ] **Step 1: Add failing evaluation aggregation tests with an injected episode runner**

```js
const P=sandbox.AGE.AgentProtocols;
// Load AgentProtocols.js and SimulationAgent.js into the sandbox after SimulationMemory.js.
const agent=new sandbox.AGE.SimulationAgent({episodeRunner:async function(_engine,persona,index){return{persona:persona,play_time:100+index,death:index===0?1:0,completed:index>0,coverage:0.5+index*0.1,engagement_proxy:6+index,bugs:index===0?[{code:'stuck'}]:[]};}});
const evaluation=await agent.run({}, {persona:'new_player',episodes:3,simulation_id:'s1'});
assert.strictEqual(evaluation.episodes,3);
assert.strictEqual(evaluation.metrics.death_rate,1/3);
assert.strictEqual(evaluation.metrics.completion_rate,2/3);
assert.strictEqual(evaluation.bugs.length,1);
```

- [ ] **Step 2: Implement injected and production episode execution**

```js
/** SimulationAgent.js */
(function(){var A=window.AGE;
A.SimulationAgent=function(options){options=options||{};this.episodeRunner=options.episodeRunner||this.runEngineEpisode;};
A.SimulationAgent.prototype.run=async function(engine,options){options=options||{};var count=Math.max(1,Math.min(5,options.episodes||3)),rows=[];for(var i=0;i<count;i++)rows.push(await this.episodeRunner(engine,options.persona||'new_player',i,options));var deaths=rows.filter(function(r){return r.death;}).length,wins=rows.filter(function(r){return r.completed;}).length,bugs=[];rows.forEach(function(r){bugs=bugs.concat(r.bugs||[]);});function avg(key){return rows.reduce(function(sum,r){return sum+(Number(r[key])||0);},0)/rows.length;}return A.AgentProtocols.evaluationResult({simulation_id:options.simulation_id||'sim_'+Date.now(),persona:options.persona||'new_player',episodes:rows.length,status:'completed',metrics:{play_time:avg('play_time'),death_rate:deaths/rows.length,completion_rate:wins/rows.length,coverage:avg('coverage'),engagement_proxy:avg('engagement_proxy')},bugs:bugs,reward:Math.round(wins/rows.length*50+avg('coverage')*30-bugs.length*10)});};
A.SimulationAgent.prototype.runEngineEpisode=async function(engine,persona,index,options){var mode=persona==='explorer'?'explore':persona==='stress_tester'?'stress':'progress',tester=new A.AITestAgent(engine),observer=new A.GameObserver(),anomaly=new A.AnomalyDetector(engine);tester.maxFrames=options.maxFrames||1200;tester.start(mode);observer.start();anomaly.start();engine.playTester=tester;await new Promise(function(resolve){var tick=function(){try{observer.update();anomaly.update();}catch(e){}if(!tester._active||tester._done||engine.gameOver||engine._win||tester.frame>=tester.maxFrames){tester.stop();observer.stop();anomaly.stop();engine.playTester=null;resolve();}else setTimeout(tick,50);};tick();});var report=tester.generateReport(),anomalyReport=anomaly.generateReport();return{persona:persona,play_time:report.survivalTime,death:!!(report.endState&&report.endState.gameOver),completed:!!(report.endState&&report.endState.win),coverage:Math.min(1,((report.progress&&report.progress.maxLevel)||0)/Math.max(1,(engine.dsl&&engine.dsl.levels&&engine.dsl.levels.length)||1)),engagement_proxy:Math.min(10,2+report.totalActions/50),bugs:anomalyReport.anomalies||[]};};
})();
```

- [ ] **Step 3: Persist a bounded Director simulation after the admitted final DSL is loaded**

After final Engine load in `runDirectorLoop`:

```js
var evaluation=null;
if(A._currentEngine&&A.SimulationAgent&&A.SimulationMemory){
  try{
    evaluation=await new A.SimulationAgent().run(A._currentEngine,{persona:'new_player',episodes:1,maxFrames:1200,simulation_id:'sim_'+Date.now()});
    var simulationMemory=new A.SimulationMemory(),gameId=intentDSL.request_id||'game',previous=simulationMemory.history(gameId,evaluation.persona),versionId='v'+Date.now();
    simulationMemory.append({run_id:evaluation.simulation_id,game_id:gameId,version_id:versionId,parent_version:previous.length?previous[previous.length-1].version_id:null,persona:evaluation.persona,changes:totalOptimizations?['director_optimizations:'+totalOptimizations]:[],evaluation:evaluation.metrics,status:evaluation.status,created_at:Date.now()});
  }catch(e){evaluation={status:'incomplete',error:e.message};}
}
```

Return `evaluation` from Director mode. Do not run this extra simulation in ordinary generation mode.

- [ ] **Step 4: Run simulation and Director tests**

Run:

```powershell
node tests/0806_simulation_memory_v1.test.js
node tests/0806_multi_agent_director_v1.test.js
```

Expected: both print `passed`.

### Task 10: Browser Wiring, Status, Documentation, and Full Verification

**Files:**
- Modify: `AI-ENGINE启动.html`
- Modify: `game.html`
- Modify: `main.js`
- Modify: `README.md`
- Modify: `tests/0806_multi_agent_director_v1.test.js`
- Modify: `tests/0806_agent_protocols_v1.test.js`
- Modify: `tests/0806_simulation_memory_v1.test.js`

- [ ] **Step 1: Add a failing script-order assertion**

```js
const html=fs.readFileSync(path.join(root,'AI-ENGINE启动.html'),'utf8');
const protocolIndex=html.indexOf('ai/protocols/AgentProtocols.js');
const directorAgentIndex=html.indexOf('ai/director/DirectorAgent.js');
const gameDirectorIndex=html.indexOf('ai/director/GameDirector.js');
assert(protocolIndex>=0&&protocolIndex<directorAgentIndex);
assert(directorAgentIndex<gameDirectorIndex);
```

- [ ] **Step 2: Add scripts in dependency order to both HTML entry points**

In `AI-ENGINE启动.html`, place `AgentProtocols.js` and `IntentParserAgent.js` immediately before `PlayerMemory.js`/`GameConsultant.js`. Keep the existing `RAGClient.js` tag, place `ContextRouter.js` immediately after it, and then place agents, quality modules, `DirectorAgent.js`, and simulation modules before `GameDirector.js`. In `game.html`, place the same new tags after `AIGenerator.js` and before `GameDirector.js`; also add `RAGClient.js` before `ContextRouter.js` so a saved page can construct Director dependencies if needed.

The complete new tag set is:

```html
<script src="ai/protocols/AgentProtocols.js"></script>
<script src="ai/intent/IntentParserAgent.js"></script>
<script src="ai/research/RAGClient.js"></script>
<script src="ai/research/ContextRouter.js"></script>
<script src="ai/agents/BaseAgent.js"></script>
<script src="ai/agents/DesignerAgent.js"></script>
<script src="ai/agents/LevelAgent.js"></script>
<script src="ai/agents/CombatAgent.js"></script>
<script src="ai/agents/StoryAgent.js"></script>
<script src="ai/agents/EconomyAgent.js"></script>
<script src="ai/agents/AssetAgent.js"></script>
<script src="ai/agents/AgentRegistry.js"></script>
<script src="ai/quality/PreQAValidator.js"></script>
<script src="ai/quality/ConstraintEngine.js"></script>
<script src="ai/quality/FinalQA.js"></script>
<script src="ai/director/DirectorAgent.js"></script>
<script src="ai/simulation/SimulationMemory.js"></script>
<script src="ai/simulation/SimulationAgent.js"></script>
```

`GameConsultant.js` remains loaded only in `AI-ENGINE启动.html`; its old `A.IntentDSL` definition was removed in Task 2.

- [ ] **Step 3: Surface Director stages through the existing loading callback**

Keep the UI contract small:

```js
director._statusCallback=function(msg,type){ChatUI.updateLoading(msg);};
var multiDirector=new A.DirectorAgent({onStatus:function(stage,message){director._status(message||stage);}});
```

`DirectorAgent` emits `context`, `experts`, `preqa`, and `synthesis`. `GameDirector` emits `finalqa` immediately before `FinalQA.admit` and `simulation` immediately before `SimulationAgent.run`. Tests assert this ordered six-stage sequence.

Do not add a new dashboard in V1. Preserve the existing research panel for ordinary generation; Director role contexts are returned in the Director result for later UI work.

- [ ] **Step 4: Document the implemented V1 boundary**

Add a README section containing this exact operational summary:

```markdown
## AI Game Director 2.0 V1

Director mode consumes a confirmed Intent DSL, routes role-specific RAG context, runs independent expert agents, validates proposals with Pre-QA and deterministic rules, synthesizes a Game Blueprint, admits the generated Game DSL through FinalQA, and stores bounded persona-simulation history. RAG and individual expert failures degrade to local defaults. V1 does not train reinforcement-learning models or run genetic optimization.
```

- [ ] **Step 5: Run every JavaScript test**

Run:

```powershell
$tests=Get-ChildItem -LiteralPath tests -Filter "*.test.js" | Sort-Object Name
foreach($test in $tests){& $node $test.FullName; if($LASTEXITCODE -ne 0){throw "JS test failed: $($test.Name)"}}
```

Expected: every test prints its `passed` message and the command exits 0.

- [ ] **Step 6: Run every Python test**

Run:

```powershell
$tests=Get-ChildItem -LiteralPath tests -Filter "*.test.py" | Sort-Object Name
foreach($test in $tests){& $python $test.FullName; if($LASTEXITCODE -ne 0){throw "Python test failed: $($test.Name)"}}
```

Expected: all RAG and web-search tests report `OK`.

- [ ] **Step 7: Start the static server and perform browser smoke checks**

Run:

```powershell
& $python -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/AI-ENGINE%E5%90%AF%E5%8A%A8.html` and verify:

- Ordinary generation still reaches consultation and the existing RAG panel.
- Director mode shows intent, context, experts, Pre-QA, synthesis, FinalQA, and simulation stage text.
- With RAG offline, Director mode completes using offline contexts.
- A generated game opens without console errors.
- A Simulation Memory record is written under `age_simulation_memory_v1`, while conversation and preference keys remain unchanged.

- [ ] **Step 8: Record the final verification evidence**

Append the exact test commands, pass counts, browser URL, and any unavailable external dependency to the implementation closeout. Do not claim DeepSeek or RAG success if the local service or API is unavailable; report the verified offline fallback instead.
