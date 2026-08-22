const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {console, JSON, Math, Date, isFinite, Promise};
sandbox.window = sandbox;
sandbox.AGE = {};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
}

load('playtest/EngineAdapter.js');
load('playtest/PlayTestEvaluator.js');
load('playtest/PlayTestRunCoordinator.js');

const A = sandbox.AGE;

async function run() {
  const events = [];
  const engine = {name: 'fake-engine'};
  const engineAdapter = new A.EngineAdapter({
    engine,
    reset() { events.push('reset'); },
    load(dsl) { events.push('load:' + dsl.id); },
    teardown() { events.push('teardown'); },
    releaseAllInputs() { events.push('release'); }
  });
  const evaluator = new A.PlayTestEvaluator({
    engineAdapter,
    episodeRunner: async (_engine, options) => {
      events.push('episode:' + options.candidate_id);
      return {
        status: 'completed',
        episodes: 1,
        findings: options.candidate_id === 'c1' ? [{finding_id: 'f1', bug_fingerprint: 'bug:f1', first_seen_transition: 2, status: 'provisional'}] : [],
        reward_ledger: {entries: []},
        replay_results: []
      };
    }
  });
  const one = await evaluator.evaluate({id: 'dsl-c1'}, {
    candidate_id: 'c1',
    candidate_seed: 'candidate-seed-1',
    policy_snapshot: {policy_version: 'pt-v4-1', policy_hash: 'policy:1'}
  });
  assert.strictEqual(one.status, 'completed');
  assert.strictEqual(one.policy_version, 'pt-v4-1');
  assert.strictEqual(one.findings.length, 1);
  assert.deepStrictEqual(events, ['reset', 'load:dsl-c1', 'release', 'episode:c1', 'teardown', 'reset']);

  const replayCalls = [];
  const coordinator = new A.PlayTestRunCoordinator({
    evaluator,
    replayRunner: {
      async confirm(finding) {
        replayCalls.push(finding.finding_id);
        return {status: 'confirmed', attempts_run: 1, successes: 1, bug_fingerprint: finding.bug_fingerprint};
      }
    }
  });
  const subjects = [
    {candidate_id: 'baseline', lineage: 'baseline', dsl: {id: 'baseline'}, fingerprint: 'genes:base'},
    {candidate_id: 'c1', lineage: 'candidate', dsl: {id: 'dsl-c1'}, fingerprint: 'genes:c1'},
    {candidate_id: 'c1-duplicate', lineage: 'candidate', dsl: {id: 'dsl-c1-duplicate'}, fingerprint: 'genes:c1'},
    {candidate_id: 'elite-c1', lineage: 'elite', dsl: {id: 'dsl-c1'}, fingerprint: 'genes:c1', playtest: one},
    {candidate_id: 'c2', lineage: 'candidate', dsl: {id: 'dsl-c2'}, fingerprint: 'genes:c2'}
  ];
  const runResult = await coordinator.run(subjects, {
    enabled: true,
    policy_snapshot: {policy_version: 'pt-v4-1', policy_hash: 'policy:1'},
    max_playtest_episodes_per_run: 2,
    max_replay_attempts_per_run: 1
  });
  assert.strictEqual(runResult.discovery.episodes_started, 2);
  assert.strictEqual(runResult.discovery.duplicates_skipped, 1);
  assert.strictEqual(runResult.discovery.elite_results_reused, 1);
  assert.strictEqual(runResult.subjects.find(row => row.candidate_id === 'c2').playtest.status, 'not_run');
  assert.strictEqual(runResult.replay.attempts_run, 1);
  assert.deepStrictEqual(replayCalls, ['f1']);
  assert.strictEqual(runResult.subjects.find(row => row.candidate_id === 'c1').playtest.replay_results[0].status, 'confirmed');

  const disabled = await coordinator.run(subjects, {enabled: false});
  assert.strictEqual(disabled.discovery.episodes_started, 0);
  assert.strictEqual(disabled.replay.attempts_run, 0);

  console.log('playtest evaluator v4 tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
