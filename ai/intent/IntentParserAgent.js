/** IntentParserAgent.js - owns Intent DSL extraction and normalization. */
(function(){
var A=window.AGE=window.AGE||{};
var sequence=0;

function copy(value){return JSON.parse(JSON.stringify(value));}
function has(value){return value!==null&&value!==undefined&&value!=='';}
function setIf(target,key,value){if(has(value))target[key]=value;}
function requestId(){sequence++;return'request_'+Date.now()+'_'+sequence;}

function emptyIntent(raw,memory){
  return{
    schema_version:'1.0',
    version:'1.0',
    request_id:requestId(),
    raw_request:raw||'',
    game_type:null,
    theme:{world:null,era:null},
    player:{role:null,ability:null},
    combat:{style:null,difficulty:null,boss_focus:false},
    camera:{view:null},
    emotion:{target:null},
    progression:{growth:false},
    details:{},
    research:{},
    reference:[],
    constraints:[],
    memory_context:[],
    confidence:0
  };
}

function infer(text,memory){
  var t=(text||'').toLowerCase(),i=emptyIntent(text,memory);
  if(/黑神话|西游|中国神话|三国|东方神话|dark chinese/.test(t)){i.theme.world='dark_chinese_myth';i.theme.era='after_journey';}
  else if(/科幻|未来|赛博|太空|sci.?fi/.test(t))i.theme.world='sci_fi';
  else if(/西方魔幻|魔法|奇幻|western fantasy/.test(t))i.theme.world='western_fantasy';
  else if(/恐怖|惊悚|horror|scary/.test(t))i.theme.world='modern_horror';
  if(/恐怖|惊悚|horror/.test(t)){i.game_type='horror';i.emotion.target='horror';}
  else if(/动作|战斗|黑神话|魂|boss|地牢|魔王|亡灵|dungeon/.test(t))i.game_type='action_rpg';
  else if(/rpg|角色扮演|装备|升级|经验/.test(t))i.game_type='rpg';
  else if(/塔防|tower defense/.test(t))i.game_type='tower_defense';
  else if(/卡牌|deck|card/.test(t))i.game_type='card';
  else if(/模拟经营|城市建设|经营|simulation/.test(t))i.game_type='simulation';
  else if(/沙盒|sandbox/.test(t))i.game_type='sandbox';
  else if(/赛车|竞速|racing/.test(t))i.game_type='racing';
  else if(/策略|战棋|strategy/.test(t))i.game_type='strategy';
  else if(/剧情|故事|小说|对话|选择|冒险/.test(t))i.game_type='story';
  else if(/射击|枪|子弹|弹幕|shooter/.test(t))i.game_type='shooter';
  else if(/跑酷|竞速|快节奏/.test(t))i.game_type='runner';
  if(/高难|困难|地狱|hard|受苦|魂系|黑魂/.test(t))i.combat.difficulty='hard';
  else if(/简单|轻松|easy|休闲/.test(t))i.combat.difficulty='easy';
  if(/魂系|黑魂|黑神话|souls/.test(t)){i.combat.style='souls_like';i.reference.push('soulslike');}
  else if(/割草|爽快|无双/.test(t))i.combat.style='power_fantasy';
  else if(/连招|combo/.test(t))i.combat.style='combo';
  if(/boss|魔王|首领/.test(t))i.combat.boss_focus=true;
  if(/第一人称|fps/.test(t))i.camera.view='first_person';
  else if(/黑魂|dark souls/.test(t))i.camera.view='third_person';
  else if(/第三人称|3d动作/.test(t))i.camera.view='third_person';
  else if(/俯视|上帝视角|top.?down/.test(t))i.camera.view='top_down';
  else if(/横版|平台|side.?scroll/.test(t))i.camera.view='side_scroll';
  if(/法师|魔法|法杖/.test(t)){i.player.role='mage';i.player.ability='magic';}
  else if(/武僧|和尚/.test(t)){i.player.role='fallen_monk';i.player.ability='magic_staff';}
  else if(/战士|骑士/.test(t))i.player.role='warrior';
  if(/成长|升级|装备|经验|rpg/.test(t))i.progression.growth=true;
  if(/黑暗|暗黑|压抑|dark|黑魂/.test(t))i.emotion.target='dark';
  else if(/史诗|宏大|epic/.test(t))i.emotion.target='tragic_epic';
  else if(!i.emotion.target)i.emotion.target='exciting';
  return i;
}

function mergeIntent(base,extra){
  if(!extra)return base;
  setIf(base,'game_type',extra.game_type||extra.genre);
  var groups=['theme','player','combat','camera','emotion','progression','details','research'];
  for(var g=0;g<groups.length;g++){
    var name=groups[g],src=extra[name]||{};
    if(!base[name])base[name]={};
    for(var key in src)if(src.hasOwnProperty(key)&&has(src[key]))base[name][key]=src[key];
  }
  if(Array.isArray(extra.reference))base.reference=copy(extra.reference);
  if(Array.isArray(extra.constraints))base.constraints=copy(extra.constraints);
  if(Array.isArray(extra.memory_context))base.memory_context=copy(extra.memory_context);
  if(typeof extra.confidence==='number')base.confidence=extra.confidence;
  return base;
}

function ensureMeta(intent){
  intent=intent||emptyIntent('');
  intent.schema_version='1.0';
  intent.version='1.0';
  intent.request_id=intent.request_id||requestId();
  intent.reference=Array.isArray(intent.reference)?intent.reference:[];
  intent.constraints=Array.isArray(intent.constraints)?intent.constraints:[];
  return intent;
}

function normalize(intent,raw,memory){
  var out=mergeIntent(emptyIntent(raw,memory),intent||{});
  out.request_id=(intent&&intent.request_id)||out.request_id;
  out.raw_request=raw||out.raw_request||'';
  if(!has(out.game_type))out.game_type='runner';
  if(!has(out.combat.difficulty))out.combat.difficulty='normal';
  if(!has(out.camera.view))out.camera.view='side_scroll';
  if(!has(out.theme.world))out.theme.world='default';
  if(!has(out.player.role))out.player.role='hero';
  out.confidence=Math.max(out.confidence||0,0.7);
  return ensureMeta(out);
}

A.IntentParserAgent=function(options){
  options=options||{};
  this.ai=options.ai===undefined?(A.callStructuredAI||null):options.ai;
};

A.IntentParserAgent.local=function(raw,memory){return ensureMeta(infer(raw,memory));};
A.IntentParserAgent.merge=function(base,extra){return ensureMeta(mergeIntent(base,extra));};
A.IntentParserAgent.normalize=function(intent,raw,memory){return normalize(intent,raw,memory);};

A.IntentParserAgent.prototype.parse=async function(raw,options){
  options=options||{};
  var local=A.IntentParserAgent.local(raw,options.memory);
  if(options.lockedIntent)A.IntentParserAgent.merge(local,options.lockedIntent);
  if(!this.ai)return local;
  var parsed=await this.ai(
    '你是Intent Parser Agent。只提取玩家意图并输出Intent DSL JSON，不设计游戏，不提出问题。',
    JSON.stringify({request:raw,answers:options.answers||[],lockedIntent:options.lockedIntent||null}),
    {max_tokens:1000,timeout_ms:20000,errorStatus:'意图解析失败，使用本地结果'}
  );
  if(parsed)A.IntentParserAgent.merge(local,parsed.intent||parsed);
  if(options.lockedIntent)A.IntentParserAgent.merge(local,options.lockedIntent);
  return ensureMeta(local);
};

A.IntentDSL={
  create:A.IntentParserAgent.local,
  normalize:A.IntentParserAgent.normalize,
  question:function(){return null;},
  engineType:function(type){
    var map={action_rpg:'dungeon',horror:'dungeon',puzzle:'platformer',platform:'platformer'};
    return map[type]||type||'runner';
  },
  toGenerationPrompt:function(intent,raw){
    var engineType=this.engineType(intent.game_type);
    return'玩家原始需求:\n'+(raw||intent.raw_request||'')+'\n\n引擎运行类型必须为: '+engineType+'\n\n已确认的Intent DSL:\n'+JSON.stringify(intent,null,2)+'\n\n请严格依据这份Intent DSL生成游戏，不要擅自改变难度、世界观、视角、战斗重点或玩家角色。输出统一游戏DSL JSON，并确保meta.game_type="'+engineType+'"。';
  },
  preferences:function(intent){
    var result=[];
    if(intent.game_type)result.push(intent.game_type);
    if(intent.theme&&intent.theme.world)result.push(intent.theme.world);
    if(intent.combat&&intent.combat.style)result.push(intent.combat.style);
    if(intent.combat&&intent.combat.difficulty)result.push('difficulty:'+intent.combat.difficulty);
    if(intent.combat&&intent.combat.boss_focus)result.push('boss_focus');
    if(intent.camera&&intent.camera.view)result.push('camera:'+intent.camera.view);
    return result;
  }
};
})();
