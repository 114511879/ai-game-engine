# AI Game Director 2.0 V1 Design

## Status

Approved design for the V1 multi-agent collaboration framework. This version implements the protocols and orchestration needed for an AI game development workflow. It does not implement reinforcement-learning training or genetic optimization.

## Goals

- Separate user-intent parsing from game-direction decisions.
- Use independent LLM roles instead of one prompt that simulates every discipline.
- Give each expert role a routed, read-only RAG context instead of allowing agents to search independently.
- Validate all agent output through a common schema.
- Enforce hard constraints deterministically before creative LLM synthesis.
- Run design QA before synthesis and DSL QA before engine loading.
- Wrap current automated playtesting as a Simulation Agent with persistent version history.
- Preserve the current browser-based IIFE architecture, `window.AGE` namespace, Universal Game DSL, plugin system, and existing public `A.GameDirector` entry point.

## Non-Goals

- Training a reinforcement-learning model.
- Running a genetic algorithm or producing generations of candidate games.
- Claiming statistically valid simulation of 1,000 human players.
- Generating or executing arbitrary JavaScript from an LLM.
- Replacing the current Engine, PluginSelector, DSLBinder, or existing game-type plugins.
- Adding a Program Agent before the system supports safe code generation.

## Architecture

```text
User Input
  |
  v
GameConsultant (conversation only)
  |
  v
IntentParserAgent
  |
  v
Intent DSL
  |
  v
ContextRouter -> RAGClient -> role-specific AgentContext
  |
  v
DirectorAgent selects expert roster
  |
  +-> DesignerAgent
  +-> LevelAgent
  +-> CombatAgent
  +-> StoryAgent (conditional)
  +-> EconomyAgent (conditional)
  +-> AssetAgent (conditional)
  |
  v
ProposalSchemaValidator
  |
  v
PreQAValidator
  |
  v
ConstraintEngine
  |
  v
Director LLM synthesis
  |
  v
Game Blueprint
  |
  v
AIGenerator -> DSLBinder -> FinalQA
  |
  v
Game Engine
  |
  v
SimulationAgent -> EvaluationResult -> SimulationMemory
```

`A.GameDirector` remains the public facade used by `main.js`. It delegates multi-agent design work to `A.DirectorAgent`, then keeps ownership of the existing generate, load, playtest, and optimization loop. The new Director Agent never parses raw user text and never loads the Engine.

## Responsibilities

### GameConsultant

Owns multi-turn clarification, user-facing questions, locked choices, and player-preference suggestions. It delegates extraction and normalization to `IntentParserAgent` and does not contain a second intent parser.

### IntentParserAgent

Converts raw input and confirmed consultation answers into a versioned Intent DSL. It has an LLM path and a deterministic local fallback. Its output is the only intent input accepted by `DirectorAgent`.

### ContextRouter

Builds role-specific queries from the Intent DSL and calls the existing `RAGClient`. Experts receive only an `AgentContext`; they cannot call RAG or web search directly. The router includes retrieved documents, citations, coverage, engine limitations, and an offline flag. An offline response remains usable and lowers proposal confidence.

### DirectorAgent

Selects the expert roster, creates tasks, starts independent expert calls in parallel with `Promise.allSettled`, gathers valid proposals, invokes Pre-QA and the deterministic constraint engine, and asks the Director LLM to resolve creative tradeoffs. It requests one revision only when blocking QA findings remain.

### Expert Agents

`DesignerAgent`, `LevelAgent`, and `CombatAgent` are always selected. `StoryAgent`, `EconomyAgent`, and `AssetAgent` are selected from a registry using Intent DSL features and game type. Experts produce design proposals only. They cannot mutate the Engine, write Game DSL, or execute code.

### PreQAValidator

Checks proposal completeness, numeric plausibility, dependency availability, and obvious cross-proposal contradictions before synthesis. It emits structured findings and never silently edits proposals.

### ConstraintEngine

Applies deterministic, named rules to normalized proposals. Rules cover Engine capabilities, allowed game types, numeric bounds, required systems, dependency compatibility, and cross-field invariants. Every decision includes a rule ID, field path, source agent, and action. The LLM may explain a rule result but cannot override a blocking rule.

### FinalQA

Runs after generation and before Engine loading. `DSLBinder` performs normalization, `DSLValidator` performs structural checks, and `FinalQAAgent` checks semantic consistency with the Intent DSL and Game Blueprint. Structural failures block Engine loading. One regeneration attempt is allowed.

### SimulationAgent

Wraps the existing `AITestAgent`, observer, anomaly detector, and playtest reporting. It runs bounded episodes for explicit player personas and returns normalized evaluation results. Simulation failure does not invalidate a Game DSL that already passed FinalQA.

### SimulationMemory

Stores local, versioned simulation history separately from conversation memory and player-preference memory. Records link a game version to its parent version, declared changes, persona, evaluation, and timestamp. Query operations provide per-game and per-persona history and trends for future optimizers.

## Core Data Contracts

### IntentDSL

The existing intent structure remains compatible and gains protocol metadata.

```json
{
  "schema_version": "1.0",
  "request_id": "request-1",
  "raw_request": "制作一个黑暗幻想 RPG",
  "game_type": "action_rpg",
  "theme": {"world": "dark_fantasy", "era": ""},
  "player": {"role": "cursed_knight", "ability": "magic"},
  "combat": {"style": "soulslike", "difficulty": "hard", "boss_focus": true},
  "camera": {"view": "third_person"},
  "emotion": {"target": "tense"},
  "progression": {"growth": "equipment"},
  "reference": ["soulslike"],
  "constraints": [],
  "confidence": 0.9
}
```

### AgentContext

```json
{
  "schema_version": "1.0",
  "agent": "CombatAgent",
  "documents": [],
  "coverage": 0.81,
  "limitations": [],
  "citations": [],
  "offline": false
}
```

### AgentProposal

All experts return exactly this envelope. Role-specific data lives only under `proposal`.

```json
{
  "schema_version": "1.0",
  "task_id": "combat-1",
  "agent": "CombatAgent",
  "status": "completed",
  "confidence": 0.9,
  "proposal": {},
  "constraints": [],
  "risks": [],
  "dependencies": []
}
```

### GameBlueprint

```json
{
  "schema_version": "1.0",
  "request_id": "request-1",
  "gameplay": {},
  "world": {},
  "levels": [],
  "characters": {},
  "balance": {},
  "art_direction": {},
  "engine_constraints": [],
  "decisions": [],
  "agent_trace": []
}
```

### GameDSL

The current Universal Game DSL remains the Engine contract. It is produced by `AIGenerator`, normalized by `DSLBinder`, and admitted to the Engine only after FinalQA. Agents cannot place executable JavaScript in this object.

### EvaluationResult

```json
{
  "schema_version": "1.0",
  "simulation_id": "sim-1",
  "persona": "new_player",
  "episodes": 3,
  "status": "completed",
  "metrics": {
    "play_time": 420,
    "death_rate": 0.67,
    "completion_rate": 0.33,
    "coverage": 0.74,
    "engagement_proxy": 7.2
  },
  "bugs": [],
  "reward": 62
}
```

V1 uses `engagement_proxy`, not `fun_score`, because automated play is not evidence of human enjoyment.

### SimulationMemoryRecord

```json
{
  "run_id": "run-3",
  "game_id": "game-1",
  "version_id": "v3",
  "parent_version": "v2",
  "persona": "new_player",
  "changes": ["增加战斗提示"],
  "evaluation": {"death_rate": 0.25, "completion_rate": 0.72},
  "created_at": 1786000000000
}
```

## Expert Selection

The registry always includes Designer, Level, and Combat. Conditional selection is deterministic:

- Story is selected for story-focused intents, narrative progression, dialog, relationships, mystery, or historical themes.
- Economy is selected for RPG progression, strategy, tower defense, card, simulation, or any resource economy.
- Asset is selected when art direction, named visual references, custom characters, environments, effects, or weapons are material to the request.

Selection decisions are stored in the orchestration trace.

## RAG Routing

The current RAG service accepts a query and Intent DSL. V1 reuses that API. `ContextRouter` creates role-specific queries and performs retrieval before agent execution. It may retrieve contexts in parallel, but it supplies each expert only its assigned result.

RAG failures return a valid offline `AgentContext`. Experts must list missing knowledge under risks and reduce confidence. No expert may perform its own network request. Context text is bounded before insertion into an LLM prompt, and source URLs remain citations rather than instructions.

## Orchestration Flow

1. GameConsultant gathers and confirms user choices.
2. IntentParserAgent returns a normalized Intent DSL.
3. ContextRouter selects role-specific queries and retrieves contexts.
4. DirectorAgent selects the expert roster and builds tasks.
5. Experts execute independently and concurrently.
6. ProposalSchemaValidator rejects malformed envelopes.
7. PreQAValidator reports design and dependency problems.
8. ConstraintEngine normalizes hard constraints and emits deterministic decisions.
9. The Director LLM synthesizes valid proposals and rule decisions into a Game Blueprint.
10. Blocking QA findings trigger at most one Director revision.
11. AIGenerator receives the user request, Intent DSL, bounded RAG context, and Game Blueprint.
12. DSLBinder normalizes the result and FinalQA decides whether it may enter the Engine.
13. The Engine loads an admitted Game DSL.
14. SimulationAgent runs bounded persona episodes and creates an EvaluationResult.
15. SimulationMemory appends a version-linked record.
16. Future RL and genetic optimizers may consume EvaluationResult and SimulationMemory through reserved interfaces; V1 does not implement those optimizers.

## Failure Policy

- Intent LLM failure uses the current deterministic intent inference and marks reduced confidence.
- RAG failure produces offline contexts; generation continues.
- An expert timeout or invalid schema receives one repair attempt, then falls back to a role default.
- If every expert fails, Director generation stops before AIGenerator.
- A blocking deterministic constraint cannot be overridden by the Director LLM.
- Director synthesis failure uses a deterministic blueprint merger.
- A structurally invalid Game DSL never enters the Engine and receives at most one regeneration attempt.
- FinalQA semantic warnings are retained in the result; semantic errors block loading.
- Simulation failure records an incomplete run without invalidating the generated game.
- Corrupt Simulation Memory records are isolated. Conversation, saved-game, and preference keys are untouched.

Each orchestration stage records `stage`, `status`, `elapsed_ms`, `warnings`, and protocol version identifiers. Traces exclude API keys and complete raw prompts.

## Test Strategy

### Unit Tests

- Intent DSL normalization and local fallback.
- AgentContext and AgentProposal validation.
- Dynamic expert selection for all supported game types.
- Role-specific ContextRouter queries and offline results with a mocked RAGClient.
- Pre-QA findings for impossible or incomplete proposals.
- Deterministic ConstraintEngine decisions and stable rule IDs.
- Blueprint merging and trace retention.
- FinalQA blocking behavior.
- EvaluationResult aggregation.
- SimulationMemory append, history, trend, corruption isolation, and storage-key separation.

### Integration Tests

- Mock LLM, RAG, and Engine dependencies and verify the full call order.
- Verify required experts start before any expert result resolves.
- Verify one failed expert degrades without stopping the workflow.
- Verify total expert failure stops before generation.
- Verify RAG is accessed only by ContextRouter.
- Verify a structural DSL failure never calls Engine load.
- Verify simulation runs append version-linked memory records.

### Regression Tests

Run the existing JavaScript and Python suites covering consultation, player memory, RAG, the 12 game types, generated story isolation, Engine behavior, and AI playtesting. Browser checks verify script order and Director status updates.

## Acceptance Criteria

- GameDirector does not parse raw intent for the multi-agent path.
- Every expert receives a role-specific AgentContext and returns the same AgentProposal envelope.
- Required experts execute concurrently and conditional experts are selected deterministically.
- Hard constraints produce repeatable results with rule IDs and cannot be overridden by an LLM.
- Pre-QA runs before Director synthesis and FinalQA runs before Engine loading.
- Invalid Game DSL cannot enter the Engine.
- Simulation results persist across game versions without mixing with preference memory.
- Offline RAG and a single failed expert degrade cleanly.
- Existing non-Director generation paths and regression tests remain functional.

## Compatibility and Rollout

New modules follow the current browser IIFE pattern and attach APIs to `window.AGE`. Script tags are added before `GameDirector.js` in both application HTML entry points. The existing `A.GameDirector` method called by `main.js` remains available. The multi-agent pipeline is introduced behind the Director path; ordinary generation and existing saved games remain compatible.

V1 implements the protocols above as the foundation for an AI Game OS. Additional optimizer algorithms, large-scale simulation claims, dynamic code generation, and new organizational roles require separate designs after this workflow is working and measured.
