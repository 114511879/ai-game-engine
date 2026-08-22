const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'AI-ENGINE启动.html'), 'utf8');
const game = fs.readFileSync(path.join(root, 'game.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

['playtestPanel', 'playtestEnabled', 'playtestPolicyVersion', 'playtestDiscoveryProgress', 'playtestReplayProgress', 'playtestFindingSummary', 'playtestTrainingStatus', 'btnStopPlaytestTraining'].forEach(id => {
  assert(html.includes('id="' + id + '"'), 'missing UI id ' + id);
});
['PlayTestProtocols.js', 'CanonicalStateSerializer.js', 'CoreStateEncoder.js', 'MacroActionSchema.js', 'EpisodeTracker.js', 'ReplayRunner.js', 'RewardLedger.js', 'ReplayBuffer.js', 'QLearningTrainer.js', 'PolicyValidator.js', 'PolicyStore.js', 'TrainingMemory.js', 'EngineAdapter.js', 'PlayTestEvaluator.js', 'TrainingCoordinator.js', 'PolicyPromoter.js'].forEach(file => {
  const index = html.indexOf('playtest/' + file);
  assert(index >= 0, 'missing script ' + file);
});
assert(html.indexOf('playtest/PlayTestProtocols.js') < html.indexOf('playtest/QLearningTrainer.js'));
assert(html.indexOf('playtest/QLearningTrainer.js') < html.indexOf('playtest/PolicyPromoter.js'));
assert(game.indexOf('playtest/PlayTestProtocols.js') < game.indexOf('playtest/PolicyPromoter.js'));
assert(main.includes('playtest_enabled:playtestEnabled'));
assert(main.includes('startPlaytestTraining'));
assert(main.includes('stopPlaytestTraining'));
assert(main.includes('playtestTrainingAbortController'));
assert(main.includes('updatePlaytestPanel'));
assert(main.includes('new A.PlayTestEvaluator'));
assert(styles.includes('.playtest-panel'));
assert(styles.includes('.playtest-stats'));
console.log('playtest UI v4 tests passed');
