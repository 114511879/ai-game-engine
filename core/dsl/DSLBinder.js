/** DSLBinder.js v9.1 — Universal DSL + extensions */
(function(){var A=window.AGE,D=A.DEFAULTS;function sv(v,d){return(typeof v==='string'&&v)?v:d;}
function _hasDK(t){return /boss|地牢|dungeon|魔王|亡灵|暗黑|necromancer/.test(t);}
function _hasStory(t){return /故事|剧情|小说|对话|选择|冒险|文字|视觉小说|avg|三国演义|西游|水浒|红楼/.test(t);}
function _hasRPG(t){return /rpg|角色扮演|装备|经验|等级|升级/.test(t);}
function _detectEra(raw,up){var u=(up||'').toLowerCase();if(/三国|sanguo|桃园|赤壁|孔明|刘备|曹操/.test(u))return'sanguo';if(/唐朝|大唐|tang|太宗|贞观|玄武门/.test(u))return'tang';if(/战国|zhanguo|长平|秦国/.test(u))return'zhanguo';return'';}
function _detectType(raw,up){
  var t=((raw.meta||{}).title||'').toLowerCase(),g=((raw.meta||{}).game_type||'').toLowerCase(),u=(up||'').toLowerCase();
  // ★ 检测历史时代 → 强烈偏向 story
  var era=_detectEra(raw,up);if(era&&!_hasDK(t)&&!_hasDK(u))return'story';
  if(g==='story'||_hasStory(t)||_hasStory(u))return'story';
  if(g==='rpg'||_hasRPG(t)||(up&&_hasRPG(up.toLowerCase())))return'rpg';
  if(g==='shooter'||/射击|子弹|弹幕|shoot/.test(t))return'shooter';
  if(g==='platformer'||/平台|浮空|jump|跳来跳去/.test(t))return'platformer';
  if(g==='tower_defense'||/塔防|tower_defense/.test(t))return'tower_defense';
  if(g==='sandbox'||/沙盒|sandbox/.test(t))return'sandbox';
  if(g==='dungeon'||_hasDK(t)||_hasDK(u))return'dungeon';
  return'runner';
}
function _fixBoss(raw){raw=raw||{};return{name:sv(raw.name,'亡灵法师'),hp:raw.hp||400,phase:raw.phase||3,theme:sv(raw.theme,'dark'),skills:_fixBS(raw.skills||[])};}
function _fixBS(arr){if(!arr||!arr.length)arr=D.levels[2].boss.skills.slice();var o=[];for(var i=0;i<arr.length;i++){var s=arr[i];if(!s||!s.name)continue;var cd=s.type==='summon'?Math.max(s.cooldown||200,150):(s.cooldown||80);o.push({name:sv(s.name,'技能'+i),type:s.type||'projectile',damage:1,cooldown:cd,speed:s.speed||6,count:s.count||2,summonHp:s.summonHp||2,defense:s.defense||50});}if(o.length===0)o=D.levels[2].boss.skills.slice();return o;}
function _fixLevels(raw,gt){
  if(!raw||!raw.length){if(gt==='dungeon')return D.levels.slice();return[];}
  var o=[];for(var i=0;i<raw.length;i++){var lv=raw[i];if(!lv)continue;var map=lv.map||{};map.type=sv(map.type,'dungeon');var rooms=map.rooms||[];for(var j=0;j<rooms.length;j++){if(rooms[j])rooms[j].type=sv(rooms[j].type,'normal');}
    o.push({id:i+1,name:sv(lv.name,'第'+(i+1)+'关'),difficulty:lv.difficulty||(i+1),map:{type:map.type,rooms:rooms},boss:lv.boss?_fixBoss(lv.boss):null});}
  if(o.length===0&&gt==='dungeon')o=D.levels.slice();
  return o;
}
A.DSLBinder={bind:function(raw,userPrompt){
  raw=raw||{};
  // ★ 1. 判定类型
  var gt=_detectType(raw,userPrompt);
  // ★ 2. 构造 universal DSL
  var meta=raw.meta||{};meta.game_type=gt;meta.title=sv(meta.title,gt==='dungeon'?'暗黑地牢':gt==='story'?'冒险故事':'冒险');
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
  var levels=null;if(gt==='dungeon')levels=_fixLevels(raw.levels||D.levels,gt);
  // assets
  var assets=raw.assets||{};if(!assets.characters)assets.characters=D.assets.characters.slice();if(!assets.environments)assets.environments=D.assets.environments.slice();if(!assets.effects)assets.effects=D.assets.effects.slice();if(!assets.weapons)assets.weapons=D.assets.weapons.slice();
  // ★ era检测(历史题材)
  if(!meta.era){var era=_detectEra(raw,userPrompt);if(era)meta.era=era;}
  // ★ 3. 组装 Universal DSL
  var dsl={meta:meta,player:player,rules:rules,skills:skills,world:world,entities:entities,levels:levels,assets:assets,events:raw.events||[]};
  // ★ 4. 验证 + 注入默认值
  var result=A.DSLValidator.validate(dsl);
  if(!result.valid){console.warn('DSL验证警告:',result.errors);A.setStatus('DSL验证:'+result.errors.join(', '),'error');}
  dsl=A.DSLValidator.applyDefaults(dsl);
  return dsl;
}};})();
