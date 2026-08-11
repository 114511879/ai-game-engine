const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const timeoutDelays = [];
let clearCount = 0;
let fetchOptions = null;
const requestBodies = [];
let responseMode = 'truncate_once';
let fetchCount = 0;

class FakeAbortController {
  constructor() { this.signal = {name: 'signal'}; }
  abort() { this.signal.aborted = true; }
}

const sandbox = {
  console,
  JSON,
  Math,
  Date,
  AbortController: FakeAbortController,
  setTimeout(_callback, delay) { timeoutDelays.push(delay); return timeoutDelays.length; },
  clearTimeout() { clearCount++; },
  async fetch(_url, options) {
    fetchCount++;
    fetchOptions = options;
    requestBodies.push(JSON.parse(options.body));
    return {
      ok: true,
      async json() {
        if(responseMode === 'invalid_json') {
          return {choices: [{finish_reason: 'stop', message: {content: 'not-json'}}]};
        }
        if(fetchCount === 1) {
          return {choices: [{finish_reason: 'length', message: {content: '{"proposal":'}}]};
        }
        return {choices: [{finish_reason: 'stop', message: {content: '{"proposal":{"ok":true}}'}}]};
      }
    };
  }
};
sandbox.window = sandbox;
sandbox.AGE = {setStatus() {}};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
}

load('core/dsl/Config.js');
load('ai/generator/AIGenerator.js');

async function run() {
  const result = await sandbox.AGE.callStructuredAI('system', 'user', {
    timeout_ms: 1234,
    max_tokens: 1500,
    retry_on_length: true,
    max_retry_tokens: 6000
  });
  assert(result, 'truncated responses should be retried');
  assert.strictEqual(result.proposal.ok, true);
  assert.strictEqual(fetchCount, 2);
  assert(requestBodies[1].max_tokens > requestBodies[0].max_tokens);
  assert.deepStrictEqual(timeoutDelays, [1234, 1234]);
  assert(fetchOptions.signal, 'structured AI request must receive an AbortSignal');
  assert.strictEqual(clearCount, 2, 'every request timeout must be cleared');

  responseMode = 'invalid_json';
  const malformed = await sandbox.AGE.callStructuredAI('system', 'user', {
    retry_on_length: false,
    max_tokens: 100
  });
  assert.strictEqual(malformed, null);
  assert.strictEqual(sandbox.AGE.lastAIError.code, 'invalid_json');
  assert(sandbox.AGE.getAIErrorMessage().includes('JSON'));
  assert(!sandbox.AGE.getAIErrorMessage().includes('API Key'));
  const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  assert(mainSource.includes('A.getAIErrorMessage'), 'generation UI must display the real AI error');
  assert(!mainSource.includes("AI生成失败，请检查API Key"));
  console.log('structured AI v2 tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
