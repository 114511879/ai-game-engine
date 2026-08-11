/** AgentRegistry.js - deterministic expert selection and construction. */
(function(){
var A=window.AGE=window.AGE||{};
var ROLES={
  DesignerAgent:true,
  LevelAgent:true,
  CombatAgent:true,
  StoryAgent:true,
  EconomyAgent:true,
  AssetAgent:true
};

function add(roles,role){if(roles.indexOf(role)<0)roles.push(role);}

A.AgentRegistry=function(options){this.options=options||{};};

A.AgentRegistry.prototype.rolesFor=function(intent){
  intent=intent||{};
  var roles=['DesignerAgent','LevelAgent','CombatAgent'];
  var type=intent.game_type||'',details=intent.details||{};
  if(type==='story'||details.story_mode||details.rpg_growth==='story')add(roles,'StoryAgent');
  if(['rpg','strategy','tower_defense','card','simulation'].indexOf(type)>=0||details.strategy_mode==='economy'||intent.progression&&intent.progression.growth)add(roles,'EconomyAgent');
  var theme=intent.theme&&intent.theme.world;
  if(theme&&theme!=='default'||Array.isArray(intent.reference)&&intent.reference.length)add(roles,'AssetAgent');
  return roles;
};

A.AgentRegistry.prototype.create=function(role,options){
  if(!ROLES[role]||typeof A[role]!=='function')throw new Error('unknown_agent:'+role);
  var merged={},key;
  for(key in this.options)if(this.options.hasOwnProperty(key))merged[key]=this.options[key];
  options=options||{};
  for(key in options)if(options.hasOwnProperty(key))merged[key]=options[key];
  return new A[role](merged);
};
})();
