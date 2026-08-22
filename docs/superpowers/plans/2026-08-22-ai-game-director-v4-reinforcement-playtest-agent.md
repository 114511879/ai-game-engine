# AI Game Director V4 Reinforcement PlayTest Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the V4 bug-discovery PlayTest Agent as a deterministic, offline-trainable layer that integrates with V3 without changing V2 Fitness or V3 GA ranking semantics.

**Architecture:** Add a browser-independent Pure Core under `playtest/`, Engine-facing Runtime Adapters, independent `ReplayBuffer`/`PolicyStore`/`TrainingMemory`, and orchestration services for evaluation, training, validation, and Policy promotion. V3 `CandidateEvaluator` remains authoritative for `FitnessResult 2.0`; V4 runs afterward in a separate reset/load session only when explicitly enabled.

**Tech Stack:** Existing browser IIFE modules on `window.AGE`, plain JavaScript, Node `vm` unit tests, browser script tags in `AI-ENGINE启动.html` and `game.html`, localStorage persistence, and the existing V3 `evolution/SeededPRNG.js` FNV-1a/Mulberry32 primitive.

---

## Repository map and conventions

- Existing deterministic primitive: `evolution/SeededPRNG.js` and `evolution/EvolutionProtocols.js`.
- Existing V3 evaluator/orchestration: `evolution/CandidateEvaluator.js`, `evolution/EvolutionRunner.js`, `ai/director/GameDirector.js`.
- Existing Engine observation sources: `ai/tester/agent.js`, `ai/tester/observer.js`, `ai/tester/anomaly.js`.
- Existing browser script loading: `AI-ENGINE启动.html` and `game.html` list scripts in dependency order.
- Existing JS tests create a `window`/`AGE` vm sandbox and load files with `vm.runInContext`; new Pure Core tests must use the same pattern and must not require a browser or canvas.
- Existing test commands are direct Node invocations, for example `node tests/0815_candidate_evaluator_v3.test.js`; Python tests use `python tests/0806_rag_pipeline_v1.test.py`.

## Task 1: Freeze shared V4 protocol contracts and test harness

**Files:**
- Create: `playtest/PlayTestProtocols.js`
- Create: `tests/0822_playtest_protocols_v4.test.js`
- Modify: `AI-ENGINE启动.html` (add the new script after `evolution/SeededPRNG.js`)
- Modify: `game.html` (same script ordering)

- [ ] **Step 1: Write failing contract tests**

Test that protocol constructors normalize the exact frozen defaults: state/action/episode/replay/reward/training/policy/validation profiles; reject unsupported status values; preserve `unknown`; and expose `schema_version: "4.0"`.

```js
const profile = A.PlayTestProtocols.playtestProfile({});
assert.strictEqual(profile.episode.max_macro_transitions, 40);
assert.strictEqual(profile.replay_confirmation.deterministic.required_successes, 1);
assert.strictEqual(profile.training.sample_repetition.confirmed, 4);
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node tests/0822_playtest_protocols_v4.test.js`

Expected: FAIL because `playtest/PlayTestProtocols.js` does not exist.

- [ ] **Step 3: Implement the minimal immutable protocol normalizers**

Expose pure functions for `stateProfile`, `actionProfile`, `episodeProfile`, `rewardProfile`, `trainingProfile`, `policyStoreProfile`, `validationProfile`, `playtestProfile`, and status validators. Deep-copy inputs and clamp only fields whose schema explicitly permits it; do not silently repair invalid runtime data.

- [ ] **Step 4: Add script tags and rerun the focused test**

Run: `node tests/0822_playtest_protocols_v4.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add playtest/PlayTestProtocols.js tests/0822_playtest_protocols_v4.test.js AI-ENGINE启动.html game.html
git commit -m "feat: add v4 playtest protocol contracts"
```

## Task 2: Implement canonical State encoding and capability-gated Macro Actions

**Files:**
- Create: `playtest/CoreStateEncoder.js`
- Create: `playtest/GameTypeStateAdapter.js`
- Create: `playtest/CanonicalStateSerializer.js`
- Create: `playtest/MacroActionSchema.js`
- Create: `tests/0822_state_action_v4.test.js`

- [ ] **Step 1: Write failing State tests**

Cover fixed Core field order, sorted Adapter fields, `unknown`, bucketed numeric input, rejection of raw continuous values, and the six-feature Adapter cap. Assert that key insertion order and exact coordinates do not change `state_id` when the normalized semantic vector is unchanged.

```js
const a = encoder.encode({player: {x: 10.01, hp: 7}, ...snapshot}, adapter);
const b = encoder.encode({player: {x: 10.99, hp: 7}, ...snapshot}, adapter);
assert.strictEqual(a.state_id, b.state_id);
```

- [ ] **Step 2: Write failing Macro tests**

Test static action IDs, capability failure versus precondition failure, `1..120` frame validation, maximum six Adapter actions, rejection of random/dynamic definitions, and canonical action schema hash.

- [ ] **Step 3: Run focused tests to verify failure**

Run: `node tests/0822_state_action_v4.test.js`

Expected: FAIL with missing module errors.

- [ ] **Step 4: Implement pure encoders and schemas**

`CoreStateEncoder.encode(snapshot)` returns only discrete Core fields. `GameTypeStateAdapter.encode(snapshot, context)` is a pure contract. `CanonicalStateSerializer.serialize(fields)` sorts Adapter keys and emits stable `key=value|...` text before hashing. `MacroActionSchema.validate(definition, capabilities, state)` returns deterministic findings without executing Engine code.

- [ ] **Step 5: Rerun focused tests and commit**

Run: `node tests/0822_state_action_v4.test.js`

Expected: PASS.

```bash
git add playtest/CoreStateEncoder.js playtest/GameTypeStateAdapter.js playtest/CanonicalStateSerializer.js playtest/MacroActionSchema.js tests/0822_state_action_v4.test.js
git commit -m "feat: add v4 canonical states and macro action schemas"
```

## Task 3: Add deterministic EpisodeTracker and MacroActionExecutor contract

**Files:**
- Create: `playtest/EpisodeTracker.js`
- Create: `playtest/MacroActionExecutor.js`
- Create: `tests/0822_episode_v4.test.js`

- [ ] **Step 1: Write failing lifecycle tests**

Test the 40-transition, 1200-tick, 120000-ms, and eight-no-progress boundaries; reset on a new state/event/Finding/progress signature; terminal handling without implicit negative Reward; and all termination reasons.

- [ ] **Step 2: Write failing cleanup tests**

Inject an executor that throws, times out, or receives cancellation. Assert that `releaseAllInputs`, executor cancellation, and resource cleanup execute exactly once in a `finally` path.

- [ ] **Step 3: Run focused tests to verify failure**

Run: `node tests/0822_episode_v4.test.js`

Expected: FAIL because the tracker and executor are not defined.

- [ ] **Step 4: Implement deterministic transition accounting**

`EpisodeTracker.recordTransition({state_id, events, finding_ids, progress_signature, simulation_ticks, terminal})` updates counters and returns `{status, termination_reason}`. `MacroActionExecutor.execute(action, context)` must validate duration, call the injected input driver, and release all inputs in `finally`; it cannot generate actions or randomness.

- [ ] **Step 5: Verify and commit**

Run: `node tests/0822_episode_v4.test.js`

Expected: PASS.

```bash
git add playtest/EpisodeTracker.js playtest/MacroActionExecutor.js tests/0822_episode_v4.test.js
git commit -m "feat: add bounded v4 episode lifecycle"
```

## Task 4: Implement normalized anomaly rules, Finding fingerprints, and seeded Replay

**Files:**
- Create: `playtest/ObservationNormalizer.js`
- Create: `playtest/AnomalyRuleRegistry.js`
- Create: `playtest/FindingFingerprintBuilder.js`
- Create: `playtest/ReplayRunner.js`
- Create: `tests/0822_anomaly_replay_v4.test.js`

- [ ] **Step 1: Write failing rule and fingerprint tests**

Use normalized snapshots/events only. Cover state, physics/boundary, logical, and temporal invariant rules; stable `rule_id`/semantic fingerprint version; exact coordinate changes not creating new fingerprints; and no wall-clock dependency.

- [ ] **Step 2: Write failing Replay tests**

Cover recorded Macro sequence replay, derived finding/replay seeds, deterministic 1/1, non-deterministic/unknown 2/3, early success/failure decisions, different fingerprint rejection, and `cancelled`/`incomplete` remaining provisional.

- [ ] **Step 3: Run the focused test to verify failure**

Run: `node tests/0822_anomaly_replay_v4.test.js`

Expected: FAIL with missing rule/fingerprint/replay modules.

- [ ] **Step 4: Implement pure rule registry and fingerprint builder**

`ObservationNormalizer` must expose a stable snapshot/event shape without private Engine reads. `AnomalyRuleRegistry.detect(snapshot, events, history, context)` returns Findings only. `FindingFingerprintBuilder.build(finding)` hashes stable semantic context and excludes run IDs, timestamps, exact continuous values, Reward, and Policy metadata.

- [ ] **Step 5: Implement ReplayRunner**

`ReplayRunner.confirm(finding, replayContext)` restores the checkpoint, executes the original sequence, derives `finding_seed = candidate_seed + ":finding:" + index` and attempt seeds, compares exact fingerprints, and stops once the configured criterion is decided.

- [ ] **Step 6: Verify and commit**

Run: `node tests/0822_anomaly_replay_v4.test.js`

Expected: PASS.

```bash
git add playtest/ObservationNormalizer.js playtest/AnomalyRuleRegistry.js playtest/FindingFingerprintBuilder.js playtest/ReplayRunner.js tests/0822_anomaly_replay_v4.test.js
git commit -m "feat: add deterministic v4 anomaly and replay confirmation"
```

## Task 5: Implement Event Ledger, delayed relabeling, and stratified ReplayBuffer

**Files:**
- Create: `playtest/RewardLedger.js`
- Create: `playtest/ReplayBuffer.js`
- Create: `tests/0822_reward_buffer_v4.test.js`

- [ ] **Step 1: Write failing Reward tests**

Assert `provisional -> finalized`, `provisional -> revoked/downgraded`, `cancelled/incomplete -> provisional`, original/final values, per-factor caps, duplicate decay, and confirmed Bug reward not being exceeded by shaping rewards.

- [ ] **Step 2: Write failing Buffer tests**

Assert `confirmed`, `negative_evidence`, and `exploration` strata; 4/2/1 sample repetition without mutating Reward; independent FIFO eviction; immutable transition shape; Ledger references; and incomplete transition exclusion.

- [ ] **Step 3: Run focused tests to verify failure**

Run: `node tests/0822_reward_buffer_v4.test.js`

Expected: FAIL because the Ledger and Buffer do not exist.

- [ ] **Step 4: Implement RewardLedger**

`RewardLedger.recordProvisional`, `finalizeFinding`, `rejectFinding`, and `entries()` must be deterministic and auditable. The Ledger owns Reward values; it must not import FitnessCalculator, UI, or LLM code.

- [ ] **Step 5: Implement stratified ReplayBuffer**

Store canonical `{state_id, action_id, reward, next_state_id, terminal, trajectory_id, finding_id, reward_ledger_ref, stratum}` transitions. Snapshot and restore must use canonical serialization; raw Engine snapshots are excluded.

- [ ] **Step 6: Verify and commit**

Run: `node tests/0822_reward_buffer_v4.test.js`

Expected: PASS.

```bash
git add playtest/RewardLedger.js playtest/ReplayBuffer.js tests/0822_reward_buffer_v4.test.js
git commit -m "feat: add v4 reward ledger and stratified replay buffer"
```

## Task 6: Implement deterministic offline Q-Learning and pure Policy validation

**Files:**
- Create: `playtest/QLearningTrainer.js`
- Create: `playtest/PolicyValidator.js`
- Create: `tests/0822_training_validation_v4.test.js`

- [ ] **Step 1: Write failing training tests**

Use a fixed Dataset Snapshot and seed to assert identical Q-table/hash on repeated training. Cover terminal no-bootstrap, three-epoch/5000-update stop, independent seeded stratum ordering, and epsilon remaining unchanged during training.

- [ ] **Step 2: Write failing validation tests**

Cover schema/hash/finite-Q/fatal hard gates, all non-regression inequalities, `null` reproduction rate semantics, strict lexicographic improvement, equal scorecard `no_improvement`, candidate-only fatal regressions, and prospective epsilon:

```js
assert.strictEqual(proposedEpsilon(0.20), 0.19);
assert.strictEqual(proposedEpsilon(0.04), 0.05);
```

- [ ] **Step 3: Run focused tests to verify failure**

Run: `node tests/0822_training_validation_v4.test.js`

Expected: FAIL with missing trainer/validator modules.

- [ ] **Step 4: Implement QLearningTrainer**

`train({parentPolicy, datasetSnapshot, profile, trainingSeed})` must expand strata by 4/2/1 exposure, use separate derived PRNG streams, apply standard Q-Learning, stop at the first exhausted budget, and return Q-table, update counts, epochs, and canonical Policy hash.

- [ ] **Step 5: Implement PolicyValidator**

`compare({activeScorecard, candidateScorecard, hardGates, proposedEpsilon})` first rejects hard/non-regression failures, then returns `promotion_eligible`, `no_improvement`, or `rejected` with the deciding metric. It must not run Engine episodes or mutate storage.

- [ ] **Step 6: Verify and commit**

Run: `node tests/0822_training_validation_v4.test.js`

Expected: PASS.

```bash
git add playtest/QLearningTrainer.js playtest/PolicyValidator.js tests/0822_training_validation_v4.test.js
git commit -m "feat: add deterministic offline q learning and policy gates"
```

## Task 7: Implement PolicyStore, TrainingMemory, and transactional PolicyPromoter

**Files:**
- Create: `playtest/PolicyStore.js`
- Create: `playtest/TrainingMemory.js`
- Create: `playtest/PolicyPromoter.js`
- Create: `tests/0822_policy_persistence_v4.test.js`

- [ ] **Step 1: Write failing persistence tests**

Cover one `current_active`, ten retained promoted versions, independent fifty-run TrainingMemory retention, full Q-table retention for promoted Policies, rejected metadata without rejected Q-table, and explicit rollback restoring the target Policy epsilon.

- [ ] **Step 2: Write failing transaction tests**

Inject failures in candidate write, hash verification, TrainingMemory write, and active switch. Assert the previous `current_active` remains unchanged and no partial promotion is visible.

- [ ] **Step 3: Run focused tests to verify failure**

Run: `node tests/0822_policy_persistence_v4.test.js`

Expected: FAIL with missing stores/promoter.

- [ ] **Step 4: Implement canonical PolicyStore and TrainingMemory**

Use separate storage keys. `PolicyStore.activate(version)` must require an explicit retained version, valid canonical hash, and current compatibility. `TrainingMemory.append(run)` stores immutable Dataset Snapshot manifests, training results, validation scorecards, and decisions.

- [ ] **Step 5: Implement PolicyPromoter**

Expose `promote(candidate, validation)` and make it the only writer of `current_active`. Stage candidate, verify hash/persistence, append promotion decision, switch active as the final commit, and rollback all staged data on any failure. Equal scorecards must clear the candidate Q-table without creating rejected metadata.

- [ ] **Step 6: Verify and commit**

Run: `node tests/0822_policy_persistence_v4.test.js`

Expected: PASS.

```bash
git add playtest/PolicyStore.js playtest/TrainingMemory.js playtest/PolicyPromoter.js tests/0822_policy_persistence_v4.test.js
git commit -m "feat: add v4 policy persistence and promotion transactions"
```

## Task 8: Build Runtime adapters and PlayTestEvaluator

**Files:**
- Create: `playtest/EngineAdapter.js`
- Create: `playtest/PlayTestEvaluator.js`
- Create: `playtest/PlayTestRunCoordinator.js`
- Create: `tests/0822_playtest_evaluator_v4.test.js`
- Reference: `ai/tester/agent.js`, `ai/tester/observer.js`, `ai/tester/anomaly.js`

- [ ] **Step 1: Write failing runtime isolation tests**

Inject a fake Engine, Macro executor, Rule Registry, ReplayRunner, and Policy. Assert that each Episode starts from a fresh checkpoint, V3 and V4 sessions are separated by teardown/reset/load, all unique candidates receive one Episode when enabled, duplicates receive none, and elite results are reused.

- [ ] **Step 2: Write failing budget/cancellation tests**

Cover 18 Discovery slots, 24 Replay attempts, deterministic Finding ordering, provisional status after Replay budget exhaustion, and cancellation that releases inputs without calling Training or Promotion.

- [ ] **Step 3: Run focused tests to verify failure**

Run: `node tests/0822_playtest_evaluator_v4.test.js`

Expected: FAIL because runtime adapters do not exist.

- [ ] **Step 4: Implement EngineAdapter and PlayTestEvaluator**

`EngineAdapter` exposes only normalized snapshots/events, `reset`, `load`, `teardown`, checkpoint restore, and input cleanup. `PlayTestEvaluator.evaluate(candidateDSL, {policySnapshot, candidate_seed, playtestProfile, signal})` returns a separate `playtest` envelope and never writes `evaluation.bugs` or `fitness`.

- [ ] **Step 5: Implement PlayTestRunCoordinator**

Track Discovery started/completed/incomplete, duplicate skips, elite reuse, and Replay attempts. Run all Discovery Episodes first, then build the deterministic Replay Queue using transition/fingerprint/candidate ordering.

- [ ] **Step 6: Verify and commit**

Run: `node tests/0822_playtest_evaluator_v4.test.js`

Expected: PASS.

```bash
git add playtest/EngineAdapter.js playtest/PlayTestEvaluator.js playtest/PlayTestRunCoordinator.js tests/0822_playtest_evaluator_v4.test.js
git commit -m "feat: add sequential v4 playtest evaluator"
```

## Task 9: Integrate V4 into V3 CandidateEvaluator and EvolutionRunner without Fitness changes

**Files:**
- Modify: `evolution/CandidateEvaluator.js`
- Modify: `evolution/EvolutionRunner.js`
- Modify: `evolution/EvolutionMemory.js` (store run-level V4 references only)
- Create: `tests/0822_v3_v4_integration.test.js`

- [ ] **Step 1: Write failing isolation tests**

Assert the default path makes zero PlayTest calls; enabled V4 runs only after V3 Fitness and after teardown/reset/load; V4 timeout/incomplete does not change `fitness.final_fitness`, `max_failed_candidates`, or GA ranking; and V4 Finding never appears in `evaluation.bugs`.

- [ ] **Step 2: Write failing baseline/elite/duplicate tests**

Assert baseline gets one V4 Discovery Episode when enabled, deterministic- QA-rejected candidates get none, duplicates get none, and reused elites do not create a second PlayTest Evaluation.

- [ ] **Step 3: Run focused integration tests to verify failure**

Run: `node tests/0822_v3_v4_integration.test.js`

Expected: FAIL until the evaluator contract is extended.

- [ ] **Step 4: Add an optional `playtest` dependency and envelope**

Preserve the existing return fields and append `playtest` only when enabled. Invoke V4 with a fresh session and the frozen Policy snapshot. Do not pass V4 findings into `FitnessCalculator` or `EvaluationResult.bugs`.

- [ ] **Step 5: Preserve V3 budgets and trace semantics**

Increment V3 evaluated/failed counters exactly as before. Record V4 status and budget stats separately in `playtest`/run metadata. V4 budget exhaustion returns `not_run`/`provisional` details without stopping the GA.

- [ ] **Step 6: Verify all V3 and focused V4 tests, then commit**

Run: `node tests/0815_candidate_evaluator_v3.test.js; node tests/0815_evolution_runner_v3.test.js; node tests/0822_v3_v4_integration.test.js`

Expected: all PASS.

```bash
git add evolution/CandidateEvaluator.js evolution/EvolutionRunner.js evolution/EvolutionMemory.js tests/0822_v3_v4_integration.test.js
git commit -m "feat: integrate optional v4 playtest without changing v3 fitness"
```

## Task 10: Add offline TrainingCoordinator and Holdout ValidationRunner

**Files:**
- Create: `playtest/TrainingCoordinator.js`
- Create: `playtest/ValidationRunner.js`
- Create: `tests/0822_training_coordinator_v4.test.js`

- [ ] **Step 1: Write failing coordinator tests**

Cover safe-run-close ordering: finalize Ledger -> update Buffer -> immutable Dataset Snapshot -> train; confirm an Evolution cancel can produce training data, while a Training cancel stops before Policy promotion.

- [ ] **Step 2: Write failing Holdout tests**

Assert Holdout transitions never enter ReplayBuffer or Dataset Snapshot, Active and Candidate run in the same validation invocation, prospective epsilon is used, and scorecard equal returns `no_improvement`.

- [ ] **Step 3: Run focused tests to verify failure**

Run: `node tests/0822_training_coordinator_v4.test.js`

Expected: FAIL because the coordinators do not exist.

- [ ] **Step 4: Implement TrainingCoordinator**

Use an operation-scoped AbortSignal. Snapshot the Buffer before training, call `QLearningTrainer`, persist the TrainingMemory result, validate the Candidate, and call `PolicyPromoter` only for `promotion_eligible`. Never mutate active epsilon before commit.

- [ ] **Step 5: Implement ValidationRunner**

Execute fixed Holdout scenarios with identical seeds/configuration for Active and Candidate, calculate the scorecards, derive `fatal_runtime_regressions` as candidate-only failures, and pass only pure data to `PolicyValidator`.

- [ ] **Step 6: Verify and commit**

Run: `node tests/0822_training_coordinator_v4.test.js`

Expected: PASS.

```bash
git add playtest/TrainingCoordinator.js playtest/ValidationRunner.js tests/0822_training_coordinator_v4.test.js
git commit -m "feat: add v4 offline training and holdout validation"
```

## Task 11: Add explicit UI/status surface and operation cancellation

**Files:**
- Modify: `AI-ENGINE启动.html` (V4 status elements adjacent to the existing Evolution panel)
- Modify: `main.js` (V4 opt-in, status rendering, operation-scoped AbortControllers)
- Modify: `game.html` (script tags and runtime bootstrap if the game page exposes Director controls)
- Create: `tests/0822_playtest_ui_v4.test.js`

- [ ] **Step 1: Write failing UI contract tests**

Assert ordinary Generate, Director, and V3 Evolution set `playtest.enabled=false`; explicit Evolution PlayTest mode shows Policy version/hash, Discovery started/completed, Replay attempts, confirmed/provisional counts, and Training status without making UI decisions for GA/RL.

- [ ] **Step 2: Write failing cancellation tests**

Assert clicking Stop cancels only the active Evolution/PlayTest operation; later Training receives a fresh signal; cancelling Training leaves active Policy unchanged and reports a cancelled TrainingMemory entry.

- [ ] **Step 3: Run focused UI tests to verify failure**

Run: `node tests/0822_playtest_ui_v4.test.js`

Expected: FAIL until the UI and bootstrap wiring exist.

- [ ] **Step 4: Add script loading in dependency order**

Load the Pure Core before Runtime/Orchestration scripts in both HTML files. Do not instantiate V4 globally for ordinary paths; construct it only from the explicit Evolution/PlayTest action.

- [ ] **Step 5: Add status-only rendering**

Render `policy_version`, `policy_hash`, episode/replay budgets, Finding counts, and Training/Promotion status. UI must not alter seeds, action choice, Reward, Fitness, validation, or promotion decisions.

- [ ] **Step 6: Verify and commit**

Run: `node tests/0822_playtest_ui_v4.test.js`

Expected: PASS.

```bash
git add AI-ENGINE启动.html game.html main.js tests/0822_playtest_ui_v4.test.js
git commit -m "feat: add explicit v4 playtest status and cancellation UI"
```

## Task 12: Add complete V4 release gate and regression coverage

**Files:**
- Create: `tests/0822_v4_release_gate.test.js`
- Modify: `README.md` (V4 architecture and opt-in behavior)
- Modify: `CHANGELOG.md` (V4 release entry only after all tests pass)

- [ ] **Step 1: Write the release-gate test matrix**

Include deterministic State/Action/Finding/Replay/Reward/Training hashes; adapter feature/action limits; Macro/input cleanup; all Episode termination reasons; Replay 1/1 and 2/3 early decisions; Reward delayed relabeling; stratified 4/2/1 sampling; terminal no-bootstrap; immutable snapshots; Policy transaction/rollback; and all V3 isolation assertions.

- [ ] **Step 2: Run the new gate before changing documentation**

Run: `node tests/0822_v4_release_gate.test.js`

Expected initially: FAIL until every earlier task is complete. Do not weaken assertions to make the gate pass.

- [ ] **Step 3: Run the full JavaScript and Python regression suites**

Run:

```powershell
Get-ChildItem tests -Filter '*.test.js' | ForEach-Object { node $_.FullName }
Get-ChildItem tests -Filter '*.test.py' | ForEach-Object { python $_.FullName }
```

Expected: every V1, V2, V3, and V4 test passes; V3 counts remain unchanged from the pre-V4 baseline.

- [ ] **Step 4: Update user-facing documentation**

Document that V4 is opt-in, list the separate Game and Policy optimization loops, and state that V4 findings/rewards do not modify V2 `final_fitness`.

- [ ] **Step 5: Commit the release gate and docs**

```bash
git add tests/0822_v4_release_gate.test.js README.md CHANGELOG.md
git commit -m "test: add v4 release gate and compatibility coverage"
```

## Plan self-review

- Spec coverage: all frozen sections map to Tasks 1-12: contracts, State/Action, Episodes, anomaly/replay, Reward/Buffer, training/validation, persistence/promotion, runtime evaluation, V3 integration, cancellation, UI, and release tests.
- Determinism is split into evaluation and training scopes, with wall-clock explicitly excluded from semantic reproducibility.
- `no_improvement` is represented as a TrainingMemory decision, not a PolicyStore state.
- V4 budgets are independent from V3 budgets and are tested separately.
- Holdout data is explicitly excluded from ReplayBuffer and Dataset Snapshots.
- No task contains `TBD`, `TODO`, or an unspecified implementation action; each code task names exact files, interfaces, tests, commands, and expected outcomes.

Plan execution must preserve the approved design document:
`docs/superpowers/specs/2026-08-22-ai-game-director-v4-reinforcement-playtest-agent-design.md`.
