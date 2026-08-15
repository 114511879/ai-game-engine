const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { console, Date, JSON, Math };
sandbox.window = sandbox;
sandbox.AGE = {};
const listeners = {keydown: new Set(), keyup: new Set()};
sandbox.document = {
  addEventListener(type, handler) { if (listeners[type]) listeners[type].add(handler); },
  removeEventListener(type, handler) { if (listeners[type]) listeners[type].delete(handler); }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../plugins/story/StoryPlugin.js'), 'utf8'), sandbox, { filename: 'StoryPlugin.js' });

const plugin = sandbox.AGE.StoryPlugin;
function load(dsl) {
  const engine = {};
  plugin.onLoad(engine, dsl);
  return engine;
}

const horror = load({
  meta: { game_type: 'story', title: '迷雾庄园' },
  world: { theme: 'modern_horror' },
  events: []
});
const firstHorrorText = horror._ev.map(event => [event.ch, event.b, event.x, event.q].join(' ')).join(' ');
assert(firstHorrorText.includes('雾中来信'), 'generated horror story must use horror fallback events');
assert(horror._ev.length >= 30, 'generated horror story should provide a long playable route');
assert(!/三国|黄巾|184年|刘备/.test(firstHorrorText), 'generated horror story leaked Three Kingdoms preset');

const custom = load({
  meta: { game_type: 'story', title: '太空电台' },
  events: [{ chapter: '信号', text: '无线电里传来一段求救声。' }, { question: '你要回应吗？', choices: [{ label: '回应', effect: { c: '回应' } }] }]
});
assert.strictEqual(custom._ev[0].ch, '信号');
assert.strictEqual(custom._ev[1].q, '你要回应吗？');
assert(custom._ev.length >= 30, 'short custom story should be expanded without losing its opening');
assert(!custom._ev.map(event => [event.ch, event.b, event.x, event.q].join(' ')).join(' ').includes('黄巾'));

const preset = load(plugin.preset);
const presetText = preset._ev.map(event => event.x || event.q || event.ch || '').join(' ');
assert(presetText.includes('黄巾军'), 'manual Three Kingdoms preset must remain available');

const listenersBeforeCleanupLoad = {keydown: listeners.keydown.size, keyup: listeners.keyup.size};
const cleanupEngine = load(plugin.preset);
assert.strictEqual(listeners.keydown.size, listenersBeforeCleanupLoad.keydown + 1);
assert.strictEqual(listeners.keyup.size, listenersBeforeCleanupLoad.keyup + 1);
plugin.onUnload(cleanupEngine);
assert.strictEqual(listeners.keydown.size, listenersBeforeCleanupLoad.keydown);
assert.strictEqual(listeners.keyup.size, listenersBeforeCleanupLoad.keyup);
assert.strictEqual(cleanupEngine._storyKeydownHandler, null);
assert.strictEqual(cleanupEngine._storyKeyupHandler, null);

console.log('story theme regression tests passed');
