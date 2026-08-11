/** DSLBinder.js v9.1 — Universal DSL + extensions */
(function(){var A=window.AGE,D=A.DEFAULTS;function sv(v,d){return(typeof v==='string'&&v)?v:d;}
function _hasDK(t){return /boss|地牢|dungeon|魔王|亡灵|暗黑|necromancer/.test(t);}
function _hasStory(t){return /故事|剧情|小说|对话|选择|冒险|文字|视觉小说|avg|三国演义|西游|水浒|红楼/.test(t);}
function _hasRPG(t){return /rpg|角色扮演|装备|经验|等级|升级/.test(t);}
function _detectEra(raw,up){var u=(up||'').toLowerCase();if(/三国|sanguo|桃园|赤壁|孔明|刘备|曹操/.test(u))return'sanguo';if(/唐朝|大唐|tang|太宗|贞观|玄武门/.test(u))return'tang';if(/战国|zhanguo|长平|秦国/.test(u))return'zhanguo';return'';}
function _detectType(raw,up){
  var t=((raw.meta||{}).title||'').toLowerCase(),g=((raw.meta||{}).game_type||'').toLowerCase(),u=(up||'').toLowerCase();
  if(g==='action_rpg'||g==='horror')return'dungeon';
  if(g==='puzzle'||g==='platform')return'platformer';
  if(g==='tower_defense'||g==='card'||g==='simulation'||g==='sandbox'||g==='racing'||g==='strategy')return g;
  // ★ 检测历史时代 → 强烈偏向 story
  var era=_detectEra(raw,up);if(era&&!_hasDK(t)&&!_hasDK(u))return'story';
  if(g==='story'||_hasStory(t)||_hasStory(u))return'story';
  if(g==='rpg'||_hasRPG(t)||(up&&_hasRPG(up.toLowerCase())))return'rpg';
  if(g==='shooter'||/射击|子弹|弹幕|shoot/.test(t))return'shooter';
  if(g==='platformer'||/平台|浮空|jump|跳来跳去/.test(t))return'platformer';
  if(g==='tower_defense'||/塔防|tower_defense/.test(t)||/塔防|tower_defense/.test(u))return'tower_defense';
  if(g==='sandbox'||/沙盒|sandbox/.test(t)||/沙盒|sandbox/.test(u))return'sandbox';
  if(g==='card'||/卡牌|card|deck/.test(t)||/卡牌|card|deck/.test(u))return'card';
  if(g==='simulation'||/模拟经营|经营|simulation|城市建设/.test(t)||/模拟经营|经营|simulation|城市建设/.test(u))return'simulation';
  if(g==='racing'||/赛车|竞速|racing/.test(t)||/赛车|竞速|racing/.test(u))return'racing';
  if(g==='strategy'||/策略|strategy|战棋/.test(t)||/策略|strategy|战棋/.test(u))return'strategy';
  if(g==='dungeon'||_hasDK(t)||_hasDK(u))return'dungeon';
  return'runner';
}
function _fixBoss(raw){raw=raw||{};return{name:sv(raw.name,'亡灵法师'),hp:raw.hp||400,phase:raw.phase||3,theme:sv(raw.theme,'dark'),skills:_fixBS(raw.skills||[])};}
function _fixBS(arr){if(!arr||!arr.length)arr=D.levels[2].boss.skills.slice();var o=[];for(var i=0;i<arr.length;i++){var s=arr[i];if(!s||!s.name)continue;var cd=s.type==='summon'?Math.max(s.cooldown||200,150):(s.cooldown||80);o.push({name:sv(s.name,'技能'+i),type:s.type||'projectile',damage:1,cooldown:cd,speed:s.speed||6,count:s.count||2,summonHp:s.summonHp||2,defense:s.defense||50});}if(o.length===0)o=D.levels[2].boss.skills.slice();return o;}
function _fixLevels(raw,gt,bossCfg,minLevels){
  if(!raw||!raw.length){if(gt==='dungeon')raw=D.levels.slice();else return[];}
  var bossLevel=-1;
  for(var bi=0;bi<raw.length;bi++){
    var candidate=raw[bi];if(!candidate)continue;
    if(candidate.boss){bossLevel=bi;break;}
    var candidateRooms=(candidate.map&&candidate.map.rooms)||[];
    for(var br=0;br<candidateRooms.length;br++)if(candidateRooms[br]&&candidateRooms[br].type==='boss'){bossLevel=bi;break;}
    if(bossLevel===bi)break;
  }
  if(gt==='dungeon'&&bossLevel<0)bossLevel=raw.length-1;
  var inheritedBoss=bossCfg?_fixBoss(bossCfg):null;
  var o=[];for(var i=0;i<raw.length;i++){var lv=raw[i];if(!lv)continue;var map=lv.map||{};map.type=sv(map.type,'dungeon');var rooms=map.rooms||[];for(var j=0;j<rooms.length;j++){if(rooms[j])rooms[j].type=sv(rooms[j].type,'normal');}
    var levelBoss=lv.boss?_fixBoss(lv.boss):(i===bossLevel&&inheritedBoss?_fixBoss(inheritedBoss):null);
    o.push({id:i+1,name:sv(lv.name,'第'+(i+1)+'关'),difficulty:lv.difficulty||(i+1),map:{type:map.type,rooms:rooms},boss:levelBoss});}
  if(o.length===0&&gt==='dungeon')o=D.levels.slice();
  if(minLevels&&o.length<minLevels){
    var finalBoss=-1;
    for(var fi=0;fi<o.length;fi++)if(o[fi]&&o[fi].boss){finalBoss=fi;break;}
    if(finalBoss<0)finalBoss=o.length-1;
    while(o.length<minLevels){
      o.splice(finalBoss,0,{id:0,name:'延伸区域 '+(o.length+1),difficulty:o.length+1,map:{type:'dungeon',rooms:[{type:'enemy',name:'延伸敌区'},{type:'treasure',name:'隐藏补给'}]},boss:null});
      finalBoss++;
    }
    for(var oi=0;oi<o.length;oi++)o[oi].id=oi+1;
  }
  return o;
}

function _ensureLongFlow(dsl){
  var gt=dsl.meta.game_type,r=dsl.rules||{};
  if(gt==='runner')r.win_value=Math.max(Number(r.win_value)||0,180);
  else if(gt==='shooter')r.win_value=Math.max(Number(r.win_value)||0,40);
  else if(gt==='platformer'||gt==='platform')r.win_value=Math.max(Number(r.win_value)||0,150);
  if(gt==='rpg'){dsl.rpg=dsl.rpg||{};dsl.rpg.target_kills=Math.max(Number(dsl.rpg.target_kills)||0,30);}
  if(gt==='strategy'){dsl.strategy=dsl.strategy||{};dsl.strategy.lane_strength=Math.max(Number(dsl.strategy.lane_strength)||0,16);}
  if(gt==='tower_defense'){dsl.tower_defense=dsl.tower_defense||{};dsl.tower_defense.waves=Math.max(Number(dsl.tower_defense.waves)||0,10);dsl.tower_defense.slots=Math.max(Number(dsl.tower_defense.slots)||0,8);}
  if(gt==='card'){dsl.card=dsl.card||{};dsl.card.enemy_hp=Math.max(Number(dsl.card.enemy_hp)||0,120);dsl.card.hand_size=Math.max(Number(dsl.card.hand_size)||0,6);}
  if(gt==='simulation'){dsl.simulation=dsl.simulation||{};dsl.simulation.target_population=Math.max(Number(dsl.simulation.target_population)||0,180);}
  if(gt==='sandbox'){dsl.sandbox=dsl.sandbox||{};dsl.sandbox.target_blocks=Math.max(Number(dsl.sandbox.target_blocks)||0,40);}
  if(gt==='racing'){dsl.racing=dsl.racing||{};dsl.racing.laps=Math.max(Number(dsl.racing.laps)||0,8);dsl.racing.lap_distance=Math.max(Number(dsl.racing.lap_distance)||0,1200);dsl.racing.time_limit=Math.max(Number(dsl.racing.time_limit)||0,180);}
  dsl.rules=r;return dsl;
}
A.DSLBinder={bind:function(raw,userPrompt){
  raw=raw||{};
  // ★ 1. 判定类型
  var gt=_detectType(raw,userPrompt);
  // ★ 2. 构造 universal DSL
  var meta=raw.meta||{};
  // 长提示来自 AI 生成流程，强制与手动预设隔离，避免插件回退到预设内容。
  if(userPrompt&&String(userPrompt).length>20)meta.preset=false;
  meta.game_type=gt;meta.title=sv(meta.title,gt==='dungeon'?'暗黑地牢':gt==='story'?'冒险故事':'冒险');
  var p=raw.player||{};var player={hp:gt==='dungeon'?Math.max(p.hp||8,6):(p.hp||3),speed:p.speed||3,jump_power:p.jump_power||-12,size:p.size||28,max_jump_multiplier:p.max_jump_multiplier||1.5};
  var rules=raw.rules||{};rules.win_condition=sv(rules.win_condition,gt==='dungeon'?'boss_kill':gt==='shooter'?'kill_count':gt==='story'?'story_complete':'survive_time');rules.win_value=rules.win_value||(gt==='dungeon'?1:gt==='story'?0:60);
  var rawSk=raw.skills||[],skills=[];
function _normName(rawName,rawType,idx){var n=(rawName||'').toLowerCase(),t=(rawType||'').toLowerCase();if(n.indexOf('fire')>=0||n.indexOf('火')>=0||n==='fireball')return'fireball';if(n.indexOf('dash')>=0||n.indexOf('冲')>=0||n.indexOf('闪')>=0||n==='dash')return'dash';if(n.indexOf('shield')>=0||n.indexOf('盾')>=0||n.indexOf('护')>=0||n==='shield')return'shield';if(idx===0)return'fireball';if(idx===1)return'dash';if(idx===2)return'shield';if(t==='movement'||t.indexOf('movement')>=0)return'dash';if(t==='defense'||t.indexOf('defense')>=0)return'shield';return'fireball';}
function _normType(rawName,rawType){var nm=rawName.toLowerCase();if(nm.indexOf('fire')>=0||nm.indexOf('火')>=0||nm==='fireball')return'attack';if(nm.indexOf('dash')>=0||nm.indexOf('冲')>=0||nm.indexOf('闪')>=0||nm==='dash')return'movement';if(nm.indexOf('shield')>=0||nm.indexOf('盾')>=0||nm.indexOf('护')>=0||nm==='shield')return'defense';var t=(rawType||'').toLowerCase();if(t==='attack'||t==='movement'||t==='defense')return t;return'attack';}
for(var i=0;i<rawSk.length;i++){var s=rawSk[i];if(!s||!s.name)continue;var nm=_normName(s.name,s.type,i);var st=_normType(nm,s.type);skills.push({name:nm,type:st,cooldown:s.cooldown||50,damage:gt==='dungeon'&&nm==='fireball'?Math.max(Math.min(s.damage||25,50),15):(s.damage||1),speed:s.speed||8,distance:s.distance||80});}
if(gt==='dungeon'&&skills.length<3)skills=[{name:'fireball',type:'attack',cooldown:30,damage:25,speed:10},{name:'dash',type:'movement',cooldown:45,distance:90},{name:'shield',type:'defense',cooldown:80}];
  var w=raw.world||{};var world={gravity:w.gravity||1.0,scroll_speed:w.scroll_speed||5,ground_y:w.ground_y||330,theme:sv(w.theme,'dark')};
  // entities
  var entities=raw.entities||{};
  // ★ story类型不需要敌人
  if(gt==='story'){entities.enemies=[];entities.boss=null;}
  else if(!entities.enemies||!entities.enemies.length){var e=(raw.enemies||[])[0]||{};entities.enemies=[{type:e.type||'spike',speed:e.speed||2,spawn_rate:e.spawn_rate||40,size:e.size||22,hp:e.hp||2}];}
  if(gt==='dungeon'&&!entities.boss&&!raw.boss)entities.boss=_fixBoss(raw.boss||D.levels[2].boss);
  var levels=null;if(gt==='dungeon')levels=_fixLevels(raw.levels||D.levels,gt,entities.boss||raw.boss,6);
  // assets
  var assets=raw.assets||{};if(!assets.characters)assets.characters=D.assets.characters.slice();if(!assets.environments)assets.environments=D.assets.environments.slice();if(!assets.effects)assets.effects=D.assets.effects.slice();if(!assets.weapons)assets.weapons=D.assets.weapons.slice();
  // ★ era检测(历史题材)
  if(!meta.era){var era=_detectEra(raw,userPrompt);if(era)meta.era=era;}
  // ★ 3. 组装 Universal DSL
  var dsl={meta:meta,player:player,rules:rules,skills:skills,world:world,entities:entities,levels:levels,assets:assets,events:raw.events||[]};
  // Keep type-specific design data for plugins that own their full loop.
  var extensionKeys=['rpg','strategy','tower_defense','card','simulation','sandbox','racing','platforms'];
  for(var ex=0;ex<extensionKeys.length;ex++)if(raw[extensionKeys[ex]])dsl[extensionKeys[ex]]=JSON.parse(JSON.stringify(raw[extensionKeys[ex]]));
  dsl=_ensureLongFlow(dsl);
  // ★ 4. 验证 + 注入默认值
  var result=A.DSLValidator.validate(dsl);
  if(!result.valid){console.warn('DSL验证警告:',result.errors);A.setStatus('DSL验证:'+result.errors.join(', '),'error');}
  dsl=A.DSLValidator.applyDefaults(dsl);
  return dsl;
}};})();
