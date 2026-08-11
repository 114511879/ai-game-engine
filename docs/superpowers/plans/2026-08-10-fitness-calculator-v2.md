# FitnessCalculator V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, configurable FitnessResult 2.0 calculator and integrate it with Director simulation history without breaking V1 generation or scoring consumers.

**Architecture:** Implement five browser-executable IIFE modules under `fitness/`: `types.js`, `WeightProfile.js`, `MetricsNormalizer.js`, `PenaltyCalculator.js`, and `FitnessCalculator.js`. The calculator exposes `calculateFitness(evaluation, qa, runtime, trend, blueprintMetadata?)`, resolves a named weight profile, computes five normalized dimensions plus independent penalties and confidence, and returns a versioned result. Director adapts existing FinalQA, SimulationAgent, SimulationMemory, and Blueprint data into this interface; legacy per-round scores remain available for compatibility.

**Tech Stack:** Vanilla JavaScript, `window.AGE` namespace, browser `<script>` loading, Node `vm` unit tests, existing localStorage simulation memory.

---

### Task 1: Add failing Fitness protocol and profile tests

**Files:**
- Create: `tests/0810_fitness_calculator_v2.test.js`
- Test: `fitness/types.js`, `fitness/WeightProfile.js`, `fitness/MetricsNormalizer.js`, `fitness/PenaltyCalculator.js`, `fitness/FitnessCalculator.js`

- [ ] **Step 1: Write the test harness and profile contract tests**

```js
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
load('fitness/WeightProfile.js');
load('fitness/MetricsNormalizer.js');
load('fitness/PenaltyCalculator.js');
load('fitness/FitnessCalculator.js');

const A = sandbox.AGE;
assert(A.FitnessProfiles.default_v2);
assert.strictEqual(Object.keys(A.FitnessProfiles.default_v2.weights).length, 5);
assert(Math.abs(Object.values(A.FitnessProfiles.default_v2.weights).reduce((a, b) => a + b, 0) - 1) < 1e-9);
assert.throws(() => A.FitnessProfiles.register('bad', {weights: {fun_proxy: 2}}), /invalid_weight_profile/);
assert.strictEqual(A.FitnessProfiles.resolve('missing').name, 'default_v2');
```

- [ ] **Step 2: Add failing score, clamp, fallback, penalty, confidence, and determinism assertions**

```js
function evaluation(overrides) {
  return Object.assign({
    schema_version: '1.0', status: 'completed', episodes: 3,
    metrics: {
      engagement_proxy: 8, completion_rate: 0.65, death_rate: 0.3,
      coverage: 0.8, play_time: 900, exploration_rate: 0.75,
      skill_usage_diversity: 0.7, route_variation: 0.5,
      early_failure_rate: 0.1, progression_quality: 0.8,
      retry_rate: 0.6
    }, bugs: []
  }, overrides || {});
}

const calculator = new A.FitnessCalculator({game_id: 'game-1', version_id: 'v3'});
const complete = calculator.calculateFitness(evaluation(), {findings: []}, {
  started: true, crashed: false, boot_failures: 0, uncaught_errors: 0,
  invalid_state_count: 0, soft_failures: 0, frame_drop_rate: 0.04,
  avg_fps: 58, target_fps: 60
}, {points: 2, previous_fitness: 0.68}, {
  game_id: 'game-1', version_id: 'v3', mechanics: ['dodge_combat', 'skill_tree', 'random_map'],
  level_structure: {type: 'branching', exploration_depth: 0.72},
  enemy_features: {enemy_types: 12, boss_patterns: 5},
  skill_features: {skill_count: 20, interaction_count: 8}
});
assert.strictEqual(complete.schema_version, '2.0');
assert(complete.final_fitness >= 0 && complete.final_fitness <= 1);
assert(complete.base_fitness >= 0 && complete.base_fitness <= 1);
assert(complete.scores.fun_proxy > 0 && complete.scores.playability > 0);
assert.strictEqual(complete.penalties.qa_penalty, 0);
assert.strictEqual(complete.trend.improvement_delta, Number((complete.final_fitness - 0.68).toFixed(4)));
assert(complete.confidence.overall > 0.8);

const missingMetadata = calculator.calculateFitness(evaluation(), {findings: []}, {}, {});
assert.strictEqual(missingMetadata.scores.novelty, 0.5);
assert.strictEqual(missingMetadata.confidence.novelty, 0.3);
assert(missingMetadata.confidence.overall < complete.confidence.overall);

const qaResult = calculator.calculateFitness(evaluation(), {
  findings: [
    {severity: 'blocking', code: 'bad_dsl'},
    {severity: 'warning', code: 'slow_hint'},
    {severity: 'warning', code: 'empty_reward'}
  ]
}, {}, {});
assert(qaResult.penalties.qa_penalty > 0);
assert(qaResult.penalties.qa_penalty <= 0.35);
assert(qaResult.scores.fun_proxy === complete.scores.fun_proxy || qaResult.scores.fun_proxy !== undefined);

const runtimeResult = calculator.calculateFitness(evaluation(), {findings: []}, {
  started: false, crashed: true, boot_failures: 3, uncaught_errors: 20, soft_failures: 80
}, {});
assert(runtimeResult.penalties.runtime_penalty <= 0.4);
assert(runtimeResult.final_fitness >= 0 && runtimeResult.final_fitness <= 1);

const low = calculator.calculateFitness(evaluation({metrics: {completion_rate: -1, death_rate: 4, engagement_proxy: 100}}), {}, {}, {});
assert(low.scores.fun_proxy >= 0 && low.scores.fun_proxy <= 1);
assert.deepStrictEqual(JSON.parse(JSON.stringify(complete)), JSON.parse(JSON.stringify(calculator.calculateFitness(evaluation(), {findings: []}, {
  started: true, crashed: false, boot_failures: 0, uncaught_errors: 0,
  invalid_state_count: 0, soft_failures: 0, frame_drop_rate: 0.04,
  avg_fps: 58, target_fps: 60
}, {points: 2, previous_fitness: 0.68}, {
  game_id: 'game-1', version_id: 'v3', mechanics: ['dodge_combat', 'skill_tree', 'random_map'],
  level_structure: {type: 'branching', exploration_depth: 0.72},
  enemy_features: {enemy_types: 12, boss_patterns: 5},
  skill_features: {skill_count: 20, interaction_count: 8}
}))));
console.log('fitness calculator v2 tests passed');
```

- [ ] **Step 3: Run the new test to confirm it fails before implementation**

Run: `& $node tests/0810_fitness_calculator_v2.test.js`

Expected: FAIL because `fitness/types.js` does not exist yet.

### Task 2: Implement contracts and configurable weight profiles

**Files:**
- Create: `fitness/types.js`
- Create: `fitness/WeightProfile.js`
- Modify: `tests/0810_fitness_calculator_v2.test.js`

- [ ] **Step 1: Implement bounded helpers and FitnessResult normalization**

Expose `A.FitnessTypes` with `clamp`, `round`, `finite`, `ratio`, `mean`, and `fitnessResult`. `fitnessResult` must deep-copy inputs, clamp all score/confidence fields, round numeric values to four decimals, preserve explanations, and default schema version to `2.0`.

- [ ] **Step 2: Implement `A.FitnessProfiles`**

Register immutable `default_v2` with weights `{fun_proxy:0.30, playability:0.20, balance:0.20, novelty:0.10, stability:0.20}` and parameters `{completion_band:[0.40,0.80], target_death_rate:0.30}`. Implement `register(name, profile)` validation and `resolve(name)` fallback with a `fallback` flag.

- [ ] **Step 3: Run protocol/profile tests**

Run: `& $node tests/0810_fitness_calculator_v2.test.js`

Expected: still FAIL at missing normalizer/calculator, while profile assertions pass.

### Task 3: Implement metric normalization and penalty calculation

**Files:**
- Create: `fitness/MetricsNormalizer.js`
- Create: `fitness/PenaltyCalculator.js`
- Modify: `tests/0810_fitness_calculator_v2.test.js`

- [ ] **Step 1: Normalize EvaluationResult metrics**

Implement `A.MetricsNormalizer.evaluation(evaluation)` to read both `evaluation.metrics.*` and optional top-level V2 metrics, clamp ratios to `[0,1]`, clamp `engagement_proxy` to `[0,10]`, use neutral `0.5` only for missing optional inputs, and return availability flags for confidence.

- [ ] **Step 2: Normalize runtime and trend inputs**

Implement `runtime(runtime)` with finite counters and booleans, and `trend(trend)` accepting `{previous_fitness}` plus the existing SimulationMemory trend shape. Never throw for null, malformed, or non-finite values.

- [ ] **Step 3: Implement independent QA/runtime penalties**

Flatten `qa.findings`, `qa.structural.errors`, `qa.errors`, and explicit count fields. Count severity aliases, apply caps `0.35` and `0.40`, and return `{critical_bugs, soft_failures, qa_penalty, runtime_penalty, explanations}`. Do not mutate normalized dimension inputs.

- [ ] **Step 4: Run tests and verify penalties stay bounded**

Run: `& $node tests/0810_fitness_calculator_v2.test.js`

Expected: normalizer/penalty tests pass; calculator assertions remain the only failures.

### Task 4: Implement deterministic FitnessCalculator dimensions

**Files:**
- Create: `fitness/FitnessCalculator.js`
- Modify: `tests/0810_fitness_calculator_v2.test.js`

- [ ] **Step 1: Implement target-band and target-death scoring helpers**

Use `[0.40,0.80]` for completion quality and a triangular death-quality function peaking at `0.30`; keep both parameters on the resolved profile.

- [ ] **Step 2: Implement the five dimensions**

Compute `fun_proxy`, `playability`, `balance`, `novelty`, and `stability` exactly as specified in the design document. Novelty with valid metadata uses mechanic diversity, system interaction, structure variation, and content variation; missing or mismatched metadata returns `0.5` and confidence `0.3`.

- [ ] **Step 3: Implement weighted aggregation, confidence, explanations, and trend**

Compute `base_fitness`, subtract independent penalties, clamp to `[0,1]`, calculate profile-weighted confidence with incomplete-evaluation caps, report `previous_fitness` and `improvement_delta`, and sort explanations by absolute numeric impact then factor name.

- [ ] **Step 4: Run the complete calculator test**

Run: `& $node tests/0810_fitness_calculator_v2.test.js`

Expected: `fitness calculator v2 tests passed`.

### Task 5: Add Blueprint Metadata extraction adapter

**Files:**
- Create: `ai/evaluation/BlueprintMetadata.js`
- Modify: `tests/0810_fitness_calculator_v2.test.js`
- Create: `tests/0810_blueprint_metadata_v2.test.js`

- [ ] **Step 1: Write extraction tests**

Assert deterministic extraction from a representative `Game Blueprint` and DSL, deduplicated mechanics, normalized level structure, counts for enemies/boss patterns/skills, and identifier propagation. Assert missing fields are omitted rather than invented.

- [ ] **Step 2: Implement the adapter**

Expose `A.BlueprintMetadata.fromBlueprint(blueprint, dsl, intent)` and traverse deterministic known fields. Map topology names to the metadata contract and derive mechanics only from present arrays/objects.

- [ ] **Step 3: Run extraction tests**

Run: `& $node tests/0810_blueprint_metadata_v2.test.js`

Expected: `blueprint metadata v2 tests passed`.

### Task 6: Extend AgentProtocols and SimulationMemory compatibly

**Files:**
- Modify: `ai/protocols/AgentProtocols.js`
- Modify: `ai/simulation/SimulationMemory.js`
- Modify: `tests/0806_agent_protocols_v1.test.js`
- Modify: `tests/0806_simulation_memory_v1.test.js`

- [ ] **Step 1: Add `fitnessResult` protocol normalization**

Expose `A.AgentProtocols.fitnessResult(input)` as a compatibility wrapper around `A.FitnessTypes.fitnessResult` when loaded, with a safe normalized fallback when the calculator scripts are not present. Add assertions that V1 evaluation/proposal behavior is unchanged.

- [ ] **Step 2: Persist optional fitness without breaking legacy records**

Extend `SimulationMemory.append` to deep-copy `record.fitness` when supplied, leave it absent for old callers, and continue reading records with only V1 evaluation fields.

- [ ] **Step 3: Run all affected V1 tests**

Run: `& $node tests/0806_agent_protocols_v1.test.js; & $node tests/0806_simulation_memory_v1.test.js`

Expected: both existing tests pass.

### Task 7: Integrate Fitness into GameDirector and Director result

**Files:**
- Modify: `ai/director/GameDirector.js`
- Modify: `tests/0806_game_director_v2.test.js`
- Modify: `tests/0806_multi_agent_director_v1.test.js`

- [ ] **Step 1: Add failing Director fitness assertions**

Inject a deterministic `FitnessCalculator` into `GameDirector`, return a known `fitness` object, assert Director passes FinalQA, simulation evaluation, runtime metrics, prior-memory trend, and extracted blueprint metadata to the calculator, and assert the saved record contains `fitness`.

- [ ] **Step 2: Add a runtime metrics adapter**

Collect safe runtime values around Engine load/simulation: started, crashed, boot failures, uncaught errors, invalid state count, soft failures, frame drop rate, average FPS, and target FPS. Missing engine instrumentation must yield `{}` so the calculator uses neutral stability with low confidence.

- [ ] **Step 3: Calculate V2 fitness after bounded simulation**

After FinalQA admission and SimulationAgent completion, read the previous memory record for the same game/persona, build the trend input, call `calculateFitness(evaluation, qa, runtime, trend, metadata)`, and append the same FitnessResult in the simulation record. Fitness failures must not reject an otherwise valid game; return an incomplete low-confidence fitness result and preserve legacy score.

- [ ] **Step 4: Preserve legacy fields and expose V2 result**

Return `fitness` from `runDirectorLoop`, retain `score` and `history`, and add a status message that includes `Fitness` and the normalized final value. Ensure failed FinalQA paths never call the calculator or SimulationAgent.

- [ ] **Step 5: Run Director integration tests**

Run: `& $node tests/0806_game_director_v2.test.js; & $node tests/0806_multi_agent_director_v1.test.js`

Expected: both pass, including old rejected-DSL and incomplete-simulation behavior.

### Task 8: Load scripts and update UI compatibility

**Files:**
- Modify: `AI-ENGINE启动.html`
- Modify: `game.html`
- Modify: `main.js`
- Modify: `tests/0806_multi_agent_director_v1.test.js`

- [ ] **Step 1: Add script-order assertions**

Assert `fitness/types.js`, `fitness/WeightProfile.js`, `fitness/MetricsNormalizer.js`, `fitness/PenaltyCalculator.js`, and `fitness/FitnessCalculator.js` occur before `GameDirector.js` in both HTML entry points, and `BlueprintMetadata.js` occurs before `GameDirector.js`.

- [ ] **Step 2: Add fitness scripts in dependency order**

Place the five `fitness/` scripts and `ai/evaluation/BlueprintMetadata.js` before `GameDirector.js` while preserving existing V1 script ordering.

- [ ] **Step 3: Update Director summary defensively**

When `result.fitness` exists, display `Fitness: <percent>%` and avoid calling it a fun score. When absent, retain the current legacy summary. Do not change ordinary generation mode.

- [ ] **Step 4: Run UI/script-order tests**

Run: `& $node tests/0806_multi_agent_director_v1.test.js; & $node tests/0806_consultant_ui_v1.test.js; & $node tests/0806_rag_ui_v1.test.js`

Expected: all pass.

### Task 9: Full regression, documentation, and browser verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Document the V2 boundary**

Document `default_v2`, the `calculateFitness` inputs, confidence behavior, independent penalties, optional metadata, and the explicit absence of GA/RL training.

- [ ] **Step 2: Run every JavaScript test**

```powershell
$tests=Get-ChildItem -LiteralPath tests -Filter "*.test.js" | Sort-Object Name
foreach($test in $tests){& $node $test.FullName; if($LASTEXITCODE -ne 0){throw "JS test failed: $($test.Name)"}}
```

Expected: every JavaScript test prints its pass message and exits 0.

- [ ] **Step 3: Run every Python test**

```powershell
$tests=Get-ChildItem -LiteralPath tests -Filter "*.test.py" | Sort-Object Name
foreach($test in $tests){& $python $test.FullName; if($LASTEXITCODE -ne 0){throw "Python test failed: $($test.Name)"}}
```

Expected: all Python tests report `OK`.

- [ ] **Step 4: Start the static server and smoke test Director mode**

```powershell
& $python -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/AI-ENGINE%E5%90%AF%E5%8A%A8.html`, generate through Director mode, verify the generated game launches, status text shows normalized Fitness, and `age_simulation_memory_v1` contains a record with `fitness.schema_version === '2.0'`. Also verify ordinary generation still works unchanged.

- [ ] **Step 5: Record evidence**

Report exact pass counts, browser URL, and any unavailable external API/RAG dependency. Do not claim live API success when only offline fallback was verified.

## Self-Review

- Spec coverage: Tasks 1-4 implement the five calculator units and formulas; Task 5 implements optional Blueprint Metadata; Task 6 adds protocol/memory compatibility; Tasks 7-8 integrate Director/UI; Task 9 verifies and documents the result.
- Placeholder scan: no TBD/TODO or unspecified implementation steps remain.
- Type consistency: the implementation uses `calculateFitness(evaluation, qa, runtime, trend, blueprintMetadata)` consistently, while Director constructs identifiers through the calculator instance.
- Scope: GA and RL are explicitly reserved interfaces only; no training or mutation work is included.
