const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const store = {};
const storage = {
  getItem(key){return Object.prototype.hasOwnProperty.call(store,key)?store[key]:null;},
  setItem(key,value){store[key]=value;},
  removeItem(key){delete store[key];}
};
const sandbox = {console, JSON, Math, Date};
sandbox.window = sandbox;
sandbox.localStorage = storage;
sandbox.AGE = {};
vm.createContext(sandbox);

function load(file){
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox,{filename:file});
}

load('ai/consultant/PlayerMemory.js');
load('ai/intent/IntentParserAgent.js');
load('ai/consultant/GameConsultant.js');

(async function(){
  const A=sandbox.AGE;
  let now=1000;
  const memory=new A.PlayerPreferenceMemory(storage,'test_memory',()=>now);
  const souls={game_type:'action_rpg',theme:{world:'dark_chinese_myth'},combat:{style:'souls_like',difficulty:'hard',boss_focus:true},camera:{view:'third_person'}};
  memory.remember(souls);
  now+=1000;
  memory.remember(souls);
  memory.remember({game_type:'runner',theme:{world:'sci_fi'},combat:{style:'power_fantasy',difficulty:'easy'},camera:{view:'side_scroll'}});

  const context=memory.context();
  const type=context.find(item=>item.category==='game_type');
  assert(type);
  assert.strictEqual(type.value,'action_rpg');
  assert.strictEqual(type.count,2);
  assert(type.confidence>=0.6);
  assert.strictEqual(memory.count(),11);

  const consultant=new A.GameConsultant({memory:context});
  let state=await consultant.begin('生成一个新游戏');
  assert.strictEqual(state.intent.game_type,null);
  assert.strictEqual(state.intent.memory_context.length,0);
  state=consultant.applyMemory();
  assert.strictEqual(state.intent.game_type,'action_rpg');
  assert.strictEqual(state.intent.combat.difficulty,'hard');
  assert.strictEqual(state.intent.theme.world,'dark_chinese_myth');
  assert(state.intent.memory_context.length>0);

  const explicit=new A.GameConsultant({memory:context});
  await explicit.begin('我想做一个简单的科幻游戏');
  const explicitState=explicit.applyMemory();
  assert.strictEqual(explicitState.intent.combat.difficulty,'easy');
  assert.strictEqual(explicitState.intent.theme.world,'sci_fi');

  memory.remove('game_type','runner');
  assert(!memory.all().some(item=>item.category==='game_type'&&item.value==='runner'));
  memory.clear();
  assert.strictEqual(memory.count(),0);
  console.log('player memory tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
