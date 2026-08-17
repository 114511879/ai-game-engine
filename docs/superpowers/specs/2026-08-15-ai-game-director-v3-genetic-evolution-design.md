# AI Game Director V3 Genetic Evolution Design Specification

## Status

Approved and frozen design for AI Game Director V3. This document defines the implementation boundary for controlled genetic optimization built on the V1 multi-agent pipeline and V2 `FitnessResult 2.0`.

## Goal

V3 adds an opt-in, deterministic genetic evolution loop:

```text
controlled search
-> isolated evaluation
-> reproducible experiment
-> safe winner promotion
-> rollback-capable official commit
```

The optimizer searches only an explicitly declared gene space. Every candidate must pass deterministic admission before Simulation, is ranked by V2 `final_fitness`, and remains experimental until an independent promoter commits the winner as an official version.

## Non-Goals

V3 does not:

- train a Reinforcement Learning policy;
- modify arbitrary DSL fields;
- use an LLM to judge candidate admission;
- replace the existing Director correctness-repair loop;
- run Evolution during ordinary generation or ordinary Director mode;
- parallelize candidate evaluation on the shared Engine/canvas;
- store every candidate as an official game version;
- optimize `play_time`, `fun_proxy`, or any single V2 dimension directly.

## Core Invariants

1. `GeneticOptimizer` has only algorithmic authority; it cannot access Engine, FinalQA, Simulation, storage, UI, or globals.
2. Only paths declared in `optimization.variables` may be changed.
3. Immutable paths override variable declarations.
4. The root run seed controls every GA random decision.
5. Candidate admission is deterministic and never calls an LLM.
6. Candidates are evaluated sequentially in an identical environment.
7. GA selection maximizes V2 `final_fitness` only.
8. Candidate state and official version state are separate lifecycles.
9. `EvolutionPromoter` is the only path from experimental winner to official version.
10. Baseline DSL and baseline official version are the recovery anchor for failure and cancellation.

## Architecture

```text
User / API
    |
    v
Director -- ordinary generation/director paths remain unchanged
    |
    | evolution.enabled = true
    v
Full FinalQA + Baseline FitnessResult 2.0
    |
    v
EvolutionRunner
    |-------------------------------|
    v                               v
GeneticOptimizer              CandidateEvaluator
    |                               |
    | candidates                    | deterministic FinalQA
    |<------------------------------| Engine reset/load
    | evaluated populations         | Simulation(seed)
    |                               | FitnessCalculator V2
    v                               | teardown
EvolutionMemory <-------------------|
    |
    v
Best experimental candidate
    |
    v
Engine restored to baseline
    |
    v
Director -> EvolutionPromoter
               |
               | deterministic FinalQA
               | Engine.load(best)
               | transactional PromotionStore
               v
      official DSL + SimulationMemory + current_version
```

Dependencies are one-way. In particular, `GeneticOptimizer` must never depend on `EvolutionRunner`, and no core gene operator may depend on Engine or storage.

## Module Boundaries

The browser-executable implementation follows the repository's Vanilla JavaScript/IIFE architecture:

```text
evolution/
├─ EvolutionProtocols.js
├─ EvolutionProfiles.js
├─ SeededPRNG.js
├─ GeneSchemaValidator.js
├─ GeneEncoder.js
├─ MutationEngine.js
├─ CrossoverEngine.js
├─ SelectionEngine.js
├─ DuplicateDetector.js
├─ OptimizationSchemaBuilder.js
├─ GeneticOptimizer.js
├─ CandidateEvaluator.js
├─ EvolutionMemory.js
├─ EvolutionRunner.js
└─ EvolutionPromoter.js
```

Logical groups:

- Contracts: `EvolutionProtocols`, `EvolutionProfiles`.
- Pure core: `SeededPRNG`, `GeneEncoder`, `MutationEngine`, `CrossoverEngine`, `SelectionEngine`, `DuplicateDetector`, `GeneticOptimizer`.
- Validation: `GeneSchemaValidator`, `OptimizationSchemaBuilder`.
- Runtime: `CandidateEvaluator`, `EvolutionRunner`, `EvolutionPromoter`.
- Storage: `EvolutionMemory`; production promotion uses an injected `PromotionStore` adapter.

No TypeScript toolchain is introduced in V3. JSDoc contracts and versioned runtime normalizers provide type boundaries.

## Product Entry

Evolution is disabled by default:

```json
{
  "evolution": {
    "enabled": false,
    "profile": "default_ga_v3"
  }
}
```

Entry behavior:

- Ordinary Generate: zero GA calls.
- Ordinary Director: zero GA calls.
- `🧬 进化`: generate and admit a baseline, calculate baseline Fitness, then invoke Evolution.
- Programmatic API: `director.runEvolution(baselineDSL, options)`.

The UI only displays progress and sends cancellation. It never selects parents, changes Fitness, or modifies candidates.

## Optimization DSL Protocol

```json
{
  "evolution": {
    "enabled": true,
    "profile": "default_ga_v3"
  },
  "optimization": {
    "target": "maximize_final_fitness",
    "profile": "default_ga_v3",
    "max_mutated_variables": 5,
    "immutable": [
      "meta.game_id",
      "meta.engine_version",
      "assets"
    ],
    "variables": [
      {
        "name": "player_hp",
        "path": "player.hp",
        "type": "integer",
        "range": [3, 16],
        "step": 1,
        "mutation_rate": 0.1,
        "importance": "high"
      }
    ]
  }
}
```

`GeneticOptimizer` may read and write only declared variable paths. It never scans the DSL for numeric fields.

New DSLs declare variables explicitly. Legacy DSLs pass through `OptimizationSchemaBuilder`, which selects a deterministic template using `game_type` and Engine capability. The builder emits an explicit schema before the optimizer runs; it does not grant the optimizer discovery authority.

## Gene Schema

V3 supports exactly four types:

```text
integer
number
enum
boolean
```

Objects, arrays, free-form strings, story text, dialogue, mechanic types, win conditions, roles, and other semantic structures are outside the V3 gene space.

Common fields:

- `name`: unique stable identifier.
- `path`: unique existing DSL path.
- `type`: one of the four supported types.
- `mutation_rate`: finite number in `[0, 1]`.
- `importance`: trace/UI metadata only; it never changes probability, selection, crossover, or Fitness.

Numeric fields:

- `range`: two finite values with `min <= max`.
- `step`: finite positive number.
- Grid anchor: `range[0]`.

Enum fields:

- `values`: at least two unique values.
- Baseline value must already be a member.

Boolean fields:

- Baseline value must be strictly `true` or `false`.
- `0`, `1`, and string coercions are invalid.

## Gene Schema Validation

Validation occurs before population creation.

Rules:

- Duplicate names reject the affected variables.
- Duplicate paths reject the affected variables.
- The path must exist in the baseline DSL; operators may not create structures.
- Variable and immutable paths use bidirectional ancestor/descendant conflict detection.
- Numeric baseline values must be finite and inside the declared range.
- Out-of-range baseline values produce `GENE_BASELINE_OUT_OF_RANGE`; they are not clamped.
- Minor floating representation error may normalize to the nearest legal step grid.
- Semantic repair is forbidden.
- Invalid variables are excluded with explicit findings; valid variables continue.
- If no valid variables remain, Evolution returns `status: rejected`, `stopped_reason: no_valid_genes`, creates no population, runs no candidate evaluation, and consumes no GA budget.
- When an existing authoritative baseline Fitness is supplied, `no_valid_genes` preserves it without reevaluating baseline.

## Scope Binding And Semantic QA Inheritance

Baseline semantic admission is inherited only because the allowed gene space is semantic-preserving.

The baseline stores:

```json
{
  "semantic_qa": {
    "status": "passed",
    "scope": "baseline",
    "optimization_scope_hash": "ga3:8f22c091"
  }
}
```

The scope hash is derived from canonicalized variables, immutable paths, gene schema version, and relevant Engine capability version. Evolution recomputes it before starting. A changed scope returns `optimization_scope_changed`; it cannot inherit an earlier semantic decision.

The hash is a deterministic compatibility fingerprint, not a security primitive.

## Baseline Preconditions

`EvolutionRunner` accepts only:

- a valid baseline Game DSL;
- a completed full `FinalQA.admit()` result;
- an authoritative `FitnessResult 2.0` for that exact baseline version;
- semantic QA scope metadata matching the current optimization scope.

Missing or mismatched evidence returns a rejected result:

```text
baseline_fitness_required
baseline_qa_required
optimization_scope_changed
```

`EvolutionRunner` never reevaluates baseline. This prevents baseline and candidate Fitness from using different evaluation conditions.

## Default Evolution Profile

```json
{
  "profile": "default_ga_v3",
  "population_size": 6,
  "elite_count": 2,
  "max_generations": 3,
  "episodes_per_candidate": 1,
  "max_candidates": 18,
  "candidate_timeout_ms": 300000,
  "max_failed_candidates": 3,
  "max_mutated_variables": 5,
  "selection": {
    "method": "tournament",
    "tournament_size": 3
  },
  "crossover": {
    "method": "uniform",
    "rate": 0.7
  },
  "duplicate_policy": "reject",
  "max_duplicate_retries": 5,
  "fingerprint": "normalized_gene_vector",
  "early_stop": {
    "patience": 2,
    "min_improvement": 0.01
  },
  "evaluation": {
    "mode": "sequential",
    "persona": "new_player",
    "restore_engine_after_run": true
  }
}
```

`max_candidates` is an explicit hard quota, not dynamically inferred at runtime.

`max_generations` counts population generations including Generation 0. With the default value `3`, the legal generation indexes are `g0`, `g1`, and `g2`; `g3` is never created. This resolves the budget boundary unambiguously.

The population always contains six entries, but reused baseline/elite Fitness does not consume evaluator quota. Under the default profile, the maximum new evaluator calls are five mutations in `g0`, four offspring in `g1`, and four offspring in `g2` (13 calls). `max_candidates = 18` remains a hard ceiling for alternate valid population composition, retries that reach evaluation, and future compatible profiles; it is not a requirement to spend all 18 evaluations.

## Seeded Reproducibility

Every run requires a root seed:

```json
{
  "random_seed": "ga-game1-run1"
}
```

Rules:

- Bare `Math.random()` is forbidden throughout V3 Evolution modules.
- Population initialization, mutation-rate checks, forced mutation, mutation-budget sampling, parent selection, crossover, and duplicate retries use `SeededPRNG`.
- Candidate seed: `{run_seed}:g{generation}:c{candidate}`.
- Duplicate retry seed: `{candidate_seed}:retry{n}`.
- Run and candidate seeds are recorded in traces.
- Same baseline, schema, config, root seed, and deterministic evaluator produce the same candidate and lineage sequence.
- Candidate seed is passed into Simulation.
- Evaluation records `simulation_deterministic: true|false`.
- Simulation nondeterminism lowers evidence confidence only where the evaluator defines it; it never changes the V2 `final_fitness` formula.

### Deterministic Primitives

Cross-runtime reproduction uses fixed algorithms:

- Seed text is encoded as UTF-8 and reduced to an unsigned 32-bit state using FNV-1a 32-bit.
- `SeededPRNG.next()` uses Mulberry32 and returns a value in `[0, 1)`.
- Derived seeds are complete strings and are hashed independently; child PRNG instances never consume the parent instance's state.
- Canonical JSON sorts object keys recursively. Gene schema variables and gene vectors are sorted by normalized path; immutable paths are normalized, deduplicated, and sorted.
- `optimization_scope_hash` is `ga3:` plus the eight lowercase hexadecimal digits of FNV-1a over canonical UTF-8 JSON containing schema version, normalized variables, immutable paths, builder version, and Engine capability version.
- Candidate fingerprint is `genes:` plus the same eight-digit FNV-1a representation over the canonical normalized gene vector.

FNV-1a is used as a deterministic compatibility fingerprint, not as a security or tamper-resistance mechanism.

## Pure GeneticOptimizer API

`GeneticOptimizer` is a state-free deterministic algorithm service:

```js
optimizer.createInitialPopulation({
  baselineGeneVector,
  geneSchema,
  profile,
  runSeed
});

optimizer.nextGeneration({
  generation,
  evaluatedPopulation,
  geneSchema,
  profile,
  runSeed
});
```

It produces candidates but never executes them. `EvolutionRunner` evaluates candidates through `CandidateEvaluator`, then passes evaluated populations back to the optimizer.

Algorithm tests therefore require no browser, canvas, Engine, Simulation, FinalQA, or storage.

## Generation Zero

```text
g0-c0 = unchanged baseline control
g0-c1..g0-c5 = seeded single-parent mutations of baseline
```

The baseline control is evaluated using its existing authoritative Fitness and is not resimulated. Candidate IDs and evaluation order are stable.

## Bounded Mutation

For every gene:

```text
triggered = PRNG.next() < mutation_rate
```

If more than `max_mutated_variables` trigger, a seeded sample selects the applied set. Path order cannot bias selection. Trace fields include `triggered_genes` and `applied_mutations`.

If zero genes trigger for a non-elite candidate, seeded selection forces exactly one mutable gene to change.

Mutation semantics:

- `integer`: choose `+step` or `-step`, grid-normalize from `range[0]`, clamp, then preserve an integer legal grid value.
- `number`: choose `+step` or `-step`, grid-normalize from `range[0]`, clamp, and round to the decimal precision implied by `step`.
- `enum`: remove the current value, then choose a different value using seeded PRNG.
- `boolean`: strict inversion.

Numeric normalization:

```text
normalized = min + round((value - min) / step) * step
```

Floating-point output is serialized at step precision. Mutation performs a final immutable recheck before fingerprinting.

## Selection, Crossover, And Elitism

After deterministic sorting:

- Preserve the top two elites unchanged.
- Elites keep lineage and existing Fitness; they are not rerun through QA, Simulation, or Fitness.
- Generate four offspring.
- Parent selection uses seeded tournaments of size three.
- Crossover occurs with probability `0.7`.
- Uniform crossover independently chooses every gene from parent A or B.
- Without crossover, copy the better parent, then mutate.

Candidate ordering:

1. Higher `final_fitness`.
2. Higher `confidence.overall`.
3. Fewer changed genes relative to baseline.
4. Lexicographically lower `candidate_id`.

Only `final_fitness` is the optimization objective. Confidence and change count are deterministic tie-breakers, not hidden Fitness terms.

## Duplicate Detection

```json
{
  "duplicate_policy": "reject",
  "max_duplicate_retries": 5,
  "fingerprint": "normalized_gene_vector"
}
```

Fingerprint input is the declared gene vector sorted by path. Version IDs, timestamps, run IDs, traces, logs, Fitness, Evaluation, and optimization metadata are excluded.

Rules:

- A duplicate non-elite does not enter FinalQA, Simulation, or Fitness.
- Duplicate attempts do not consume the evaluated-candidate quota.
- `generation_attempts` and `duplicates_rejected` still increment.
- Retries use `:retry1` through `:retry5` seeds.
- Five failed retries produce `duplicate_exhausted` and count toward the failure budget.
- Elite copying is an allowed duplicate and is never retried.

## Two-Level Candidate Admission

```text
Baseline
-> full FinalQA.admit(), optionally including semantic LLM QA

Candidate
-> deterministic FinalQA.validate() only
```

Candidate checks include DSL types, Engine constraints, Intent and Blueprint hard constraints, Optimization Schema, immutable rules, ranges, step grids, references, and required fields.

Candidate admission never calls an LLM. A rejected candidate never reaches Simulation.

Before output, ranked winner candidates undergo the same deterministic FinalQA again. If rank 1 fails, try rank 2, then subsequent ranked candidates. If all fail, return baseline as the safe result and do not promote.

Trace QA envelope:

```json
{
  "qa": {
    "status": "passed",
    "findings": [],
    "rejection_codes": [],
    "elapsed_ms": 4,
    "mode": "deterministic_candidate"
  }
}
```

## CandidateEvaluator Contract

```js
evaluator.evaluate(candidateDSL, {
  candidate_seed,
  intent,
  blueprint,
  optimization_scope_hash,
  persona,
  episodes,
  timeout_ms,
  fitness_profile,
  simulation_config,
  engine_config,
  qa_version,
  evaluator_version,
  signal
});
```

The returned `CandidateEvaluationResult` contains deterministic QA evidence, `EvaluationResult`, runtime metrics, `FitnessResult 2.0`, simulation determinism, elapsed time, and status.

Production `CandidateEvaluator` uses an injected `EngineAdapter` with `reset()`, `load(dsl)`, and `teardown()` operations. It does not reach directly into UI state. The candidate timeout covers admission, Engine loading, Simulation, and Fitness; cleanup in `finally` is allowed to finish after the timeout so the next candidate never inherits partial state.

All candidates use identical persona, episode count, Fitness profile, Simulation configuration, Engine configuration, QA version, and evaluator version.

## Sequential Engine Isolation

V3 production evaluation is strictly sequential because Engine, canvas, and global resources are shared.

Evaluation order:

```text
generation ASC
-> candidate_id ASC
```

Lifecycle:

```text
Engine.reset()
-> Engine.load(candidateDSL)
-> Simulation(candidate_seed)
-> FitnessCalculator V2
-> record result
-> Engine.teardown()
```

`reset()` clears prior game state, entities, counters, events, timers, input state, and random state. `teardown()` removes listeners, animation loops, and candidate resources.

Timeouts and exceptions always execute cleanup in `finally`:

```text
teardown
-> reset
```

No candidate becomes `current_version`. Evolution completion, rejection, failure, and cancellation all restore baseline Engine state before returning from `EvolutionRunner`.

Future parallelization requires isolated Worker/Engine instances; shared-Engine concurrency remains forbidden.

## Abort And Cancellation

```js
director.runEvolution(baselineDSL, {
  signal: abortController.signal
});
```

Cancellation checkpoints:

- before a new generation;
- before candidate creation;
- before candidate FinalQA;
- before Simulation;
- after candidate completion.

After abort:

- generate no new candidates;
- start no new QA or Simulation;
- if Simulation supports `AbortSignal`, stop it;
- otherwise finish the current candidate to the safe teardown point;
- teardown/reset and restore baseline;
- persist completed experiment data to EvolutionMemory;
- never invoke Promotion;
- leave SimulationMemory and `current_version` unchanged.

Cancellation result:

```json
{
  "status": "completed",
  "stopped_reason": "cancelled",
  "promotion": {"status": "not_requested"},
  "cancelled_at": {
    "generation": 2,
    "candidate_id": "g2-c3"
  }
}
```

`best_candidate_so_far` may be shown but cannot be promoted implicitly.

## Failure And Cost Budgets

- Single candidate timeout: `300000 ms`.
- Maximum failed candidates: `3`.
- Maximum evaluated candidates: `18`.
- FinalQA rejection, Simulation exception, invalid Fitness, timeout, and duplicate exhaustion count as failures.
- Candidates that fail do not enter selection or crossover pools.
- When failures exceed the budget, stop the run with `failure_budget_exceeded`.
- The runner never starts work that would exceed the candidate quota.

Early stop compares the generation-best Fitness with the prior improvement reference. Two consecutive generations with improvement below `0.01` stop with `early_stop`.

## Generation Statistics

Every generation records:

```json
{
  "generated_attempts": 12,
  "duplicates_rejected": 4,
  "evaluated_candidates": 6,
  "reused_candidates": 2,
  "failed_candidates": 1
}
```

Increasing duplicate rates indicate insufficient mutation diversity. Increasing failure rates indicate unsafe or incorrectly constrained search space.

## Optimization Trace

Every evaluated or rejected candidate records:

```json
{
  "run_seed": "ga-game1-run1",
  "candidate_seed": "ga-game1-run1:g2:c4",
  "generation": 2,
  "candidate_id": "g2-c4",
  "parents": ["g1-c1", "g1-c4"],
  "lineage": "crossover_mutation",
  "gene_vector": {},
  "fingerprint": "genes:...",
  "triggered_genes": 8,
  "applied_mutations": 5,
  "changes": [
    {
      "name": "player_hp",
      "path": "player.hp",
      "old": 10,
      "new": 12,
      "importance": "high"
    }
  ],
  "qa": {},
  "evaluation": {},
  "fitness": {},
  "fitness_delta": 0.08,
  "status": "evaluated"
}
```

Trace data explains generation but does not alter the algorithm.

## Dual History Model

```text
experimental candidates -> EvolutionMemory
promoted winner          -> SimulationMemory
```

### EvolutionMemory

- Storage key: `age_evolution_memory_v3`.
- Stores run configuration, root seed, scope hash, schema/reconstruction version, baseline reference, candidate gene vectors, lineage, changes, QA, Evaluation, Fitness, generation stats, cancellation point, and stopped reason.
- Does not persist full candidate DSLs.
- Candidate reconstruction uses baseline DSL plus normalized gene vector and the matching scope/reconstruction version.
- Retains at most 50 runs.
- Evicts by `created_at ASC`, never by Fitness.
- Keeps failed and cancelled experiments because they are diagnostic evidence.
- Stores at most 18 evaluator calls per run plus reused-candidate records and bounded duplicate/failure summaries.

### SimulationMemory

- Receives only a successfully promoted winner.
- Winner record reuses the already selected EvaluationResult and FitnessResult; it is never resimulated during Promotion.
- Official `parent_version` points to the baseline official version, not an internal candidate.
- Failure and fallback do not create cloned official versions.

## EvolutionResult 3.0

Runtime result:

```json
{
  "schema_version": "3.0",
  "run_id": "ga-game1-run1",
  "status": "completed",
  "stopped_reason": "max_generations",
  "game_id": "game1",
  "run_seed": "ga-game1-run1",
  "optimization_scope_hash": "ga3:8f22c091",
  "baseline": {
    "version_id": "v1",
    "fitness": 0.70
  },
  "best_candidate": {
    "candidate_id": "g2-c2",
    "fitness": 0.82,
    "fitness_delta": 0.12,
    "evaluation": {},
    "fitness_result": {},
    "dsl": {}
  },
  "generations": [],
  "optimization_trace": [],
  "generation_stats": [],
  "promotion": {
    "status": "promoted",
    "promoted_version_id": "v4"
  }
}
```

`best_candidate` has no official version ID. `promoted_version_id` exists only after successful Promotion.

Top-level status values:

```text
completed
failed
rejected
```

Stopped reasons:

```text
max_generations
early_stop
cancelled
no_valid_genes
baseline_fitness_required
baseline_qa_required
optimization_scope_changed
failure_budget_exceeded
candidate_budget_exhausted
timeout
internal_error
```

Promotion status values:

```text
not_requested
pending
promoted
rejected
failed
```

`rejected` means final deterministic QA rejected every ranked candidate. `failed` means the commit process failed after a candidate was eligible.

## EvolutionRunner

`EvolutionRunner`:

- validates baseline evidence and optimization scope;
- creates/validates the gene pool;
- coordinates the pure optimizer and CandidateEvaluator;
- enforces cancellation, timeout, failure, duplicate, and candidate budgets;
- selects and finally revalidates ranked winners;
- persists EvolutionMemory;
- restores baseline Engine state before return;
- returns an unpromoted EvolutionResult.

It never creates official version IDs, changes `current_version`, or writes SimulationMemory.

## EvolutionPromoter

`EvolutionPromoter` is the only official commit boundary.

Dependencies:

- deterministic FinalQA;
- Engine adapter;
- transactional `PromotionStore` adapter;
- SimulationMemory through the store boundary.

Promotion steps:

1. Deterministic FinalQA of the selected winner.
2. Prepare official metadata but do not expose a version ID yet.
3. `PromotionStore.begin()` and capture a snapshot of current version, official DSL, version indexes, and SimulationMemory.
4. `Engine.load(bestDSL)`.
5. Call `PromotionStore.commit(data)`. The adapter stages official DSL/version data, appends the winner's existing EvaluationResult and FitnessResult to SimulationMemory, and updates `current_version` as its final write.
6. A successful `current_version` write and successful return from `commit()` are the commit point.
7. Return `promotion.status = promoted` and `promoted_version_id`.

Any failure executes compensating rollback:

```text
PromotionStore.rollback()
-> Engine.teardown/reset
-> Engine.load(baseline)
-> current_version remains baseline
-> no official winner record remains
```

Conceptual store interface:

```js
promotionStore.begin();
promotionStore.snapshot();
promotionStore.commit(data);
promotionStore.rollback();
```

The adapter owns storage keys and representation. The promoter does not know ChatUI, localStorage keys, IndexedDB details, or future backend persistence.

## Director Integration

Director responsibilities:

- read `evolution.enabled`;
- run the existing baseline design/generation/correctness pipeline;
- ensure full QA and baseline Fitness exist;
- call `EvolutionRunner` only when explicitly requested;
- invoke `EvolutionPromoter` only for a valid winner and only when not cancelled;
- return baseline on rejected/failed Evolution or Promotion;
- combine baseline, Evolution, and Promotion metadata in DirectorResult.

DirectorResult adds:

```json
{
  "baseline_version": "v1",
  "evolution": {
    "enabled": true,
    "status": "completed",
    "stopped_reason": "max_generations",
    "baseline_fitness": 0.70,
    "best_fitness": 0.82,
    "fitness_delta": 0.12,
    "generations": 3
  },
  "promotion": {
    "status": "promoted",
    "promoted_version_id": "v4"
  }
}
```

## UI Contract

The toolbar adds a dedicated `🧬 进化` command consistent with existing Generate/Director/Test controls.

During a run, show operational status:

```text
Generation 2 / 3
Candidate 4 / 6
Baseline Fitness 0.70
Current Fitness 0.76
Best Fitness 0.81
Improvement +0.11
```

The interface offers `停止进化`, backed by `AbortController`. It does not expose or alter algorithm decisions.

Completion summarizes baseline Fitness, best Fitness, delta, generation count, stopped reason, and Promotion status. Cancellation shows `best_candidate_so_far` as experiment evidence only and never implies it became official.

## Error Handling

- Malformed configuration returns normalized findings; it never triggers arbitrary fallback mutation.
- Missing baseline requirements reject before population creation.
- A failed candidate is isolated and cannot poison later candidates.
- All evaluator exits clean Engine state in `finally`.
- EvolutionMemory write failure marks the run failed and restores baseline; candidate data must not be presented as durably saved.
- Promotion failure does not change Evolution run status; it changes only `promotion.status`.
- Rollback failure is reported explicitly as a critical promotion error while preserving every available baseline recovery attempt.
- No catch block may silently promote, update current version, or fabricate a version ID.

## Testing Strategy

### A. Determinism And Reproducibility

- Same baseline, schema, config, and seed produce the same gene and lineage sequence.
- Every random operation uses `SeededPRNG`.
- V3 source contains no bare `Math.random()`.
- Candidate and retry seeds replay independently.
- Selection, crossover, mutation, and tie-breaking are deterministic.

### B. Gene Safety

- Step-grid anchor is `range[0]`.
- Integer and number precision normalization cover non-unit and decimal steps.
- Enum mutation always changes the value.
- Boolean mutation strictly flips.
- Immutable ancestor and descendant conflicts are rejected.
- Out-of-range baseline values are rejected, not repaired.
- Every non-elite changes at least one gene.
- No candidate changes more than five genes.

### C. Evolution Correctness

- Generation zero baseline is unchanged.
- Top two elites remain byte-equivalent gene vectors and reuse Fitness.
- Tournament size is three.
- Uniform crossover rate is `0.7` under seeded tests.
- Tie-break order is stable.
- Fingerprints use normalized gene vectors only.
- Duplicate retries stop after five.
- Duplicates do not consume the evaluation quota.
- Early stop and all hard budgets stop at exact boundaries.

### D. Runtime Isolation

- FinalQA-rejected candidates never call Simulation.
- Evaluation order is sequential and stable.
- Every candidate executes reset/load/simulate/fitness/teardown.
- Timeout, exception, and abort execute cleanup.
- Candidate seed reaches Simulation.
- Evolution always restores baseline before return.
- Winner is not resimulated.

### E. Persistence And Promotion

- Candidates enter EvolutionMemory only.
- Candidate has no official version before Promotion.
- Final deterministic QA runs before Promotion.
- Engine load failure rolls back storage and Engine.
- Persistence failure rolls back official DSL, indexes, SimulationMemory, and Engine.
- Rollback leaves `current_version` at baseline.
- Only promoted winner enters SimulationMemory.
- Winner reuses its existing Evaluation and Fitness.
- EvolutionMemory evicts oldest runs and retains failures.

### Product Release Blockers

- Ordinary Generate invokes GA zero times.
- Ordinary Director invokes GA zero times.
- Only `🧬 进化` or explicit `evolution.enabled = true` starts EvolutionRunner.
- Cancel stops new work, cleans the current candidate, restores baseline, persists completed trace, and never promotes.

### Regression Gate

Before V3 publication:

```text
all V1 tests pass
+ all V2 Fitness tests pass
+ all V3 tests pass
```

V3 is additive. Consultant, Intent DSL, multi-agent design, RAG, Game DSL, FinalQA, Engine, Simulation, and V2 Fitness behavior must remain unchanged for non-Evolution paths.

## Acceptance Criteria

V3 is complete when:

1. The explicit whitelist is the sole mutation authority.
2. Legacy DSL receives a deterministic safe schema before optimization.
3. Same seed and deterministic evaluator reproduce the candidate sequence.
4. Small-population Tournament, Uniform Crossover, Bounded Mutation, Elitism, and duplicate rejection match this specification.
5. Candidate QA is deterministic and precedes Simulation.
6. Candidate evaluation is sequential, isolated, abortable, and restores baseline.
7. Fitness V2 `final_fitness` is the only optimization objective.
8. EvolutionMemory and SimulationMemory remain separate.
9. Runner, Promoter, and Director respect experimental/official lifecycle boundaries.
10. Promotion is all-or-nothing and rollback-capable.
11. Evolution remains off for ordinary Generate and Director flows.
12. The dedicated Evolution UI reports progress and supports safe cancellation.
13. Every frozen test group and V1/V2 regression gate passes.
