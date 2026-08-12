const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.resolve(__dirname, '../ai/research/RAGClient.js'), 'utf8');
const mainSource = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');

function load(options) {
  options = options || {};
  const calls = [];
  const timers = [];
  const window = { AGE: {} };
  if (options.native !== false) {
    window.AndroidRag = {
      retrieve: (id, payload) => calls.push({ method: 'retrieve', id, payload: JSON.parse(payload) }),
      saveExperience: (id, payload) => calls.push({ method: 'saveExperience', id, payload: JSON.parse(payload) }),
      health: id => calls.push({ method: 'health', id })
    };
  }
  const sandbox = {
    window,
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    fetch: options.fetch || (async url => { throw new Error('unexpected fetch ' + url); }),
    setTimeout: callback => { timers.push(callback); return timers.length; },
    clearTimeout: () => {},
    console,
    Promise,
    Map,
    Date,
    JSON,
    Error
  };
  vm.runInNewContext(source, sandbox, { filename: 'RAGClient.js' });
  return { AGE: window.AGE, calls, timers };
}

async function testNativeRetrieve() {
  const runtime = load();
  const intent = {
    game_type: 'dungeon',
    theme: { world: 'dark_chinese_myth' },
    camera: { view: 'third_person' },
    combat: { style: 'souls_like', difficulty: 'hard', boss_focus: true },
    systems: ['skills']
  };
  const pending = runtime.AGE.RAGClient.retrieve('生成暗黑地牢亡灵 Boss', intent);
  assert.strictEqual(runtime.calls.length, 1);
  assert.strictEqual(runtime.calls[0].method, 'retrieve');
  assert.deepStrictEqual(Array.from(runtime.calls[0].payload.queries), [
    '生成暗黑地牢亡灵 Boss',
    'dungeon dark_chinese_myth third_person',
    'souls_like hard boss skills'
  ]);
  runtime.AGE.NativeRAG.resolve(runtime.calls[0].id, JSON.stringify({
    runtime_mode: 'native_semantic',
    documents: [
      { id: 'one', title: 'Boss', content: 'Boss pattern', score: 0.9, metadata: { type: 'boss' } },
      { id: 'two', title: 'Dungeon', content: 'Dungeon flow', score: 0.7, metadata: { type: 'level' } }
    ],
    coverage: 0.8
  }));
  const result = await pending;
  assert.strictEqual(result.available, true);
  assert.strictEqual(result.runtime_mode, 'native_semantic');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.source_counts)), { local: 2, web: 0 });
  assert.strictEqual(result.web_search_used, false);
  assert(result.context_text.includes('Boss pattern'));
}

async function testNativeSaveAndTimeout() {
  const runtime = load();
  const save = runtime.AGE.RAGClient.saveExperience({ conversation_id: 'one' });
  assert.strictEqual(runtime.calls[0].method, 'saveExperience');
  runtime.AGE.NativeRAG.resolve(runtime.calls[0].id, JSON.stringify({ indexed: true }));
  assert.strictEqual((await save).indexed, true);

  const retrieve = runtime.AGE.RAGClient.retrieve('timeout', {});
  const lateId = runtime.calls[1].id;
  runtime.timers[1]();
  const timedOut = await retrieve;
  assert.strictEqual(timedOut.available, false);
  assert(timedOut.error.includes('超时'));
  runtime.AGE.NativeRAG.resolve(lateId, '{}');
}

async function testBrowserHttpTransport() {
  const urls = [];
  const runtime = load({
    native: false,
    fetch: async (url) => {
      urls.push(url);
      return { ok: true, json: async () => ({ documents: [], coverage: 0 }) };
    }
  });
  await runtime.AGE.RAGClient.retrieve('browser', {});
  await runtime.AGE.RAGClient.saveExperience({ conversation_id: 'browser' });
  assert.strictEqual(urls[0], 'http://127.0.0.1:8765/api/rag/retrieve');
  assert.strictEqual(urls[1], 'http://127.0.0.1:8765/api/experience');
}

function testNativeStatusCopyContract() {
  assert(mainSource.includes('正在初始化本机知识库'));
  assert(mainSource.includes('本机语义知识库'));
  assert(mainSource.includes('本机关键词降级检索'));
}

(async function run() {
  await testNativeRetrieve();
  await testNativeSaveAndTimeout();
  await testBrowserHttpTransport();
  testNativeStatusCopyContract();
  console.log('android offline RAG client tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
