# AI Game Director V4 Reinforcement PlayTest Agent

**Status:** Approved / Frozen design
**Date:** 2026-08-22
**Scope:** V4.0 Bug Discovery PlayTest Agent built on the V1 multi-agent pipeline, V2 FitnessResult 2.0, and V3 Genetic Evolution.

## 1. Purpose

V4 trains a `bug_hunter` PlayTest Agent whose primary objective is:

```json
{
  "objective": "bug_discovery",
  "priority": "primary",
  "goal": "maximize_reproducible_novel_defect_discovery"
}
```

V4 is a controlled, reproducible learning layer. It does not replace the V3 game-quality optimizer and does not change V2 `final_fitness` semantics.

The two optimization loops remain independent:

```text
FitnessResult 2.0 -> GeneticOptimizer -> Game Candidate -> EvolutionPromoter -> current_version
PlayTestReward   -> QLearningTrainer -> Policy Candidate -> PolicyPromoter   -> current_active
```

## 2. Non-goals

- V4.0 does not optimize game completion or speed-running.
- V4.0 does not introduce DQN, neural-network inference, or prioritized experience replay.
- V4.0 does not call LLMs for candidate QA, anomaly detection, reward calculation, or replay decisions.
- V4.0 does not run concurrently on the shared Engine/canvas.
- V4.0 findings do not automatically reject a game candidate, modify V2 Fitness, or enter `EvaluationResult.bugs`.

## 3. Global invariants

1. A run freezes one Policy snapshot. Policy learning occurs only after safe run close.
2. All randomness uses the shared versioned V3/V4 SeededPRNG primitive: UTF-8 seed -> FNV-1a 32-bit -> Mulberry32. Bare `Math.random()` is forbidden in deterministic modules.
3. The same Policy, schemas, Engine configuration, scenario, and seed produce the same state IDs, actions, findings, fingerprints, replay decisions, reward ledger, Q-table, and Policy hash.
4. Candidate experiments and official versions have separate histories. V4 learning history and executable Policy versions also have separate histories.
5. Every Engine action path releases inputs and cleans resources in `finally`.
6. V4 failure cannot overwrite V3 Fitness, GA ranking, `current_version`, or the existing active Policy.

## 4. Layered architecture

```text
Director / UI
      |
      v
Orchestration
      |
      +--> Runtime Adapters --> Pure Core
      |
      +--> Persistence
```

### 4.1 Pure Core

Pure Core is browser-independent and has no Engine, DOM, Storage, UI, or LLM dependency.

- Shared SeededPRNG
- `CoreStateEncoder`
- `GameTypeStateAdapter` contract
- `CanonicalStateSerializer`
- `MacroActionSchema` and validation
- `EpisodeTracker`
- `AnomalyRuleRegistry`
- `FindingFingerprintBuilder`
- `RewardLedger`
- `QLearningTrainer`
- `PolicyValidator`

`PolicyValidator` only compares supplied Active/Candidate validation scorecards. It never runs the Engine, accesses PolicyStore, or activates a Policy.

### 4.2 Runtime Adapters

- `ObservationNormalizer`
- `EngineAdapter`
- `MacroActionExecutor`
- `ReplayRunner`
- `PlayTestEvaluator`

Adapters translate the shared Engine into deterministic contracts. They do not modify Policy state or bypass the Pure Core rules.

### 4.3 Persistence

- `ReplayBuffer`
- `PolicyStore`
- `TrainingMemory`

Persistence provides storage only. It does not control training, validation, or activation.

### 4.4 Orchestration

- `PlayTestRunCoordinator`
- `TrainingCoordinator`
- `ValidationRunner` (orchestration over injected runtime adapters)
- `PolicyPromoter`
- Director / EvolutionRunner integration

`PolicyPromoter` is the only module allowed to change `current_active`.

## 5. Policy snapshot and learning timing

```json
{
  "policy_update": {
    "mode": "freeze_during_run",
    "policy_scope": "evolution_run",
    "learn_after_run": true,
    "allow_mid_run_update": false,
    "record_policy_version": true,
    "record_policy_hash": true
  }
}
```

At run start, the active Policy, hash, State/Action/Reward schema versions, Engine capability hash, and training version are snapshotted. Every Candidate uses that same snapshot. Training is allowed only after the run has safely closed or safely cancelled.

## 6. Learning algorithm

```json
{
  "learning": {
    "algorithm": "tabular_q_learning",
    "state_space": "discrete_bucketed",
    "action_space": "macro_actions",
    "randomness": "seeded",
    "online_update_during_evolution_run": false
  }
}
```

The update is standard off-policy Q-Learning:

```text
Q(s,a) <- Q(s,a) + alpha * (target - Q(s,a))
target = r                         when transition is terminal
target = r + gamma * max Q(s',a')  otherwise
```

All epsilon-greedy choices, tie breaks, initial choices, and training ordering use derived seeded PRNG streams.

## 7. State Space Protocol

```json
{
  "state_space": {
    "architecture": "core_plus_game_type_adapter",
    "encoding": "discrete_bucketed",
    "canonical_order": true,
    "unknown_value": "unknown",
    "allow_raw_continuous_values": false,
    "max_adapter_features": 6
  }
}
```

Pipeline:

```text
Engine Raw State -> CoreStateEncoder -> GameTypeStateAdapter -> Canonical Serializer -> state_id
```

Core fields are cross-game decision features. Adapters add only a bounded set of discrete, game-specific features and cannot replace Core state. Continuous values must be bucketed. `unknown` is a valid value and is never silently converted to zero, false, or far.

Adapters are pure functions over a normalized Engine snapshot. They cannot execute actions, access the Q-table, calculate rewards, modify Engine state, read DOM, or call an LLM. Detailed raw observations remain in `PlayTestTrace`, not in the Q-table.

Policy compatibility includes Core encoder and adapter versions.

## 8. Macro Action Protocol

```json
{
  "action_space": {
    "architecture": "core_plus_capability_adapter",
    "execution": "deterministic_bounded_sequence",
    "one_transition_per_macro": true,
    "allow_runtime_generated_actions": false,
    "allow_randomness_inside_macro": false,
    "max_adapter_actions": 6,
    "max_macro_frames": 120,
    "input_cleanup_required": true
  }
}
```

Capability and precondition checks happen before execution. `capability_unavailable` and `precondition_failed` are distinct outcomes. Invalid actions are recorded and never silently replaced. A Macro is a static deterministic input sequence of 1..120 frames and creates exactly one RL transition. Frame-level input and Engine details are retained for trace/replay only.

`releaseAllInputs()` is mandatory after success, exception, timeout, cancellation, bug, or episode termination.

## 9. Episode Protocol

```json
{
  "episode": {
    "budget_mode": "macro_transitions_with_tick_guard",
    "max_macro_transitions": 40,
    "max_simulation_ticks": 1200,
    "no_progress_transition_limit": 8,
    "wall_clock_timeout_ms": 120000,
    "stop_on_provisional_finding": false,
    "stop_on_fatal_finding": true
  }
}
```

Initialization (Engine load, checkpoint, compatibility checks, and input cleanup) is not a transition or reward. The episode starts only after the initial canonical state is encoded.

`no_progress` requires eight consecutive transitions with no new state ID, normalized event, Finding, or normalized progress signature. Any one of those changes resets the counter. Wall-clock time is a safety guard only and never enters State, Reward, or fingerprint semantics.

Termination reasons are: `death`, `victory`, `fatal_finding`, `macro_budget_exhausted`, `simulation_tick_budget`, `no_progress`, `timeout`, `cancelled`, and `engine_error`. Termination and Reward are separate; death does not imply a negative reward. Every exit releases inputs, stops the Macro executor, cleans episode resources, and leaves the Engine recoverable.

## 10. Anomaly and Finding Protocol

```json
{
  "anomaly_detection": {
    "architecture": "versioned_deterministic_rule_registry",
    "input": "normalized_engine_events_and_snapshots",
    "fingerprint": "normalized_finding_context",
    "replay": "seeded_confirmation",
    "allow_llm_detection": false,
    "allow_wall_clock_dependency": false,
    "allow_engine_internal_reads": false
  },
  "registry_version": "anomaly-rules-v4.0",
  "fingerprint_schema_version": "bugfp-v1"
}
```

The legacy `AnomalyDetector` is a migration source only. V4 rules are pure deterministic invariant or temporal rules over normalized Observation data. Rule identity is stable (`rule_id` plus semantic fingerprint version). Wall-clock timestamps and exact continuous values are audit metadata only.

A Finding is independent of Reward:

```json
{
  "finding_id": "finding-run17-004",
  "rule_id": "physics.boundary_escape",
  "rule_version": "1.0",
  "status": "provisional",
  "category": "physics",
  "severity": "high",
  "first_seen_transition": 41,
  "trigger": {"state_id": "...", "action_id": "EDGE_PRESSURE"},
  "bug_fingerprint": "bug:xxxxxxxx"
}
```

Fingerprint input is stable semantic context: rule identity, game type, component, normalized region, invariant signature, and normalized trigger sequence. It excludes run IDs, candidate IDs, timestamps, exact coordinates, rewards, and Policy metadata. The former 30-frame deduplication is not authoritative.

## 11. Replay Confirmation Protocol

Replay restores a checkpoint and executes the recorded Macro sequence. It never asks the Policy to select actions again.

```json
{
  "replay_confirmation": {
    "deterministic": {"attempts": 1, "required_successes": 1},
    "non_deterministic_or_unknown": {"attempts": 3, "required_successes": 2}
  }
}
```

The deterministic case is one additional successful Replay after discovery. Unknown determinism conservatively uses 2/3. Replay stops early when success or failure is mathematically decided. Only the same Bug fingerprint confirms the original Finding; a different fingerprint is a failed reproduction plus a new provisional Finding.

Replay results are `confirmed`, `rejected`, `cancelled`, or `incomplete`. Cancelled/incomplete results do not prove absence and leave the Finding provisional.

## 12. PlayTestReward and Event Ledger

```json
{
  "reward": {
    "objective": "bug_discovery",
    "architecture": "event_ledger",
    "profile": "bug-discovery-v1",
    "replay_confirmation_required": true,
    "allow_delayed_relabeling": true,
    "use_final_fitness": false,
    "per_episode_caps": true,
    "duplicate_reward_decay": true
  }
}
```

Reward priority is:

```text
Confirmed Novel Bug > Successful Reproduction > First Anomaly > Boundary State > New State/Sequence Coverage > Ordinary Movement
```

Exploration shaping rewards are capped independently and can never cumulatively outweigh one Confirmed Novel Bug. Penalties for idle, invalid action, known bug repetition, and no-progress are independent and bounded. `invalid_action` is not so heavily penalized that boundary testing becomes impossible.

Ledger states are `provisional`, `finalized`, and `revoked`. Delayed relabeling records `original_value` and `final_value`, and successful confirmation relabels both the discovery and successful Replay trajectories. The Ledger is the only Reward authority; LLM, UI, and V2 Fitness cannot modify it.

## 13. Training and Replay Buffer

```json
{
  "training": {
    "profile": "bug-hunter-q-v1",
    "alpha": 0.1,
    "gamma": 0.95,
    "epochs_per_run": 3,
    "max_updates_per_run": 5000,
    "sample_order": "seeded_stratified",
    "train_after_safe_run_close": true
  },
  "exploration": {
    "epsilon_initial": 0.20,
    "epsilon_decay_on_promotion": 0.95,
    "epsilon_min": 0.05,
    "allow_mid_run_change": false
  },
  "replay_buffer": {
    "max_transitions": 10000,
    "max_source_runs": 50,
    "retention": "stratified_fifo",
    "store_raw_engine_state": false,
    "store_finalized_reward_ledger_refs": true,
    "exclude_incomplete_transitions": true,
    "sample_repetition": {"confirmed": 4, "negative_evidence": 2, "exploration": 1}
  }
}
```

The three strata are `confirmed`, `negative_evidence`, and `exploration`. Repetition changes sampling exposure, never the Reward value. Each stratum has independent FIFO retention so ordinary exploration cannot evict confirmed evidence. The buffer stores canonical transitions and Ledger references, not raw Engine state. Incomplete transitions are trace-only.

At safe run close, the Ledger is finalized, Replay results are complete as far as budget allows, and an immutable Dataset Snapshot is created. Training uses independent seeded ordering per stratum. Training stops at three epochs or 5000 updates, whichever comes first. The snapshot cannot change during training.

## 14. Policy Store and Training Memory

```json
{
  "policy_store": {
    "max_active_versions": 10,
    "max_training_runs": 50,
    "retain_rejected_metadata": true,
    "retain_rejected_q_table": false,
    "rollback_mode": "explicit_active_version",
    "official_version_requires_hash": true
  }
}
```

`PolicyStore` holds one `current_active`, up to ten retained promoted versions, a temporary candidate, rejected metadata, and activation/rollback lineage. Formal Policies retain the complete Q-table and a canonical hash computed from Q-table, compatibility metadata, training profile/version, and Policy schema version. Audit metadata is excluded from the hash.

`TrainingMemory` holds immutable Dataset Snapshots, Training Runs, reproducibility results, validation scorecards, and Promotion Decisions. Its retention is independent from PolicyStore. Rejected Q-tables are discarded after metadata is persisted. Policy states are `candidate`, `active`, `superseded`, and `rejected`.

Rollback requires an explicit retained version, valid hash, and current compatibility. It restores that Policy's own epsilon and does not decay epsilon or retrain. The current active Policy is never guessed or overwritten.

## 15. Validation and Promotion

Validation uses a fixed holdout set that is never added to ReplayBuffer or Training snapshots.

```json
{
  "validation": {
    "profile": "bug-hunter-validation-v1",
    "scenarios": "fixed_holdout_v1",
    "seeds": "fixed",
    "hard_gates": {
      "schema_compatible": true,
      "reproducibility_hash_match": true,
      "finite_q_values": true,
      "fatal_runtime_regressions": 0
    },
    "non_regression": {
      "confirmed_bug_count": "candidate >= active",
      "reproduction_success_rate": "candidate >= active",
      "novel_finding_count": "candidate >= active",
      "invalid_action_rate": "candidate <= active + 0.05",
      "no_progress_rate": "candidate <= active + 0.05"
    },
    "comparison_order": [
      "confirmed_bug_count",
      "reproduction_success_rate",
      "novel_finding_count",
      "invalid_action_rate",
      "no_progress_rate"
    ],
    "tie_policy": "no_promotion_without_strict_validation_improvement"
  }
}
```

`ValidationRunner` executes Active and Candidate in the same Validation Run, with the same scenarios, seeds, Engine version, Rule Registry, schemas, budgets, and Reward Profile. `PolicyValidator` then applies hard gates, all non-regression constraints, and lexicographic comparison. A 0/0 reproduction rate is `null`; it is not converted to 0% or 100%.

The Candidate is validated with the prospective epsilon that would be committed after promotion. Only a strict scorecard improvement yields `promotion_eligible`; equal scorecards yield `no_improvement` even when the behavior hash differs. `PolicyPromoter` alone performs the all-or-nothing transaction and switches `current_active` at the final commit point.

## 16. V3 Integration

V4 uses an additive sequential `PlayTestEvaluator`:

```text
Candidate DSL
  -> V3 SimulationAgent
  -> EvaluationResult
  -> FitnessCalculator V2
  -> FitnessResult 2.0
  -> teardown/reset
  -> optional V4 PlayTestEvaluator
  -> Findings / Replay / PlayTestReward
```

V3 and V4 are separate Evaluation Sessions. V4 begins from a fresh standard initial checkpoint after teardown/reset/load and input cleanup. V4 is disabled by default:

```json
{
  "playtest": {
    "enabled": false,
    "scope": "all_unique_evaluated_candidates",
    "episodes_per_candidate": 1,
    "max_playtest_episodes_per_run": 18,
    "reuse_elite_results": true
  },
  "replay_budget": {
    "max_replay_attempts_per_run": 24,
    "replay_findings_in_transition_order": true,
    "replay_budget_is_separate": true
  }
}
```

When enabled, baseline and each unique Candidate that passes deterministic FinalQA receives one Discovery Episode. Duplicates and QA-rejected candidates receive none. Elites reuse their existing result. Discovery slots are consumed when started, including incomplete Episodes. Replay runs only after all Discovery Episodes, with deterministic ordering and an independent budget.

V4 data is stored in EvolutionMemory/ReplayBuffer/TrainingMemory, not SimulationMemory. V4 timeout, incomplete Replay, Reward failure, or budget exhaustion does not count toward V3 candidate failure budget and cannot change V3 ranking. V4 Finding never enters `EvaluationResult.bugs`; PlayTestReward never enters `final_fitness`.

## 17. Cancellation and Failure Safety

AbortSignal checks occur before a new Generation, Candidate, deterministic QA, Simulation, Discovery Episode, Replay attempt, and Training phase. Cancellation prevents new work, safely ends the current Macro/Episode, releases inputs, restores the baseline Engine where applicable, persists completed traces, and never promotes a game or Policy.

All failure paths preserve the previous valid state:

```text
Storage failure / hash mismatch / validation failure / training cancel / Engine load failure
  -> candidate or run is recorded as failed/cancelled
  -> previous current_active remains active
  -> previous current_version remains current
  -> V3 Fitness and GA ranking remain unchanged
```

## 18. Release Gate

V4 release requires all of the following:

1. Determinism: canonical State, Action, Finding, Replay, Reward, Q-table, and Policy hash reproducibility; no bare `Math.random()`.
2. State/Action safety: no raw continuous Q-state, runtime-generated Macro, Macro randomness, input leaks, or budget bypass; adapter features <= 6 and adapter actions <= 6.
3. Anomaly/Replay: versioned rules, stable fingerprints, original Macro replay, deterministic 1/1 and conservative 2/3 confirmation, different fingerprint rejection.
4. Reward Ledger: provisional/finalized/revoked transitions, delayed relabeling, caps, and no sample-repetition Reward multiplication.
5. Episode isolation: 40 transitions, 1200 ticks, 120000 ms, eight-transition no-progress, all terminal/cancel/error cleanup paths.
6. Training/Buffer: stratified retention, immutable snapshots, terminal no-bootstrap, incomplete exclusion, seeded 4/2/1 sampling, and 3-epoch/5000-update bounds.
7. Policy lifecycle: candidate/active/superseded/rejected, transactional promotion, explicit rollback, hash and compatibility checks, and active protection.
8. V3 compatibility: all V1, V2, and V3 tests pass; V4 disabled paths remain behavior-compatible; V4 data cannot modify V2 Fitness or GA ranking.
9. Persistence failure: any ReplayBuffer, TrainingMemory, PolicyStore, hash, validation, cancellation, or Engine failure preserves the previous game version and active Policy.

The final release gate is:

```text
ALL V1 tests pass
AND ALL V2 Fitness tests pass
AND ALL V3 tests pass
AND ALL V4 tests pass
```

## 19. Implementation order (design boundary only)

Implementation must preserve the frozen dependency direction. The intended order is:

```text
Shared SeededPRNG
-> State/Action schemas and encoders
-> EpisodeTracker and deterministic Event/Rule contracts
-> Fingerprint, Replay, Reward Ledger
-> QLearningTrainer and ReplayBuffer
-> PolicyStore/TrainingMemory
-> Runtime Engine adapters and PlayTestEvaluator
-> ValidationRunner/PolicyValidator/PolicyPromoter
-> Director/EvolutionRunner integration
-> UI/status surface
-> V1+V2+V3+V4 release tests
```

This document freezes the V4.0 design. Coding begins only after written-spec review and a separate implementation plan.
