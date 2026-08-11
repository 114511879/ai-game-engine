const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const errors=[];
const sandbox={Date,JSON,Math,setTimeout,clearTimeout,console:{log:()=>{},warn:()=>{},error:(...args)=>errors.push(args.join(' '))}};
sandbox.window=sandbox;
sandbox.document={addEventListener(){},getElementById(){return null;}};
vm.createContext(sandbox);
function load(file){vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox,{filename:file});}
[
 'core/dsl/Config.js','core/engine/GameStandard.js','core/engine/GameState.js','core/runtime/helpers.js','core/runtime/Collision.js','core/runtime/Enemy.js','core/runtime/Powerup.js','core/runtime/Particle.js','core/runtime/Player.js','core/runtime/Physics.js','core/runtime/Spawner.js','core/runtime/Renderer.js','core/dsl/Rules.js','core/dsl/PhaseManager.js','core/dsl/SkillEngine.js','core/dsl/LevelManager.js','core/dsl/MapSystem.js','core/dsl/AssetSystem.js','core/dsl/BossSystem.js','core/dsl/SkillSystem.js','core/dsl/DSLBinder.js','core/dsl/PluginSelector.js','plugins/common/PluginTools.js','plugins/runner/RunnerPlugin.js','plugins/shooter/ShooterPlugin.js','plugins/rpg/PlatformPlugin.js','plugins/rpg/DungeonPlugin.js','plugins/story/StoryPlugin.js','plugins/rpg/RPGPlugin.js','plugins/strategy/StrategyPlugin.js','plugins/tower_defense/TowerDefensePlugin.js','plugins/card/CardPlugin.js','plugins/simulation/SimulationPlugin.js','plugins/sandbox/SandboxPlugin.js','plugins/racing/RacingPlugin.js','core/engine/Engine.js'
].forEach(load);

function ctx(){
  const gradient={addColorStop(){}};
  return new Proxy({}, {get(target,key){if(key==='createLinearGradient')return()=>gradient;if(key==='measureText')return()=>({width:0});if(!(key in target))target[key]=()=>{};return target[key];},set(target,key,value){target[key]=value;return true;}});
}
const canvas={width:800,height:400,getContext:ctx};
const A=sandbox.AGE;
const plugins=[A.RunnerPlugin,A.ShooterPlugin,A.PlatformPlugin,A.DungeonPlugin,A.StoryPlugin,A.RPGPlugin,A.StrategyPlugin,A.TowerDefensePlugin,A.CardPlugin,A.SimulationPlugin,A.SandboxPlugin,A.RacingPlugin];
assert.strictEqual(plugins.length,12);
const names=plugins.map(p=>p.name);
assert.strictEqual(new Set(names).size,12);

for(const plugin of plugins){
  errors.length=0;
  const engine=new A.GameEngine(canvas);
  const dsl=A.DSLBinder.bind(plugin.preset,plugin.name);
  const selected=A.PluginSelector.select(dsl.meta.game_type,{get(name){return plugins.find(p=>p.name===name)||null;}});
  assert(selected,'plugin selector failed for '+plugin.name);
  engine.load(dsl,selected);
  A.setGameState(A.STATE.RUNNING);
  const limit=plugin.ownsLoop?5000:120;
  for(let frame=0;frame<limit&&!engine._win&&!engine.gameOver;frame++){
    if(plugin.aiStep)plugin.aiStep(engine);
    engine.update();
    engine.render();
  }
  if(plugin.ownsLoop)assert(engine.score>0,'plugin did not advance: '+plugin.name);
  if(plugin.ownsLoop)assert(engine._win||engine.gameOver,'plugin has no terminal state: '+plugin.name);
  assert.strictEqual(errors.length,0,plugin.name+' runtime errors: '+errors.join('\n'));

  const longDsl=A.DSLBinder.bind(JSON.parse(JSON.stringify(plugin.preset)), '玩家原始需求：请生成一款长流程 '+plugin.name+' 游戏');
  if(plugin.name==='runner')assert(longDsl.rules.win_value>=180);
  if(plugin.name==='shooter')assert(longDsl.rules.win_value>=40);
  if(plugin.name==='platform')assert(longDsl.rules.win_value>=150);
  if(plugin.name==='dungeon')assert(longDsl.levels.length>=6);
  if(plugin.name==='rpg')assert(longDsl.rpg.target_kills>=30);
  if(plugin.name==='strategy')assert(longDsl.strategy.lane_strength>=16);
  if(plugin.name==='tower_defense')assert(longDsl.tower_defense.waves>=10);
  if(plugin.name==='card')assert(longDsl.card.enemy_hp>=120);
  if(plugin.name==='simulation')assert(longDsl.simulation.target_population>=180);
  if(plugin.name==='sandbox')assert(longDsl.sandbox.target_blocks>=40);
  if(plugin.name==='racing')assert(longDsl.racing.laps>=8);
}
console.log('12 game types tests passed');
