# AI Game Director V3 Genetic Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an opt-in, deterministic genetic evolution pipeline that mutates only declared Game DSL genes, evaluates candidates sequentially through deterministic QA, Simulation, and Fitness V2, stores experiments separately, and transactionally promotes one winner.

**Architecture:** Pure gene and GA modules under `evolution/` create deterministic candidate populations without Engine or storage dependencies. `EvolutionRunner` coordinates an injected `CandidateEvaluator` and `EvolutionMemory`, restores baseline on every exit, and returns an unpromoted winner. `EvolutionPromoter`, invoked by `GameDirector`, uses deterministic FinalQA, an Engine adapter, and a transactional PromotionStore to commit only a validated winner; ordinary Generate and Director flows remain unchanged.

**Tech Stack:** Vanilla JavaScript IIFEs on `window.AGE`, Node `vm`/`assert` unit tests, existing FinalQA/SimulationAgent/FitnessCalculator V2, browser localStorage, Playwright UI smoke tests.

---

## File Map

**Create:**

- `evolution/EvolutionProtocols.js`: V3 normalizers, canonical JSON, FNV-1a fingerprints, path utilities, status envelopes.
- `evolution/EvolutionProfiles.js`: immutable `default_ga_v3` configuration and validation.
- `evolution/SeededPRNG.js`: UTF-8 FNV seed reduction and Mulberry32 PRNG.
- `evolution/GeneSchemaValidator.js`: whitelist, type, grid, baseline, and immutable validation.
- `evolution/OptimizationSchemaBuilder.js`: deterministic legacy DSL safe templates.
- `evolution/GeneEncoder.js`: normalized gene-vector extraction/application/change tracing.
- `evolution/DuplicateDetector.js`: normalized gene-vector fingerprints.
- `evolution/MutationEngine.js`: four-type bounded seeded mutation.
- `evolution/CrossoverEngine.js`: uniform seeded crossover.
- `evolution/SelectionEngine.js`: deterministic sort, tournament selection, and elitism.
- `evolution/GeneticOptimizer.js`: pure population creation and next-generation APIs.
- `evolution/CandidateEvaluator.js`: deterministic QA, Engine lifecycle, Simulation, and Fitness adapter.
- `evolution/EvolutionMemory.js`: bounded `age_evolution_memory_v3` experiment history.
- `evolution/EvolutionRunner.js`: budgets, sequential candidate evaluation, cancellation, early stop, winner validation, and baseline restoration.
- `evolution/EvolutionPromoter.js`: all-or-nothing winner promotion through injected adapters.
- `tests/0815_evolution_protocols_v3.test.js`
- `tests/0815_gene_schema_v3.test.js`
- `tests/0815_genetic_operators_v3.test.js`
- `tests/0815_genetic_optimizer_v3.test.js`
- `tests/0815_candidate_evaluator_v3.test.js`
- `tests/0815_evolution_runner_v3.test.js`
- `tests/0815_evolution_promotion_v3.test.js`
- `tests/0815_evolution_director_v3.test.js`
- `tests/0815_evolution_ui_v3.test.js`

**Modify:**

- `core/engine/Engine.js`: explicit candidate teardown lifecycle.
- `ai/simulation/SimulationAgent.js`: candidate seed/determinism metadata and AbortSignal support.
- `ai/simulation/SimulationMemory.js`: transaction-safe snapshot/restore helpers used through the store adapter.
- `ai/director/GameDirector.js`: opt-in `runEvolution` orchestration; no change to default execution.
- `main.js`: Evolution UI mode, progress, cancellation, and browser PromotionStore adapter.
- `AI-ENGINE启动.html`: Evolution scripts, command, progress panel, stop control.
- `game.html`: load protocol/core modules needed by saved evolved games without invoking Evolution.
- `styles.css`: compact Evolution progress and cancellation controls.
- `README.md`: V3 architecture, entry, and safety boundary.
- `CHANGELOG.md`: V3 feature record and limitations.

## Runtime Commands

Use the bundled runtimes in every task:

```powershell
$node='C:\Users\administered0\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$python='C:\Users\administered0\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$env:NODE_PATH='C:\Users\administered0\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
```

---

### Task 1: Evolution Contracts, Default Profile, And Seeded PRNG

**Files:**
- Create: `evolution/EvolutionProtocols.js`
- Create: `evolution/EvolutionProfiles.js`
- Create: `evolution/SeededPRNG.js`
- Create: `tests/0815_evolution_protocols_v3.test.js`

- [ ] **Step 1: Write the failing protocol and reproducibility test**

```js
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const sandbox={console,JSON,Math,Date,isFinite,TextEncoder};sandbox.window=sandbox;sandbox.AGE={};vm.createContext(sandbox);
function load(file){vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox,{filename:file});}

load('evolution/EvolutionProtocols.js');
load('evolution/EvolutionProfiles.js');
load('evolution/SeededPRNG.js');
const A=sandbox.AGE,P=A.EvolutionProtocols;

assert.strictEqual(P.VERSION,'3.0');
assert.strictEqual(P.fnv1a('hello'),'4f9f2cab');
assert.strictEqual(P.scopeHash({variables:[{path:'player.hp',type:'integer'}],immutable:['assets']}),P.scopeHash({immutable:['assets'],variables:[{type:'integer',path:'player.hp'}]}));
assert.strictEqual(P.geneFingerprint([{path:'world.gravity',value:1},{path:'player.hp',value:8}]),P.geneFingerprint([{path:'player.hp',value:8},{path:'world.gravity',value:1}]));

const first=new A.SeededPRNG('ga-game1-run1');
const second=new A.SeededPRNG('ga-game1-run1');
assert.deepStrictEqual([first.next(),first.next(),first.next()],[second.next(),second.next(),second.next()]);
assert.notDeepStrictEqual(new A.SeededPRNG('a').sample([1,2,3,4],2),new A.SeededPRNG('b').sample([1,2,3,4],2));

const profile=A.EvolutionProfiles.resolve('default_ga_v3');
assert.strictEqual(profile.population_size,6);
assert.strictEqual(profile.elite_count,2);
assert.strictEqual(profile.max_generations,3);
assert.strictEqual(profile.max_candidates,18);
assert.throws(()=>A.EvolutionProfiles.register('bad',{population_size:2,elite_count:2}),/invalid_evolution_profile/);
console.log('evolution protocols v3 tests passed');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `& $node tests/0815_evolution_protocols_v3.test.js`

Expected: FAIL with `ENOENT` for `evolution/EvolutionProtocols.js`.

- [ ] **Step 3: Implement deterministic contracts and hashing**

`EvolutionProtocols.js` must expose these exact APIs:

```js
(function(){
var A=window.AGE=window.AGE||{},VERSION='3.0';
function copy(v){return v===undefined?undefined:JSON.parse(JSON.stringify(v));}
function finite(v){return typeof v==='number'&&isFinite(v);}
function canonical(value){
  if(Array.isArray(value))return'['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return'{'+Object.keys(value).sort().map(function(k){return JSON.stringify(k)+':'+canonical(value[k]);}).join(',')+'}';
  return JSON.stringify(value);
}
function fnv1a(text){
  var bytes=new TextEncoder().encode(String(text)),hash=0x811c9dc5;
  for(var i=0;i<bytes.length;i++){hash^=bytes[i];hash=Math.imul(hash,0x01000193)>>>0;}
  return('00000000'+hash.toString(16)).slice(-8);
}
function normalizePath(path){return String(path||'').split('.').filter(Boolean).join('.');}
function getPath(root,path){return normalizePath(path).split('.').reduce(function(v,k){return v==null?undefined:v[k];},root);}
function setPath(root,path,value){var keys=normalizePath(path).split('.'),target=root;for(var i=0;i<keys.length-1;i++)target=target[keys[i]];target[keys[keys.length-1]]=value;return root;}
function scopeHash(scope){
  var normalized={schema_version:VERSION,builder_version:scope.builder_version||'3.0',engine_capability_version:scope.engine_capability_version||'1.0',immutable:(scope.immutable||[]).map(normalizePath).sort(),variables:(scope.variables||[]).map(copy).sort(function(a,b){return normalizePath(a.path).localeCompare(normalizePath(b.path));})};
  return'ga3:'+fnv1a(canonical(normalized));
}
function geneFingerprint(vector){
  var normalized=(vector||[]).map(function(g){return{path:normalizePath(g.path),value:g.value};}).sort(function(a,b){return a.path.localeCompare(b.path);});
  return'genes:'+fnv1a(canonical(normalized));
}
A.EvolutionProtocols={VERSION:VERSION,copy:copy,finite:finite,canonical:canonical,fnv1a:fnv1a,normalizePath:normalizePath,getPath:getPath,setPath:setPath,scopeHash:scopeHash,geneFingerprint:geneFingerprint};
})();
```

- [ ] **Step 4: Implement Mulberry32 PRNG and immutable profile registry**

```js
/** SeededPRNG.js */
(function(){var A=window.AGE,P=A.EvolutionProtocols;
A.SeededPRNG=function(seed){this.seed=String(seed);this.state=parseInt(P.fnv1a(this.seed),16)>>>0;};
A.SeededPRNG.prototype.next=function(){var t=this.state+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
A.SeededPRNG.prototype.pick=function(values){return values[Math.floor(this.next()*values.length)];};
A.SeededPRNG.prototype.sample=function(values,count){var pool=values.slice(),out=[];while(out.length<count&&pool.length)out.push(pool.splice(Math.floor(this.next()*pool.length),1)[0]);return out;};
A.SeededPRNG.prototype.derive=function(suffix){return new A.SeededPRNG(this.seed+String(suffix));};
})();
```

`EvolutionProfiles.js` registers `default_ga_v3` with every field from the design spec, validates `population_size > elite_count >= 1`, `max_generations === 3`, finite non-negative budgets, tournament size, crossover rate, retry count, and early-stop values, and returns deep copies from `resolve()`.

- [ ] **Step 5: Run the test and verify GREEN**

Run: `& $node tests/0815_evolution_protocols_v3.test.js`

Expected: `evolution protocols v3 tests passed`.

- [ ] **Step 6: Commit only Task 1 files**

```powershell
git add -- evolution/EvolutionProtocols.js evolution/EvolutionProfiles.js evolution/SeededPRNG.js tests/0815_evolution_protocols_v3.test.js
git diff --cached --check
git commit -m "feat: add deterministic evolution protocols"
```

### Task 2: Gene Schema Validation And Legacy Safe Templates

**Files:**
- Create: `evolution/GeneSchemaValidator.js`
- Create: `evolution/OptimizationSchemaBuilder.js`
- Create: `tests/0815_gene_schema_v3.test.js`

- [ ] **Step 1: Write failing schema safety tests**

```js
const baseline={meta:{game_type:'runner'},player:{hp:8,speed:3,jump_power:-12},world:{gravity:1,scroll_speed:5},skills:[{cooldown:30}],assets:{characters:[]}};
const schema={immutable:['assets','meta.game_id'],variables:[
  {name:'hp',path:'player.hp',type:'integer',range:[3,16],step:2,mutation_rate:.1,importance:'high'},
  {name:'gravity',path:'world.gravity',type:'number',range:[.5,2],step:.1,mutation_rate:.2,importance:'medium'},
  {name:'mode',path:'meta.game_type',type:'enum',values:['runner','dungeon'],mutation_rate:.1},
  {name:'missing',path:'player.missing',type:'boolean',mutation_rate:.1},
  {name:'asset_parent',path:'assets',type:'boolean',mutation_rate:.1}
]};
const result=new A.GeneSchemaValidator().validate(baseline,schema);
assert.deepStrictEqual(result.valid_genes.map(g=>g.name),['hp','gravity','mode']);
assert(result.findings.some(f=>f.code==='GENE_PATH_MISSING'));
assert(result.findings.some(f=>f.code==='GENE_IMMUTABLE_CONFLICT'));

const outOfRange=new A.GeneSchemaValidator().validate({player:{hp:17}},{variables:[{name:'hp',path:'player.hp',type:'integer',range:[3,16],step:1,mutation_rate:.1}],immutable:[]});
assert(outOfRange.findings.some(f=>f.code==='GENE_BASELINE_OUT_OF_RANGE'));

const ancestorConflict=new A.GeneSchemaValidator().validate({player:{hp:8}},{variables:[{name:'player',path:'player',type:'boolean',mutation_rate:.1}],immutable:['player.hp']});
assert(ancestorConflict.findings.some(f=>f.code==='GENE_IMMUTABLE_CONFLICT'));

const built=A.OptimizationSchemaBuilder.build(baseline,{engine_capability_version:'1.0'});
assert(built.variables.some(v=>v.path==='player.hp'));
assert(built.variables.every(v=>A.EvolutionProtocols.getPath(baseline,v.path)!==undefined));
assert.strictEqual(built.target,'maximize_final_fitness');
console.log('gene schema v3 tests passed');
```

- [ ] **Step 2: Run and verify RED**

Run: `& $node tests/0815_gene_schema_v3.test.js`

Expected: FAIL because `A.GeneSchemaValidator` is missing.

- [ ] **Step 3: Implement strict schema validation**

The validator returns `{valid_genes, findings, status}` and uses this exact conflict predicate:

```js
function pathConflict(variablePath,immutablePath){
  var v=P.normalizePath(variablePath),i=P.normalizePath(immutablePath);
  return v===i||v.indexOf(i+'.')===0||i.indexOf(v+'.')===0;
}
```

Implement finite `mutation_rate` validation, unique name/path tracking, existing path checks, strict current-value types, numeric finite range/step validation, no semantic clamp, enum uniqueness/current membership, and boolean strictness. Numeric representation tolerance is `Math.max(1e-9, Math.abs(step)*1e-9)` around the anchored grid; larger mismatch emits `GENE_BASELINE_OFF_GRID`.

- [ ] **Step 4: Implement deterministic legacy schema builder**

Use a fixed template table and include a variable only when its exact path exists:

```js
var COMMON=[
  {name:'player_hp',path:'player.hp',type:'integer',range:[3,16],step:1,mutation_rate:.10,importance:'high'},
  {name:'player_speed',path:'player.speed',type:'number',range:[1,8],step:.5,mutation_rate:.15,importance:'medium'},
  {name:'jump_power',path:'player.jump_power',type:'number',range:[-20,-6],step:1,mutation_rate:.10,importance:'medium'},
  {name:'gravity',path:'world.gravity',type:'number',range:[.5,2],step:.1,mutation_rate:.10,importance:'medium'},
  {name:'scroll_speed',path:'world.scroll_speed',type:'number',range:[1,10],step:.5,mutation_rate:.15,importance:'medium'},
  {name:'enemy_spawn_rate',path:'entities.enemies.0.spawn_rate',type:'integer',range:[20,80],step:5,mutation_rate:.20,importance:'high'},
  {name:'primary_skill_cooldown',path:'skills.0.cooldown',type:'integer',range:[10,120],step:5,mutation_rate:.15,importance:'medium'}
];
```

Add fixed type-specific candidates for existing DSL extension fields (`rpg.enemy_hp`, `tower_defense.waves`, `card.enemy_hp`, `simulation.target_population`, `racing.time_limit`) and filter them by path existence. Return `builder_version:'3.0'`, `engine_capability_version`, deterministic immutable defaults, and no guessed path.

- [ ] **Step 5: Run tests and commit**

Run: `& $node tests/0815_gene_schema_v3.test.js`

Expected: `gene schema v3 tests passed`.

```powershell
git add -- evolution/GeneSchemaValidator.js evolution/OptimizationSchemaBuilder.js tests/0815_gene_schema_v3.test.js
git diff --cached --check
git commit -m "feat: validate evolution gene schemas"
```

### Task 3: Gene Encoding, Application, And Duplicate Fingerprints

**Files:**
- Create: `evolution/GeneEncoder.js`
- Create: `evolution/DuplicateDetector.js`
- Modify: `tests/0815_gene_schema_v3.test.js`

- [ ] **Step 1: Add failing encode/apply/fingerprint assertions**

```js
const genes=result.valid_genes;
const vector=A.GeneEncoder.encode(baseline,genes);
assert.deepStrictEqual(Array.from(vector).map(v=>v.path),['player.hp','world.gravity','meta.game_type'].sort());
const applied=A.GeneEncoder.apply(baseline,genes,[{path:'player.hp',value:10},{path:'world.gravity',value:1.2},{path:'meta.game_type',value:'runner'}]);
assert.strictEqual(applied.dsl.player.hp,10);
assert.strictEqual(baseline.player.hp,8,'baseline must remain immutable');
assert.deepStrictEqual(applied.changes,[{name:'hp',path:'player.hp',old:8,new:10,importance:'high'}]);

const detector=new A.DuplicateDetector();
assert.strictEqual(detector.fingerprint([{path:'player.hp',value:10},{path:'world.gravity',value:1.2}]),detector.fingerprint([{path:'world.gravity',value:1.2},{path:'player.hp',value:10}]));
assert.strictEqual(detector.add([{path:'player.hp',value:10}]),true);
assert.strictEqual(detector.add([{path:'player.hp',value:10}]),false);
```

- [ ] **Step 2: Run and verify RED**

Run: `& $node tests/0815_gene_schema_v3.test.js`

Expected: FAIL because `A.GeneEncoder` is missing.

- [ ] **Step 3: Implement normalized vectors and immutable DSL application**

`GeneEncoder.encode(dsl, genes)` returns `{name,path,type,value,importance}` entries sorted by path. `apply()` deep-copies the baseline, rejects undeclared vector paths, writes only through `EvolutionProtocols.setPath`, performs a final immutable check, and returns `{dsl, gene_vector, changes}` with changes sorted by path.

Numeric normalization uses:

```js
function normalizeNumber(value,gene){
  var min=gene.range[0],step=gene.step,precision=(String(step).split('.')[1]||'').length;
  var normalized=min+Math.round((value-min)/step)*step;
  normalized=Math.max(min,Math.min(gene.range[1],normalized));
  return Number(normalized.toFixed(precision));
}
```

- [ ] **Step 4: Implement normalized duplicate tracking**

`DuplicateDetector` wraps `EvolutionProtocols.geneFingerprint`, stores fingerprints in an instance-owned set-like object, exposes `fingerprint(vector)`, `has(vector)`, `add(vector)`, and `clear()`, and never reads full DSL objects.

- [ ] **Step 5: Run tests and commit**

Run: `& $node tests/0815_gene_schema_v3.test.js`

Expected: `gene schema v3 tests passed`.

```powershell
git add -- evolution/GeneEncoder.js evolution/DuplicateDetector.js tests/0815_gene_schema_v3.test.js
git diff --cached --check
git commit -m "feat: encode and fingerprint evolution genes"
```

### Task 4: Mutation, Crossover, Selection, And Elitism

**Files:**
- Create: `evolution/MutationEngine.js`
- Create: `evolution/CrossoverEngine.js`
- Create: `evolution/SelectionEngine.js`
- Create: `tests/0815_genetic_operators_v3.test.js`

- [ ] **Step 1: Write failing four-type mutation and budget tests**

```js
const schema=[
  {name:'hp',path:'player.hp',type:'integer',range:[3,16],step:2,mutation_rate:1,importance:'high'},
  {name:'gravity',path:'world.gravity',type:'number',range:[.5,2],step:.1,mutation_rate:1},
  {name:'mode',path:'mode',type:'enum',values:['a','b','c'],mutation_rate:1},
  {name:'shield',path:'shield',type:'boolean',mutation_rate:1}
];
const vector=[{path:'player.hp',value:9},{path:'world.gravity',value:1},{path:'mode',value:'a'},{path:'shield',value:true}];
const mutation=new A.MutationEngine();
const first=mutation.mutate(vector,schema,{seed:'run:g0:c1',max_mutated_variables:3});
const second=mutation.mutate(vector,schema,{seed:'run:g0:c1',max_mutated_variables:3});
assert.deepStrictEqual(first,second);
assert.strictEqual(first.changes.length,3);
assert(first.gene_vector.find(g=>g.path==='player.hp').value%2===1,'integer grid must anchor at 3');
assert.notStrictEqual(first.gene_vector.find(g=>g.path==='mode').value,'a');
assert.strictEqual(first.triggered_genes,4);

const zeroRates=schema.map(g=>Object.assign({},g,{mutation_rate:0}));
assert.strictEqual(mutation.mutate(vector,zeroRates,{seed:'forced',max_mutated_variables:5}).changes.length,1);
```

- [ ] **Step 2: Add failing crossover/selection assertions**

```js
const crossover=new A.CrossoverEngine();
assert.deepStrictEqual(crossover.cross(vector,first.gene_vector,{seed:'cross'}),crossover.cross(vector,first.gene_vector,{seed:'cross'}));

const population=[
  {candidate_id:'c2',fitness:{final_fitness:.8,confidence:{overall:.9}},changes:[1,2]},
  {candidate_id:'c1',fitness:{final_fitness:.8,confidence:{overall:.9}},changes:[1]},
  {candidate_id:'c3',fitness:{final_fitness:.7,confidence:{overall:1}},changes:[]}
];
const selection=new A.SelectionEngine();
assert.strictEqual(selection.sort(population)[0].candidate_id,'c1');
assert.deepStrictEqual(selection.tournament(population,{seed:'t',size:3}),selection.tournament(population,{seed:'t',size:3}));
assert.deepStrictEqual(selection.elites(population,2).map(c=>c.candidate_id),['c1','c2']);
```

- [ ] **Step 3: Run and verify RED**

Run: `& $node tests/0815_genetic_operators_v3.test.js`

Expected: FAIL because operator modules are absent.

- [ ] **Step 4: Implement bounded mutation**

For each gene, consume one seeded rate check. If triggered count exceeds budget, use `SeededPRNG.sample` to select applied paths. If none trigger, seeded-pick one gene. Integer/number mutations pick direction from `[-1,1]`, apply one step, normalize to the anchored grid, and if a boundary would produce no change, use the opposite direction. Enum excludes current; boolean flips. Return `{gene_vector,changes,triggered_genes,applied_mutations}`.

- [ ] **Step 5: Implement uniform crossover and deterministic selection**

`CrossoverEngine.cross(a,b,{seed})` iterates paths in sorted order and selects one parent's value per gene. `SelectionEngine.sort` implements the frozen four-level comparator. `tournament` samples without replacement and returns the best. `elites` returns deep copies so later mutation cannot alter prior generations.

- [ ] **Step 6: Verify and commit**

Run: `& $node tests/0815_genetic_operators_v3.test.js`

Expected: `genetic operators v3 tests passed`.

```powershell
git add -- evolution/MutationEngine.js evolution/CrossoverEngine.js evolution/SelectionEngine.js tests/0815_genetic_operators_v3.test.js
git diff --cached --check
git commit -m "feat: add deterministic genetic operators"
```

### Task 5: Pure GeneticOptimizer Population Evolution

**Files:**
- Create: `evolution/GeneticOptimizer.js`
- Create: `tests/0815_genetic_optimizer_v3.test.js`

- [ ] **Step 1: Write failing Generation 0, next-generation, duplicate, and reproduction tests**

```js
const optimizer=new A.GeneticOptimizer();
const initial=optimizer.createInitialPopulation({baselineGeneVector:vector,geneSchema:schema,profile:A.EvolutionProfiles.resolve('default_ga_v3'),runSeed:'ga-game1-run1'});
assert.strictEqual(initial.candidates.length,6);
assert.strictEqual(initial.candidates[0].candidate_id,'g0-c0');
assert.deepStrictEqual(initial.candidates[0].gene_vector,vector);
assert.strictEqual(initial.candidates[0].lineage,'baseline');
assert(initial.candidates.slice(1).every(c=>c.changes.length>=1));
assert.deepStrictEqual(initial,optimizer.createInitialPopulation({baselineGeneVector:vector,geneSchema:schema,profile:A.EvolutionProfiles.resolve('default_ga_v3'),runSeed:'ga-game1-run1'}));

const evaluated=initial.candidates.map((candidate,index)=>Object.assign({},candidate,{status:'evaluated',fitness:{final_fitness:.5+index*.05,confidence:{overall:.8}}}));
const next=optimizer.nextGeneration({generation:1,evaluatedPopulation:evaluated,geneSchema:schema,profile:A.EvolutionProfiles.resolve('default_ga_v3'),runSeed:'ga-game1-run1'});
assert.strictEqual(next.candidates.length,6);
assert.strictEqual(next.candidates.filter(c=>c.lineage==='elite').length,2);
assert(next.candidates.filter(c=>c.lineage!=='elite').every(c=>c.generation===1));
assert(next.stats.generated_attempts>=4);
assert(next.stats.duplicates_rejected>=0);
```

- [ ] **Step 2: Run and verify RED**

Run: `& $node tests/0815_genetic_optimizer_v3.test.js`

Expected: FAIL because `A.GeneticOptimizer` is missing.

- [ ] **Step 3: Implement pure population APIs**

Constructor accepts only operator dependencies. `createInitialPopulation` creates unchanged `g0-c0` plus five mutations using candidate seeds. `nextGeneration` sorts evaluated candidates, copies two elites without evaluation requests, creates four offspring via tournament, `crossover.rate`, bounded mutation, and current-generation duplicate detection. Duplicate retries derive `:retry1..5`; exhaustion emits a candidate with `status:'duplicate_exhausted'`. No method references `A._currentEngine`, FinalQA, Simulation, storage, Date, UI, or `Math.random`.

Return shape:

```js
{
  generation: 1,
  candidates: [],
  stats: {generated_attempts:0,duplicates_rejected:0,evaluated_candidates:0,reused_candidates:2,failed_candidates:0}
}
```

- [ ] **Step 4: Add a source-level purity assertion and verify**

```js
const source=fs.readFileSync(path.join(root,'evolution/GeneticOptimizer.js'),'utf8');
['Math.random','_currentEngine','SimulationAgent','FinalQA','localStorage'].forEach(forbidden=>assert(!source.includes(forbidden),forbidden+' must not appear in GeneticOptimizer'));
```

Run: `& $node tests/0815_genetic_optimizer_v3.test.js`

Expected: `genetic optimizer v3 tests passed`.

- [ ] **Step 5: Commit**

```powershell
git add -- evolution/GeneticOptimizer.js tests/0815_genetic_optimizer_v3.test.js
git diff --cached --check
git commit -m "feat: evolve deterministic gene populations"
```

### Task 6: Engine Teardown, Simulation Cancellation, And CandidateEvaluator

**Files:**
- Modify: `core/engine/Engine.js`
- Modify: `ai/simulation/SimulationAgent.js`
- Create: `evolution/CandidateEvaluator.js`
- Create: `tests/0815_candidate_evaluator_v3.test.js`
- Modify: `tests/0806_simulation_memory_v1.test.js`
- Modify: `tests/0806_engine_regression_v1.test.js`

- [ ] **Step 1: Write failing lifecycle and QA-before-Simulation tests**

Use injected adapters and assert exact order:

```js
const calls=[];
const evaluator=new A.CandidateEvaluator({
  finalQA:{validate(){calls.push('qa');return{admitted:true,findings:[],structural:{valid:true}};}},
  engine:{reset(){calls.push('reset');},load(){calls.push('load');},teardown(){calls.push('teardown');}},
  simulation:{async run(_engine,options){calls.push('simulation:'+options.seed);return A.AgentProtocols.evaluationResult({simulation_id:'s',persona:'new_player',episodes:1,metrics:{completion_rate:.7,death_rate:.3,coverage:.8,engagement_proxy:7}});}},
  fitnessFactory(){return{calculateFitness(){calls.push('fitness');return A.FitnessTypes.fitnessResult({fitness_id:'f',game_id:'g',version_id:'candidate',scores:{fun_proxy:.7,playability:.8,balance:.8,novelty:.5,stability:.8},weights:{fun_proxy:.3,playability:.2,balance:.2,novelty:.1,stability:.2},final_fitness:.75,confidence:{overall:.8}});}};}
});
const result=await evaluator.evaluate(validDsl,{candidate_seed:'run:g0:c1',intent,blueprint,optimization_scope_hash:'ga3:x',persona:'new_player',episodes:1,timeout_ms:1000,fitness_profile:'default_v2'});
assert.strictEqual(result.status,'evaluated');
assert.deepStrictEqual(calls,['qa','reset','load','simulation:run:g0:c1','fitness','teardown','reset']);
```

Add a rejected QA case and assert `simulation` is never called. Add a timeout/Abort case and assert teardown/reset still run.

- [ ] **Step 2: Run and verify RED**

Run: `& $node tests/0815_candidate_evaluator_v3.test.js`

Expected: FAIL because `CandidateEvaluator.js` is absent.

- [ ] **Step 3: Add explicit Engine teardown**

Add this behavior to `GameEngine`:

```js
A.GameEngine.prototype.teardown=function(){
  if(this.playTester&&typeof this.playTester.stop==='function')try{this.playTester.stop();}catch(error){}
  if(this.plugin&&typeof this.plugin.onUnload==='function')try{this.plugin.onUnload(this);}catch(error){}
  this.playTester=null;
  this._projectiles=[];
  this._onBossDefeated=null;
};
```

Keep `reset()` separate. Extend engine regression tests to assert teardown invokes `playTester.stop` and plugin `onUnload` once without changing ordinary `load/restart` behavior.

- [ ] **Step 4: Add AbortSignal and seed propagation to SimulationAgent**

At every episode boundary and tick, stop tester/observer/anomaly and reject with an error whose `name === 'AbortError'` when `options.signal.aborted`. Pass `options.seed + ':episode' + index` into the episode runner options. Add `simulation_deterministic: options.deterministic === true` to EvaluationResult through an additive protocol field, and update V1 tests so old callers retain current behavior.

- [ ] **Step 5: Implement CandidateEvaluator with timeout-owned AbortController**

The evaluator must:

1. check external abort;
2. call `FinalQA.validate(candidateDSL,intent,blueprint)`;
3. return `qa_rejected` before Engine calls when not admitted;
4. create an internal AbortController and timeout;
5. reset/load Engine;
6. call Simulation with seed, persona, episodes, and signal;
7. calculate V2 Fitness with the configured profile;
8. reject non-finite/out-of-range Fitness;
9. clear timeout and always `teardown(); reset();` in `finally`.

Return normalized `{status,qa,evaluation,runtime,fitness,simulation_deterministic,elapsed_ms,error}`.

- [ ] **Step 6: Verify affected tests and commit**

```powershell
& $node tests/0815_candidate_evaluator_v3.test.js
& $node tests/0806_simulation_memory_v1.test.js
& $node tests/0806_engine_regression_v1.test.js
```

Expected: all three pass.

```powershell
git add -- core/engine/Engine.js ai/simulation/SimulationAgent.js evolution/CandidateEvaluator.js tests/0815_candidate_evaluator_v3.test.js tests/0806_simulation_memory_v1.test.js tests/0806_engine_regression_v1.test.js
git diff --cached --check
git commit -m "feat: isolate and cancel candidate evaluation"
```

### Task 7: EvolutionMemory And EvolutionRunner

**Files:**
- Create: `evolution/EvolutionMemory.js`
- Create: `evolution/EvolutionRunner.js`
- Create: `tests/0815_evolution_runner_v3.test.js`

- [ ] **Step 1: Write failing bounded-memory tests**

Use an in-memory storage adapter, append 51 runs, and assert the oldest is evicted by `created_at`, failures remain, full candidate DSL is stripped, and only normalized trace fields persist under `age_evolution_memory_v3`.

```js
const memory=new A.EvolutionMemory(storage);
for(let i=0;i<51;i++)memory.append({run_id:'r'+i,game_id:'g',status:i===10?'failed':'completed',created_at:i,best_candidate:{dsl:{large:true}},optimization_trace:[]});
assert.strictEqual(memory.all().length,50);
assert.strictEqual(memory.all()[0].run_id,'r1');
assert(memory.all().some(r=>r.status==='failed'));
assert.strictEqual(memory.all()[0].best_candidate&&memory.all()[0].best_candidate.dsl,undefined);
```

- [ ] **Step 2: Write failing Runner precondition, ordering, budget, early-stop, and cancellation tests**

Inject a fake optimizer and evaluator. Assert:

```js
assert.strictEqual((await runner.runEvolution(dsl,{baseline_qa:{admitted:true}})).stopped_reason,'baseline_fitness_required');
assert.strictEqual((await runner.runEvolution(dsl,{baseline_fitness:fitness})).stopped_reason,'baseline_qa_required');
assert.deepStrictEqual(evaluationOrder,['g0-c1','g0-c2','g0-c3','g0-c4','g0-c5','g1-c2','g1-c3','g1-c4','g1-c5','g2-c2','g2-c3','g2-c4','g2-c5']);
assert.strictEqual(result.status,'completed');
assert(['max_generations','early_stop'].includes(result.stopped_reason));
assert.strictEqual(engineRestoreCalls,1);
```

Abort during `g1-c2`, then assert no later evaluator calls, `stopped_reason === 'cancelled'`, `promotion.status === 'not_requested'`, partial EvolutionMemory exists, and baseline restoration ran in `finally`.

- [ ] **Step 3: Run and verify RED**

Run: `& $node tests/0815_evolution_runner_v3.test.js`

Expected: FAIL because runner/memory modules are missing.

- [ ] **Step 4: Implement bounded EvolutionMemory**

Use storage key `age_evolution_memory_v3`, validate `run_id/game_id`, deep-copy run data, remove every persisted `best_candidate.dsl`, cap evaluated trace entries at 18, retain bounded duplicate/failure summaries, sort by `created_at`, and keep the newest 50.

- [ ] **Step 5: Implement EvolutionRunner orchestration**

Constructor dependencies: `{optimizer,evaluator,memory,schemaValidator,schemaBuilder,finalQA,engineAdapter,onStatus,clock}`. Implement:

```js
A.EvolutionRunner.prototype.runEvolution=async function(baselineDSL,options){
  // normalize result envelope
  // reject missing baseline Fitness/full QA/scope match before population creation
  // build or validate explicit schema
  // create g0 through the pure optimizer
  // reuse g0-c0 baseline Fitness; evaluate only new non-elites in stable order
  // enforce AbortSignal, timeout/failure/candidate budgets
  // pass evaluated population back to optimizer for g1 and g2
  // apply early-stop patience
  // final deterministic QA of ranked candidates
  // persist run without full candidate DSL
  // always restore baseline through engineAdapter in finally
  // return unpromoted best candidate with its existing Evaluation and Fitness
};
```

Emit status `{stage,generation,candidate_id,current_fitness,best_fitness,baseline_fitness}` after every state change. Never write SimulationMemory or current version.

- [ ] **Step 6: Verify and commit**

Run: `& $node tests/0815_evolution_runner_v3.test.js`

Expected: `evolution runner v3 tests passed`.

```powershell
git add -- evolution/EvolutionMemory.js evolution/EvolutionRunner.js tests/0815_evolution_runner_v3.test.js
git diff --cached --check
git commit -m "feat: orchestrate bounded game evolution"
```

### Task 8: Transactional EvolutionPromoter

**Files:**
- Modify: `ai/simulation/SimulationMemory.js`
- Create: `evolution/EvolutionPromoter.js`
- Create: `tests/0815_evolution_promotion_v3.test.js`

- [ ] **Step 1: Write failing successful-promotion and rollback tests**

```js
const events=[];
const store={
  begin(){events.push('begin');return{current_version:'v1'};},
  commit(data){events.push('commit:'+data.promoted_version_id);return data;},
  rollback(){events.push('rollback');}
};
const engine={load(dsl){events.push('load:'+dsl.meta.title);},reset(){events.push('reset');}};
const promoter=new A.EvolutionPromoter({finalQA:{validate(){events.push('qa');return{admitted:true,findings:[]};}},engine,store,idFactory(){return'v4';}});
const promoted=await promoter.promote({baseline:{version_id:'v1',dsl:baseline},winner:{candidate_id:'g2-c2',dsl:winner,evaluation,fitness_result}});
assert.strictEqual(promoted.status,'promoted');
assert.strictEqual(promoted.promoted_version_id,'v4');
assert.deepStrictEqual(events,['qa','begin','load:winner','commit:v4']);
```

Make `store.commit` throw and assert rollback, reset, baseline load, no promoted ID, and reused winner evaluation/fitness were passed without Simulation calls. Add deterministic QA rejection and ranked fallback tests.

- [ ] **Step 2: Run and verify RED**

Run: `& $node tests/0815_evolution_promotion_v3.test.js`

Expected: FAIL because `EvolutionPromoter.js` is absent.

- [ ] **Step 3: Add SimulationMemory transaction snapshot helpers**

Expose additive methods used only by an adapter:

```js
A.SimulationMemory.prototype.snapshot=function(){return this.storage.getItem(STORAGE_KEY);};
A.SimulationMemory.prototype.restore=function(raw){if(raw===null||raw===undefined)this.storage.removeItem(STORAGE_KEY);else this.storage.setItem(STORAGE_KEY,raw);};
```

Keep existing append/history behavior unchanged and cover snapshot/restore in V1 tests.

- [ ] **Step 4: Implement all-or-nothing promotion**

`EvolutionPromoter.promote` validates winner, calls `store.begin()`, loads winner, calls one `store.commit({promoted_version_id,dsl,parent_version,evaluation,fitness})`, and returns promoted only after commit succeeds. `store.commit` owns the official DSL, SimulationMemory, and final `current_version` write. Any error calls `store.rollback(snapshot)`, then Engine reset and baseline load. Rejected QA tries the next ranked winner; all rejected returns `{status:'rejected',reason:'winner_qa_rejected'}` without `begin()`.

- [ ] **Step 5: Verify and commit**

```powershell
& $node tests/0815_evolution_promotion_v3.test.js
& $node tests/0806_simulation_memory_v1.test.js
```

Expected: both pass.

```powershell
git add -- ai/simulation/SimulationMemory.js evolution/EvolutionPromoter.js tests/0815_evolution_promotion_v3.test.js tests/0806_simulation_memory_v1.test.js
git diff --cached --check
git commit -m "feat: transactionally promote evolved winners"
```

### Task 9: GameDirector Opt-In Evolution Integration

**Files:**
- Modify: `ai/director/GameDirector.js`
- Create: `tests/0815_evolution_director_v3.test.js`
- Modify: `tests/0806_game_director_v2.test.js`

- [ ] **Step 1: Write failing zero-call and enabled-call tests**

Inject runner/promoter counters. Run existing `runDirectorLoop` and assert both counters remain zero. Then call:

```js
const result=await director.runEvolution(baselineDsl,{
  enabled:true,
  baseline_version:'v1',
  baseline_fitness:fitness,
  baseline_qa:{admitted:true,semantic_qa:{status:'passed',optimization_scope_hash:scopeHash}},
  intent,
  blueprint,
  random_seed:'ga-game1-run1'
});
assert.strictEqual(runnerCalls,1);
assert.strictEqual(promoterCalls,1);
assert.strictEqual(result.promotion.status,'promoted');
assert.strictEqual(result.dsl.meta.title,'winner');
```

Add disabled, cancelled, rejected, and promotion-failed cases; each must return/load baseline and never fabricate `promoted_version_id`.

- [ ] **Step 2: Run and verify RED**

Run: `& $node tests/0815_evolution_director_v3.test.js`

Expected: FAIL because `GameDirector.prototype.runEvolution` is missing.

- [ ] **Step 3: Add dependency injection and opt-in orchestration**

Extend the constructor with `_evolutionRunner` and `_evolutionPromoter`. Add `runEvolution(baselineDSL,options)` that returns `not_requested` when disabled, delegates to Runner when enabled, skips Promoter on cancellation/no winner, calls Promoter for a valid winner, and combines baseline/evolution/promotion data. Do not call it from ordinary `runDirectorLoop`; the UI/API explicitly invokes it after the baseline result exists.

Progress from Runner passes through `_statusCallback` without changing algorithm data.

- [ ] **Step 4: Verify V2 and V3 Director paths**

```powershell
& $node tests/0815_evolution_director_v3.test.js
& $node tests/0806_game_director_v2.test.js
& $node tests/0806_multi_agent_director_v1.test.js
```

Expected: all pass, and old tests observe zero GA calls.

- [ ] **Step 5: Commit**

```powershell
git add -- ai/director/GameDirector.js tests/0815_evolution_director_v3.test.js tests/0806_game_director_v2.test.js
git diff --cached --check
git commit -m "feat: orchestrate opt-in game evolution"
```

### Task 10: Evolution UI, PromotionStore Adapter, And Script Wiring

**Files:**
- Modify: `AI-ENGINE启动.html`
- Modify: `game.html`
- Modify: `styles.css`
- Modify: `main.js`
- Create: `tests/0815_evolution_ui_v3.test.js`
- Modify: `tests/0806_multi_agent_director_v1.test.js`

- [ ] **Step 1: Write failing static UI and script-order assertions**

```js
const html=fs.readFileSync(path.join(root,'AI-ENGINE启动.html'),'utf8');
const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
assert(html.includes('id="btnEvolution"'));
assert(html.includes('id="btnStopEvolution"'));
assert(html.includes('id="evolutionPanel"'));
assert(main.includes("submitPrompt('evolution')"));
assert(main.includes('AbortController'));
assert(main.includes('createPromotionStore'));
assert(main.includes("pendingMode==='evolution'"));
assert(html.indexOf('evolution/EvolutionProtocols.js')<html.indexOf('evolution/EvolutionRunner.js'));
assert(html.indexOf('evolution/EvolutionRunner.js')<html.indexOf('ai/director/GameDirector.js'));
```

- [ ] **Step 2: Write a Playwright mode/cancel smoke test with injected EvolutionRunner**

Open the app, fill a prompt, click `🧬 进化`, confirm `pendingMode` through visible consultant flow, inject a long-running deterministic Runner through the supported app dependency seam, click `停止进化`, and assert the visible result contains `cancelled`, the panel hides, no game card claims promotion, and ordinary Director remains callable.

- [ ] **Step 3: Run and verify RED**

Run: `& $node tests/0815_evolution_ui_v3.test.js`

Expected: FAIL because Evolution controls are absent.

- [ ] **Step 4: Add Evolution command and compact progress panel**

Add a toolbar icon button with title/accessible label, a full-width unframed progress band, fixed-size status grid, progress bar, and a destructive-outline `停止进化` command. Preserve current mobile layout and stable toolbar dimensions. Do not add marketing or explanatory copy.

- [ ] **Step 5: Load modules in dependency order**

Both entry pages load:

```html
<script src="evolution/EvolutionProtocols.js"></script>
<script src="evolution/EvolutionProfiles.js"></script>
<script src="evolution/SeededPRNG.js"></script>
<script src="evolution/GeneSchemaValidator.js"></script>
<script src="evolution/OptimizationSchemaBuilder.js"></script>
<script src="evolution/GeneEncoder.js"></script>
<script src="evolution/DuplicateDetector.js"></script>
<script src="evolution/MutationEngine.js"></script>
<script src="evolution/CrossoverEngine.js"></script>
<script src="evolution/SelectionEngine.js"></script>
<script src="evolution/GeneticOptimizer.js"></script>
<script src="evolution/CandidateEvaluator.js"></script>
<script src="evolution/EvolutionMemory.js"></script>
<script src="evolution/EvolutionRunner.js"></script>
<script src="evolution/EvolutionPromoter.js"></script>
```

Place all before `GameDirector.js`. Loading in `game.html` must not start Evolution.

- [ ] **Step 6: Implement UI orchestration and transactional browser store**

Add `ChatUI.evolutionAbortController`, bind Evolution/Stop buttons, branch `generateFromIntent` to `runEvolutionMode`, and display Runner progress. `runEvolutionMode` first calls the existing Director baseline path, then explicitly calls `director.runEvolution` with baseline QA/Fitness/version evidence.

`ChatUI.createPromotionStore()` captures raw conversation storage, `age_game_<convId>`, SimulationMemory snapshot, and current conversation version. Its `commit(data)` writes the official game DSL, appends winner Evaluation/Fitness, and updates current conversation/version last. `rollback(snapshot)` restores all raw values. Storage exceptions propagate to Promoter.

On cancellation, keep baseline DSL/game card, show stopped reason, save Evolution trace, and never call store commit.

- [ ] **Step 7: Verify UI and regression tests**

```powershell
& $node tests/0815_evolution_ui_v3.test.js
& $node tests/0806_multi_agent_director_v1.test.js
& $node tests/0806_consultant_ui_v1.test.js
& $node tests/0806_rag_ui_v1.test.js
```

Expected: all pass.

- [ ] **Step 8: Commit**

```powershell
git add -- AI-ENGINE启动.html game.html styles.css main.js tests/0815_evolution_ui_v3.test.js tests/0806_multi_agent_director_v1.test.js
git diff --cached --check
git commit -m "feat: add explicit game evolution mode"
```

### Task 11: Documentation, Full Regression, Browser Verification, And Pull Request

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Document the implemented V3 boundary**

README must state:

- Evolution is opt-in through `🧬 进化` or explicit `evolution.enabled`.
- Only `optimization.variables` paths can change.
- V3 uses seeded FNV-1a/Mulberry32 search and V2 `final_fitness`.
- Candidate experiments use EvolutionMemory; only promoted winner enters SimulationMemory.
- Cancellation restores baseline and never promotes.
- V3 does not include RL training or parallel candidate evaluation.

CHANGELOG records the same user-facing behavior and the 6/2/3 default profile.

- [ ] **Step 2: Run syntax checks for every new/modified JavaScript source**

```powershell
$files=@(
  'evolution/EvolutionProtocols.js','evolution/EvolutionProfiles.js','evolution/SeededPRNG.js',
  'evolution/GeneSchemaValidator.js','evolution/OptimizationSchemaBuilder.js','evolution/GeneEncoder.js',
  'evolution/DuplicateDetector.js','evolution/MutationEngine.js','evolution/CrossoverEngine.js',
  'evolution/SelectionEngine.js','evolution/GeneticOptimizer.js','evolution/CandidateEvaluator.js',
  'evolution/EvolutionMemory.js','evolution/EvolutionRunner.js','evolution/EvolutionPromoter.js',
  'core/engine/Engine.js','ai/simulation/SimulationAgent.js','ai/simulation/SimulationMemory.js',
  'ai/director/GameDirector.js','main.js'
)
foreach($file in $files){& $node --check $file;if($LASTEXITCODE -ne 0){throw "Syntax failed: $file"}}
```

Expected: 20 files exit 0.

- [ ] **Step 3: Run every JavaScript test**

```powershell
$tests=Get-ChildItem -LiteralPath tests -Filter '*.test.js' | Sort-Object Name
$passed=0
foreach($test in $tests){& $node $test.FullName;if($LASTEXITCODE -ne 0){throw "JS failed: $($test.Name)"};$passed++}
Write-Output "JS_PASS_COUNT=$passed"
```

Expected: all V1, V2, and V3 test files pass.

- [ ] **Step 4: Run every Python test**

```powershell
$tests=Get-ChildItem -LiteralPath tests -Filter '*.test.py' | Sort-Object Name
$passed=0
foreach($test in $tests){& $python $test.FullName;if($LASTEXITCODE -ne 0){throw "Python failed: $($test.Name)"};$passed++}
Write-Output "PY_PASS_COUNT=$passed"
```

Expected: all RAG/web-search tests pass.

- [ ] **Step 5: Start the local server and run browser release blockers**

```powershell
$listener=Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue
if(-not $listener){Start-Process -FilePath $python -ArgumentList '-m','http.server','4173','--bind','127.0.0.1' -WorkingDirectory (Get-Location) -WindowStyle Hidden}
```

At `http://127.0.0.1:4173/AI-ENGINE%E5%90%AF%E5%8A%A8.html`, verify:

- ordinary Generate performs zero Evolution calls;
- ordinary Director performs zero Evolution calls;
- `🧬 进化` shows g0/g1/g2 progress and Fitness values;
- stopping prevents new candidates, restores baseline, and shows no promoted version;
- a deterministic injected successful run promotes once and its game card opens;
- no local console errors occur;
- saved experiment and official histories follow the dual-memory boundary through public UI evidence/tests; do not manually inspect browser storage through the Browser skill.

- [ ] **Step 6: Update README/CHANGELOG and commit explicit docs**

```powershell
git add -- README.md CHANGELOG.md
git diff --cached --check
git commit -m "docs: document v3 genetic evolution"
```

- [ ] **Step 7: Inspect task files for publish safety**

```powershell
git status --short
git diff origin/master...HEAD --name-status
git diff origin/master...HEAD --check
git grep -n -I -E 'BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|api[_-]?key[[:space:]]*[:=]|password[[:space:]]*[:=]' -- evolution tests ai core main.js AI-ENGINE启动.html game.html styles.css README.md CHANGELOG.md
```

Expected: only V3 task files appear; no credentials, caches, screenshots, build outputs, or unexplained binaries.

- [ ] **Step 8: Push the task branch and create a Pull Request**

```powershell
git push -u origin codex/v3-genetic-evolution
$jsPassCount=(Get-ChildItem -LiteralPath tests -Filter '*.test.js').Count
$pyPassCount=(Get-ChildItem -LiteralPath tests -Filter '*.test.py').Count
$reviewedPrBody=@"
## Summary
- add deterministic, whitelist-only genetic evolution for Game DSL
- evaluate candidates sequentially and persist experiments separately
- promote validated winners transactionally through the explicit Evolution flow

## Verification
- JavaScript syntax: 20 files passed
- JavaScript tests: $jsPassCount files passed
- Python tests: $pyPassCount files passed
- Browser release blockers: passed at the documented local URL

## Known limitations
- candidate evaluation is sequential
- V3 does not include reinforcement-learning training
"@
gh pr create --base master --head codex/v3-genetic-evolution --title "feat: add deterministic genetic game evolution" --body $reviewedPrBody
```

The PR body must include the implementation summary, exact syntax/JS/Python/browser verification results, the sequential evaluation limitation, and confirmation that RL training is not included. Verify `HEAD`, `origin/codex/v3-genetic-evolution`, and PR head SHA are identical. Do not merge the PR.

---

## Plan Self-Review Checklist

- Spec coverage: Tasks 1-5 cover deterministic core and gene safety; Task 6 covers runtime isolation; Task 7 covers Runner, budgets, cancellation, and EvolutionMemory; Task 8 covers transactional Promotion; Tasks 9-10 cover Director and explicit UI entry; Task 11 covers release gates and publication.
- Dependency direction: `GeneticOptimizer` is completed and tested before runtime modules and has source-level forbidden-dependency assertions.
- Budget consistency: `max_generations=3` means g0/g1/g2; baseline and elites reuse Fitness; the planned stable evaluator order contains 13 new evaluations.
- Status consistency: Runner returns `completed|failed|rejected` plus stopped reason; Promotion status remains independent.
- Persistence consistency: Runner writes EvolutionMemory only; Promoter/store writes official DSL and SimulationMemory only after winner validation.
- Cancellation consistency: Abort never invokes Promotion and baseline restoration occurs in Runner `finally`.
- Placeholder scan: the plan contains no TBD/TODO or unspecified implementation step.
