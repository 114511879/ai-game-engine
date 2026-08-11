# FitnessCalculator V2 Design

## Status

Approved protocol for AI Game Director 2.0 V2. This document freezes the deterministic fitness contract before implementation.

## Goal

V2 adds one authoritative, explainable fitness calculation layer. It converts simulation behavior, QA findings, runtime health, prior-version trends, and optional design metadata into a normalized score that can be used for version comparison now and as a Genetic Algorithm selection signal or Reinforcement Learning reward later.

`fun_proxy` is explicitly a proxy inferred from observable behavior. It must never be presented as a real player's subjective fun rating.

## Scope

V2 includes:

- A versioned, deterministic `FitnessCalculator`.
- Configurable scoring profiles, beginning with `default_v2`.
- A normalized `FitnessResult` protocol.
- Separate score dimensions and QA/runtime penalties.
- Per-dimension and overall confidence.
- Optional Game Blueprint Metadata for novelty evidence.
- Simulation-memory integration for historical comparison.
- Director integration that exposes the V2 result without breaking existing consumers.

V2 does not include:

- Genetic mutation, crossover, or population management.
- Reinforcement Learning training or policy updates.
- Genre-specific fitness profiles beyond accepting externally supplied profiles.
- LLM-based judging of quality or novelty.
- A claim that automated play measures real human enjoyment.

## Considered Approaches

### Replace all existing scores immediately

This would remove duplicate scoring quickly, but the existing Director optimization loop uses a legacy unbounded playtest score to choose its best intermediate DSL. Replacing it in the same change would mix a fitness feature with a substantial loop rewrite and could regress working behavior.

### Add a standalone calculator without product integration

This is isolated and easy to test, but Director results, SimulationMemory, and the UI would continue using old scores. It would not create the agreed V2 evaluation boundary.

### Add an authoritative V2 calculator through compatibility adapters

This is the selected approach. The new calculator is deterministic and independent. Director mode calculates and returns a V2 `FitnessResult` after final QA and bounded simulation, stores it with the simulation version, and surfaces it as the canonical final score. The legacy per-round score remains temporarily available for the existing optimization loop and backward compatibility.

## Architecture

```text
EvaluationResult
QAResult
RuntimeMetrics
SimulationMemory Trend
GameBlueprint Metadata (optional)
        |
        v
Fitness input normalization
        |
        v
Dimension scorers
  fun_proxy / playability / balance / novelty / stability
        |
        v
Profile-weighted base_fitness
        |
        v
QA penalty + runtime penalty
        |
        v
FitnessResult 2.0
        |
        +--> Director version result
        +--> SimulationMemory
        +--> future GA selection
        +--> future RL reward
```

The implementation follows five focused source units under `fitness/`:

- `types.js` owns dimensions, bounded-number helpers, JSDoc contracts, and the versioned output envelope.
- `WeightProfile.js` owns named weight configurations and profile validation.
- `MetricsNormalizer.js` converts optional V1/V2 evidence into finite normalized inputs.
- `PenaltyCalculator.js` flattens QA/runtime failures and calculates capped penalties.
- `FitnessCalculator.js` computes dimensions, confidence, explanations, weighted fitness, and trend output.

The approved conceptual filenames used `.ts`. This repository has no TypeScript compiler, module bundler, `tsconfig.json`, or build step; both browser entry points load source files directly. V2 therefore uses browser-executable `.js` IIFEs with JSDoc contracts while preserving the approved file boundaries and API. Introducing a TypeScript toolchain is outside V2 scope.

## Public API

```js
var calculator = new A.FitnessCalculator({
  profile: 'default_v2',
  game_id: 'game1',
  version_id: 'v3'
});

var result = calculator.calculateFitness(
  evaluationResult,
  qaResult,
  runtimeMetrics,
  simulationTrend,
  blueprintMetadata // optional
);
```

The browser namespace also exposes the same five-argument convenience function as `A.calculateFitness(...)`. Director integration uses the class so it can supply stable identifiers and a profile without changing the data-input signature.

All inputs except the identifiers may be incomplete. Missing evidence produces neutral values with reduced confidence; it must not cause exceptions or invented high scores. Unknown profile names fall back to `default_v2` and add an explanation.

## Default Profile

Weights live in configuration rather than in the core calculation algorithm.

```json
{
  "profile": "default_v2",
  "weights": {
    "fun_proxy": 0.30,
    "playability": 0.20,
    "balance": 0.20,
    "novelty": 0.10,
    "stability": 0.20
  }
}
```

A valid profile contains every dimension, uses finite non-negative values, and sums to `1` within floating-point tolerance. The calculator consumes the resolved profile; it does not contain genre branches. A future `soulslike` or `roguelike` profile can therefore change weights without changing the algorithm.

## Input Contracts

### EvaluationResult

The existing V1 fields remain valid:

```json
{
  "status": "completed",
  "episodes": 3,
  "metrics": {
    "play_time": 900,
    "death_rate": 0.30,
    "completion_rate": 0.65,
    "coverage": 0.80,
    "engagement_proxy": 7.8
  },
  "bugs": [],
  "reward": 65
}
```

V2 may consume these optional behavioral signals when available:

```json
{
  "retry_rate": 0.60,
  "exploration_rate": 0.75,
  "skill_usage_diversity": 0.70,
  "route_variation": 0.50,
  "early_failure_rate": 0.10,
  "progression_quality": 0.80
}
```

Absence of optional signals is expected in V2 and lowers only the relevant confidence.

### QAResult

The adapter accepts FinalQA, Pre-QA, and normalized QA shapes. It flattens `findings`, structural errors, and explicit counts into the following severity classes:

- `blocking` or `critical`
- `error` or `high`
- `warning` or `medium`
- `info` or `low`

QA findings never modify `fun_proxy`. They are represented only by `qa_penalty` and penalty counts.

### RuntimeMetrics

```json
{
  "started": true,
  "crashed": false,
  "boot_failures": 0,
  "uncaught_errors": 0,
  "invalid_state_count": 0,
  "soft_failures": 0,
  "frame_drop_rate": 0.04,
  "avg_fps": 58,
  "target_fps": 60
}
```

Continuous runtime quality contributes to `stability`. Discrete severe failures produce a separate `runtime_penalty`. This distinction preserves the agreed score-versus-penalty model.

### SimulationMemory Trend

```json
{
  "points": 3,
  "previous_fitness": 0.68,
  "metrics": {
    "death_rate": {"delta": -0.27},
    "completion_rate": {"delta": 0.18}
  }
}
```

Trend evidence does not increase or decrease the current version's `final_fitness`. Current quality and rate of improvement are separate facts. The calculator reports `improvement_delta = final_fitness - previous_fitness` and explanatory trend factors. Future GA selection can explicitly use both absolute fitness and improvement without allowing a weak version to outrank a strong version merely because it improved from a lower baseline.

### GameBlueprint Metadata

The calculator receives evaluation metadata, not the complete blueprint:

```json
{
  "game_id": "game-1",
  "version_id": "v3",
  "mechanics": ["dodge_combat", "skill_tree", "random_map"],
  "level_structure": {
    "type": "branching",
    "size": "medium",
    "exploration_depth": 0.72
  },
  "enemy_features": {
    "enemy_types": 12,
    "boss_patterns": 5
  },
  "skill_features": {
    "skill_count": 20,
    "interaction_count": 8
  },
  "theme_tags": ["dark_fantasy", "soulslike"]
}
```

Metadata identifiers must match the requested game and version when present. A mismatch causes that metadata to be ignored and explained. Tags are evidence labels, not a direct score boost, so novelty cannot be inflated by adding descriptive tags.

## Dimension Calculations

All intermediate values and scores are clamped to `[0, 1]`. Calculations are deterministic and rounded only when the final protocol is created.

### fun_proxy

`fun_proxy` combines observable behavior rather than raw play time:

```text
engagement          = engagement_proxy / 10
completion_quality  = target-band score for completion_rate
behavior_richness   = mean of available coverage, exploration_rate,
                      skill_usage_diversity, and route_variation
pace_quality        = mean of available progression_quality and
                      (1 - early_failure_rate)
replay_inclination  = retry_rate, or neutral 0.5 when unavailable
frustration         = mean of death_rate and available early_failure_rate

fun_proxy = clamp(
  engagement * 0.30 +
  completion_quality * 0.20 +
  behavior_richness * 0.20 +
  pace_quality * 0.15 +
  replay_inclination * 0.15 -
  frustration * 0.20
)
```

The completion target band is `[0.40, 0.80]`. Values inside the band score `1`. Values below `0.40` scale linearly from `0` to `1`; values above `0.80` scale linearly from `1` at `0.80` to `0` at `1.00`. Thus a near-zero completion rate and a trivial 100% completion rate are both negative signals.

Raw `play_time` is included in explanations and evidence confidence but does not directly add points because desirable duration depends on game type and cannot be normalized reliably in the default profile.

### playability

```text
playability =
  completion_rate * 0.35 +
  coverage * 0.30 +
  (1 - early_failure_rate) * 0.20 +
  progression_quality * 0.15
```

When optional fields are missing, their neutral value is `0.5`. `playability` measures whether a player can enter, progress through, and meaningfully access the game. It does not include QA or crash penalties.

### balance

The default profile targets challenging but achievable play:

```text
death_quality       = triangular target score, peak at 0.30, zero at 0 and 1
completion_quality  = target-band score for [0.40, 0.80]
progression_quality = supplied value, or neutral 0.5

balance =
  death_quality * 0.50 +
  completion_quality * 0.35 +
  progression_quality * 0.15
```

The death target is a profile parameter even in `default_v2`, so later genre profiles may change it without adding conditionals to the calculator.

### novelty

When Blueprint Metadata is present and valid:

```text
mechanic_diversity = unique mechanics / 6
system_interaction = interaction_count / 10
structure_variation = mean(
  structure type score,
  exploration_depth
)
content_variation = mean(
  enemy_types / 12,
  boss_patterns / 5,
  skill_count / 20
)

novelty = mean(
  mechanic_diversity,
  system_interaction,
  structure_variation,
  content_variation
)
```

Structure type scores are deterministic: `linear = 0.25`, `hub = 0.50`, `branching = 0.75`, and `procedural` or `random = 1.00`. Unknown types use `0.50`. Count thresholds are saturation points, not content requirements.

When valid Blueprint Metadata is absent:

```json
{
  "novelty": 0.5,
  "confidence": 0.3,
  "reason": "missing_blueprint_metadata"
}
```

### stability

```text
crash_free     = crashed ? 0 : 1
boot_quality   = started && boot_failures == 0 ? 1 : 0
error_quality  = 1 - min(1, (uncaught_errors + invalid_state_count) / 5)
frame_quality  = mean(1 - frame_drop_rate, avg_fps / target_fps)

stability =
  crash_free * 0.35 +
  boot_quality * 0.25 +
  error_quality * 0.25 +
  frame_quality * 0.15
```

Missing runtime metrics produce a neutral `stability` of `0.5` and low confidence rather than an assumed perfect runtime.

## Penalties

QA and runtime penalties are computed independently from dimension scores.

```text
qa_penalty = min(0.35,
  blocking_or_critical * 0.12 +
  error_or_high * 0.06 +
  warning_or_medium * 0.025 +
  info_or_low * 0.01
)

runtime_penalty = min(0.40,
  boot_failures * 0.20 +
  crashes * 0.20 +
  uncaught_errors * 0.03 +
  soft_failures * 0.01
)
```

Penalty caps prevent a large repeated error list from dominating the protocol numerically while still allowing severe failures to reduce fitness materially. Counts remain visible in the result.

## Final Calculation

```text
base_fitness =
  fun_proxy * profile.weights.fun_proxy +
  playability * profile.weights.playability +
  balance * profile.weights.balance +
  novelty * profile.weights.novelty +
  stability * profile.weights.stability

final_fitness = clamp(
  base_fitness - qa_penalty - runtime_penalty,
  0,
  1
)
```

`final_fitness` is the default version-ranking value and the future RL reward source. V2 does not convert it to an RL-specific scale or add trend bonuses.

## Confidence

Each dimension reports evidence confidence independently:

- `fun_proxy`: proportion and quality of available behavioral signals, with completed episode count saturating at three episodes.
- `playability`: proportion of its four available inputs.
- `balance`: availability of death, completion, and progression evidence.
- `novelty`: `0.3` without valid metadata; otherwise proportional to populated metadata groups, up to `1`.
- `stability`: proportion of populated runtime fields.

Overall confidence is the profile-weighted mean of dimension confidences. An incomplete EvaluationResult caps overall confidence at `0.60`; zero simulation episodes cap it at `0.40`. Confidence does not change `final_fitness`. Consumers can decide how conservative ranking should be while retaining an interpretable raw score.

## FitnessResult 2.0

```json
{
  "schema_version": "2.0",
  "fitness_id": "fitness-game1-v3",
  "game_id": "game1",
  "version_id": "v3",
  "profile": "default_v2",
  "scores": {
    "fun_proxy": 0.80,
    "playability": 0.85,
    "balance": 0.75,
    "novelty": 0.65,
    "stability": 0.95
  },
  "weights": {
    "fun_proxy": 0.30,
    "playability": 0.20,
    "balance": 0.20,
    "novelty": 0.10,
    "stability": 0.20
  },
  "penalties": {
    "critical_bugs": 0,
    "soft_failures": 2,
    "qa_penalty": 0.05,
    "runtime_penalty": 0
  },
  "base_fitness": 0.83,
  "final_fitness": 0.78,
  "confidence": {
    "overall": 0.88,
    "fun_proxy": 0.90,
    "playability": 0.90,
    "balance": 0.85,
    "novelty": 0.65,
    "stability": 1.00
  },
  "trend": {
    "points": 3,
    "previous_fitness": 0.68,
    "improvement_delta": 0.10
  },
  "explanations": [
    {
      "factor": "completion_rate",
      "dimension": "fun_proxy",
      "impact": 0.12,
      "reason": "completion rate is inside the target band"
    },
    {
      "factor": "high_death_rate",
      "dimension": "balance",
      "impact": -0.08,
      "reason": "death rate is above the default target"
    }
  ]
}
```

Protocol rules:

- Every score, weight, confidence, penalty, and fitness value is finite.
- Scores and confidence are bounded to `[0, 1]`.
- Penalties are non-negative and capped by their defined limits.
- Numeric outputs are rounded to four decimal places.
- Explanations are deterministic and ordered by absolute impact, then factor name.
- `impact` is numeric and signed so future optimizers can consume it directly.

## Blueprint Metadata Extraction

Director integration extracts metadata from the confirmed Intent DSL, Game Blueprint, and generated Game DSL using deterministic traversal. It does not send the blueprint to an LLM for novelty judging. Extraction deduplicates mechanics and tags, counts concrete skills/enemy patterns, and maps level topology to the normalized metadata contract. If extraction cannot establish a value, it omits that value rather than guessing.

The extractor is an adapter at the Director boundary, not part of the generic calculator. This keeps `FitnessCalculator` reusable with externally supplied metadata.

## SimulationMemory Integration

Simulation records gain an optional `fitness` object containing the complete `FitnessResult`. Existing records without it remain valid. Before calculating the current version, Director reads the latest prior record for the same `game_id` and persona and builds the trend input. After calculation, it appends the simulation evaluation and fitness atomically as one version record.

`SimulationMemory` continues using the existing `age_simulation_memory_v1` storage key in V2 to preserve history. The record shape is extended compatibly rather than migrating or deleting user data.

## Director and UI Integration

The Director's final sequence becomes:

```text
FinalQA admission
-> Engine load
-> bounded SimulationAgent run
-> RuntimeMetrics collection
-> Blueprint Metadata extraction
-> FitnessCalculator
-> SimulationMemory append
-> return Director result
```

The Director result adds `fitness`. The existing `score` field remains during V2 for compatibility, but the UI summary displays `fitness.final_fitness` as a percentage and labels it `Fitness`, not human fun. If fitness calculation unexpectedly fails, the generated game still succeeds, the error is represented as an incomplete fitness result with low confidence, and the legacy score remains available.

## Error Handling

- Invalid or missing optional inputs are normalized, not thrown.
- Non-finite numbers are treated as missing evidence.
- Out-of-range ratios are clamped and explained.
- Unknown profiles fall back to `default_v2`.
- Invalid profile definitions are rejected by `WeightProfile`; they never silently change weights.
- Metadata identifier mismatches cause metadata to be ignored.
- Fitness integration failures do not prevent an admitted Game DSL from running.
- Calculator output is deterministic for identical normalized input.

## Testing Strategy

### Unit tests

- Default profile exists, sums to `1`, and is immutable to callers.
- Custom valid profiles change weighting without changing calculator code.
- Invalid profiles are rejected and unknown names fall back predictably.
- Completion and death target functions cover boundaries and ideal ranges.
- `fun_proxy` uses multiple behavior signals and is unaffected by QA findings.
- QA and runtime penalties are separate and capped.
- Missing Blueprint Metadata yields novelty `0.5` with confidence `0.3`.
- Populated metadata produces deterministic novelty component scores.
- Missing runtime data yields neutral stability and low confidence.
- All output values are finite, bounded, and rounded.
- Trend produces `improvement_delta` without altering current fitness.
- Identical input produces deep-equal output except when an ID is intentionally generated.

### Integration tests

- Director returns a `FitnessResult` after simulation.
- SimulationMemory persists the fitness object and still reads legacy records.
- The UI uses V2 Fitness when present and remains compatible when absent.
- Both HTML entry points load profiles and calculator before `GameDirector.js`.
- Existing V1 tests continue to pass.

### Browser smoke test

Generate a game through Director mode, confirm the game still launches, confirm the status reports V2 Fitness rather than the legacy unbounded score, and verify the saved simulation record contains `fitness.schema_version === "2.0"`.

## Acceptance Criteria

V2 is complete when:

1. `default_v2` weights are configuration-driven and validated.
2. The calculator produces a deterministic `FitnessResult 2.0` in `[0, 1]`.
3. `fun_proxy` is behavior-derived and QA-independent.
4. QA and runtime failures are represented as separate penalties.
5. Missing Blueprint Metadata returns neutral novelty with low confidence.
6. Overall and novelty confidence are exposed.
7. Trend information reports improvement without contaminating absolute fitness.
8. Director mode returns and stores the V2 fitness result.
9. Existing generation, QA, simulation, and V1 compatibility tests pass.
10. No GA or RL training behavior is introduced.
