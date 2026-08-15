const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'AI-ENGINE启动.html'), 'utf8');
const game = fs.readFileSync(path.join(root, 'game.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

assert(html.includes('id="btnEvolution"'));
assert(html.includes('id="btnStopEvolution"'));
assert(html.includes('id="evolutionPanel"'));
assert(html.includes('id="evolutionBaselineFitness"'));
assert(html.includes('id="evolutionCurrentFitness"'));
assert(html.includes('id="evolutionBestFitness"'));
assert(html.includes('id="evolutionImprovement"'));
assert(main.includes("submitPrompt('evolution')"));
assert(main.includes("pendingMode==='evolution'"));
assert(main.includes('AbortController'));
assert(main.includes('evolutionAbortController'));
assert(main.includes('createPromotionStore'));
assert(main.includes('createEvolutionRuntime'));
assert(main.includes('runEvolutionMode'));
assert(main.includes('updateEvolutionPanel'));
assert(styles.includes('.evolution-panel'));
assert(styles.includes('.evolution-progress-fill'));

const scripts = [
  'evolution/EvolutionProtocols.js',
  'evolution/EvolutionProfiles.js',
  'evolution/SeededPRNG.js',
  'evolution/GeneSchemaValidator.js',
  'evolution/OptimizationSchemaBuilder.js',
  'evolution/GeneEncoder.js',
  'evolution/DuplicateDetector.js',
  'evolution/MutationEngine.js',
  'evolution/CrossoverEngine.js',
  'evolution/SelectionEngine.js',
  'evolution/GeneticOptimizer.js',
  'evolution/CandidateEvaluator.js',
  'evolution/EvolutionMemory.js',
  'evolution/EvolutionRunner.js',
  'evolution/EvolutionPromoter.js'
];

function assertScriptOrder(source, label) {
  let previous = -1;
  scripts.forEach(script => {
    const index = source.indexOf(script);
    assert(index > previous, label + ' must load ' + script + ' in order');
    previous = index;
  });
  assert(previous < source.indexOf('ai/director/GameDirector.js'), label + ' must load Evolution before GameDirector');
}

assertScriptOrder(html, 'app entry');
assertScriptOrder(game, 'game entry');
assert(!/runDirector:[\s\S]{0,800}runEvolution\(/.test(main), 'ordinary Director helper must not start Evolution');

(async function() {
  const browser = await chromium.launch({headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
  const page = await browser.newPage({viewport: {width: 1280, height: 800}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('age.deepseek_api_key', 'test-key'));
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForURL(/AI-ENGINE/);
  await page.evaluate(() => {
    localStorage.clear();
    AGE.callStructuredAI = async function() { return null; };
    AGE.RAGClient.retrieve = async function() { return {available: false, error: 'offline'}; };
    ChatUI.runDirector = async function() {
      const dsl = {
        meta: {game_type: 'runner', game_id: 'game-ui', title: 'UI Baseline'},
        player: {hp: 3, speed: 3}, world: {gravity: 1, scroll_speed: 5},
        rules: {win_condition: 'survive_time', win_value: 60}, skills: [{cooldown: 30}]
      };
      return {
        success: true, dsl, gameType: 'runner', title: 'UI Baseline',
        directorResult: {
          dsl,
          qa: {admitted: true, findings: []},
          blueprint: {levels: []},
          evaluation: {schema_version: '1.0', status: 'completed', episodes: 1},
          fitness: {schema_version: '2.0', game_id: 'game-ui', version_id: 'v1', final_fitness: 0.7, confidence: {overall: 0.9}}
        }
      };
    };
    ChatUI.createEvolutionRuntime = function() {
      return {
        director: {
          runEvolution(_dsl, options) {
            return new Promise(resolve => {
              const finish = () => resolve({
                schema_version: '3.0', run_id: 'ui-cancel-run', game_id: 'game-ui',
                status: 'completed', stopped_reason: 'cancelled', best_candidate: null,
                promotion: {status: 'not_requested'}
              });
              if (options.signal.aborted) finish();
              else options.signal.addEventListener('abort', finish, {once: true});
            });
          }
        }
      };
    };
  });
  await page.locator('#prompt').fill('生成一个简单跑酷游戏');
  await page.locator('#btnEvolution').click();
  await page.locator('#consultantPanel').waitFor({state: 'visible'});
  await page.locator('#btnConsultantSkip').click();
  await page.locator('#evolutionPanel').waitFor({state: 'visible'});
  await page.locator('#btnStopEvolution').click();
  await page.locator('#evolutionPanel').waitFor({state: 'hidden'});
  await page.locator('.game-card').waitFor({state: 'visible'});
  const messageText = await page.locator('#messages').innerText();
  assert(messageText.includes('进化已停止'));
  assert(!messageText.includes('已晋升'));
  assert.strictEqual(await page.evaluate(() => typeof ChatUI.runDirector), 'function');
  const transaction = await page.evaluate(() => {
    const store = ChatUI.createPromotionStore();
    const snapshot = store.begin();
    const winner = {meta: {game_type: 'runner', game_id: 'game-ui', title: 'UI Winner'}, player: {hp: 5}};
    store.commit({
      promoted_version_id: 'v2', candidate_id: 'g2-c2', run_id: 'ui-promotion', game_id: 'game-ui',
      dsl: winner, parent_version: 'v1', evaluation: {status: 'completed', persona: 'new_player'},
      fitness: {schema_version: '2.0', final_fitness: 0.82}, changes: [{path: 'player.hp'}]
    });
    const promoted = Memory.get(ChatUI.currentConv.id);
    const promotedHistory = new AGE.SimulationMemory(localStorage).history('game-ui', 'new_player');
    store.rollback(snapshot);
    const rolledBack = Memory.get(ChatUI.currentConv.id);
    const rolledBackHistory = new AGE.SimulationMemory(localStorage).history('game-ui', 'new_player');
    return {
      promotedVersion: promoted.current_version,
      promotedTitle: promoted.dsl.meta.title,
      promotedHistoryCount: promotedHistory.length,
      rolledBackVersion: rolledBack.current_version,
      rolledBackTitle: rolledBack.dsl.meta.title,
      rolledBackHistoryCount: rolledBackHistory.length
    };
  });
  assert.deepStrictEqual(transaction, {
    promotedVersion: 'v2', promotedTitle: 'UI Winner', promotedHistoryCount: 1,
    rolledBackVersion: 'v1', rolledBackTitle: 'UI Baseline', rolledBackHistoryCount: 0
  });
  await page.locator('#btnNewChat').click();
  await page.evaluate(() => {
    window.__promotionRuns = 0;
    ChatUI.createEvolutionRuntime = function() {
      return {
        director: {
          async runEvolution() {
            window.__promotionRuns++;
            const dsl = {meta: {game_type: 'runner', game_id: 'game-ui', title: 'UI Winner'}, player: {hp: 5}};
            return {
              schema_version: '3.0', run_id: 'ui-success-run', game_id: 'game-ui',
              status: 'completed', stopped_reason: 'max_generations', dsl,
              best_candidate: {candidate_id: 'g2-c2', dsl, fitness: 0.82, fitness_delta: 0.12},
              promotion: {status: 'promoted', promoted_version_id: 'v2'}
            };
          }
        }
      };
    };
  });
  await page.locator('#prompt').fill('再次生成简单跑酷游戏');
  await page.locator('#btnEvolution').click();
  await page.locator('#consultantPanel').waitFor({state: 'visible'});
  await page.locator('#btnConsultantSkip').click();
  await page.locator('#evolutionPanel').waitFor({state: 'hidden'});
  await page.locator('.game-card-title').last().waitFor({state: 'visible'});
  assert((await page.locator('.game-card-title').last().innerText()).includes('UI Winner'));
  assert((await page.locator('#messages').innerText()).includes('已晋升 v2'));
  assert.strictEqual(await page.evaluate(() => window.__promotionRuns), 1);
  assert.strictEqual(errors.length, 0, errors.join('\n'));
  await browser.close();
  console.log('evolution UI v3 tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
