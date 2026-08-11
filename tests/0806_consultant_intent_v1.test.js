const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = {console, JSON, Math, Date, setTimeout, clearTimeout};
sandbox.window = sandbox;
sandbox.AGE = {};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
}

load('ai/intent/IntentParserAgent.js');
load('ai/consultant/GameConsultant.js');
load('ai/director/GameDirector.js');

async function run() {
  const A = sandbox.AGE;
  const horror = new A.GameConsultant();
  let state = await horror.begin('我想做一个恐怖游戏');
  assert.strictEqual(state.ready, false);
  assert.strictEqual(state.questionId, 'horror_style');

  state = await horror.answer('monster_chase');
  assert.strictEqual(state.questionId, 'difficulty');
  state = await horror.answer('hard');
  assert.strictEqual(state.questionId, 'camera');
  state = await horror.answer('first_person');
  assert.strictEqual(state.ready, true);

  const horrorIntent = horror.confirm().intent;
  assert.strictEqual(horrorIntent.schema_version, '1.0');
  assert(/^request_/.test(horrorIntent.request_id));
  assert.strictEqual(horrorIntent.game_type, 'horror');
  assert.strictEqual(horrorIntent.combat.style, 'survival_action');
  assert.strictEqual(horrorIntent.combat.difficulty, 'hard');
  assert.strictEqual(horrorIntent.camera.view, 'first_person');

  const prompt = A.IntentDSL.toGenerationPrompt(horrorIntent, '我想做一个恐怖游戏');
  assert(prompt.includes('已确认的Intent DSL'));
  assert(prompt.includes('meta.game_type="dungeon"'));

  const myth = new A.GameConsultant();
  state = await myth.begin('做一个像黑神话的动作游戏，重点是Boss战');
  assert.strictEqual(state.questionId, 'difficulty');
  state = await myth.answer('hard');
  state = await myth.answer('third_person');
  const mythIntent = myth.confirm().intent;
  assert.strictEqual(mythIntent.game_type, 'action_rpg');
  assert.strictEqual(mythIntent.theme.world, 'dark_chinese_myth');
  assert.strictEqual(A.IntentDSL.engineType(mythIntent.game_type), 'dungeon');

  const director = new A.GameDirector();
  const directorIntent = director.analyzeIntentDSL(mythIntent);
  assert.strictEqual(directorIntent.genre, 'dungeon');
  assert.strictEqual(directorIntent.difficulty, 'hard');
  assert.strictEqual(directorIntent.playerType, 'hardcore');

  const skipped = new A.GameConsultant();
  await skipped.begin('生成一个新游戏');
  const skippedIntent = skipped.skip().intent;
  assert.strictEqual(skippedIntent.game_type, 'runner');
  assert.strictEqual(skippedIntent.combat.difficulty, 'normal');

  const soulsIntent = A.IntentParserAgent.local('我要一个类似黑魂的游戏');
  assert.strictEqual(soulsIntent.game_type, 'action_rpg');
  assert.strictEqual(soulsIntent.combat.style, 'souls_like');
  assert.strictEqual(soulsIntent.combat.difficulty, 'hard');
  assert.strictEqual(soulsIntent.camera.view, 'third_person');
  assert.strictEqual(soulsIntent.emotion.target, 'dark');
  assert(soulsIntent.reference.includes('soulslike'));

  let parserCalls = 0;
  const parser = {
    async parse(raw) {
      parserCalls++;
      return A.IntentParserAgent.normalize(A.IntentParserAgent.local(raw), raw);
    }
  };
  const delegated = new A.GameConsultant({parser});
  await delegated.begin('生成一个跑酷游戏');
  assert.strictEqual(parserCalls, 1, 'GameConsultant must delegate parsing to IntentParserAgent');

  const typeCases=[
    ['做一个塔防游戏','tower_defense'],['制作卡牌对战','card'],['模拟经营一座城市','simulation'],
    ['开放沙盒建造','sandbox'],['赛车竞速游戏','racing'],['三线策略战棋','strategy'],['角色扮演升级装备','rpg']
  ];
  for(const pair of typeCases){
    const consultant=new A.GameConsultant();
    const typeState=await consultant.begin(pair[0]);
    assert.strictEqual(typeState.intent.game_type,pair[1],pair[0]);
  }

  const seeded=new A.GameConsultant({seedIntent:{game_type:'tower_defense'}});
  let seededState=await seeded.begin('制作一个塔防游戏');
  assert.strictEqual(seededState.questionId,'tower_layout');
  seededState=await seeded.answer('我后来又提到了卡牌');
  assert.strictEqual(seededState.intent.game_type,'tower_defense');

  const seedQuestions={runner:'runner_goal',shooter:'shooter_mode',platformer:'platform_goal',dungeon:'dungeon_goal',story:'story_mode',rpg:'rpg_growth',strategy:'strategy_mode',tower_defense:'tower_layout',card:'card_system',simulation:'simulation_goal',sandbox:'sandbox_goal',racing:'racing_mode'};
  for(const type in seedQuestions){
    const seededConsultant=new A.GameConsultant({seedIntent:{game_type:type}});
    const seededResult=await seededConsultant.begin('制作一个游戏');
    assert.strictEqual(seededResult.intent.game_type,type);
    assert.strictEqual(seededResult.questionId,seedQuestions[type]);
  }

  console.log('consultant intent tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
