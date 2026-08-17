/** OptimizationSchemaBuilder.js v3.0 - deterministic legacy DSL safe templates. */
(function(){
var A=window.AGE=window.AGE||{};
var P=A.EvolutionProtocols;

var COMMON=[
  {name:'player_hp',path:'player.hp',type:'integer',range:[3,16],step:1,mutation_rate:0.10,importance:'high'},
  {name:'player_speed',path:'player.speed',type:'number',range:[1,8],step:0.5,mutation_rate:0.15,importance:'medium'},
  {name:'jump_power',path:'player.jump_power',type:'number',range:[-20,-6],step:1,mutation_rate:0.10,importance:'medium'},
  {name:'gravity',path:'world.gravity',type:'number',range:[0.5,2],step:0.1,mutation_rate:0.10,importance:'medium'},
  {name:'scroll_speed',path:'world.scroll_speed',type:'number',range:[1,10],step:0.5,mutation_rate:0.15,importance:'medium'},
  {name:'enemy_spawn_rate',path:'entities.enemies.0.spawn_rate',type:'integer',range:[20,80],step:5,mutation_rate:0.20,importance:'high'},
  {name:'primary_skill_cooldown',path:'skills.0.cooldown',type:'integer',range:[10,120],step:5,mutation_rate:0.15,importance:'medium'}
];

var TYPE_SPECIFIC={
  rpg:[{name:'rpg_enemy_hp',path:'rpg.enemy_hp',type:'integer',range:[1,100],step:1,mutation_rate:0.15,importance:'high'}],
  tower_defense:[{name:'tower_waves',path:'tower_defense.waves',type:'integer',range:[1,20],step:1,mutation_rate:0.15,importance:'high'}],
  card:[{name:'card_enemy_hp',path:'card.enemy_hp',type:'integer',range:[1,100],step:1,mutation_rate:0.15,importance:'high'}],
  simulation:[{name:'target_population',path:'simulation.target_population',type:'integer',range:[10,1000],step:10,mutation_rate:0.15,importance:'medium'}],
  racing:[{name:'racing_time_limit',path:'racing.time_limit',type:'integer',range:[30,600],step:5,mutation_rate:0.15,importance:'high'}]
};

function build(baseline,options){
  options=options||{};
  var gameType=P.getPath(baseline,'meta.game_type')||'runner';
  var templates=COMMON.concat(TYPE_SPECIFIC[gameType]||[]);
  var variables=templates.filter(function(template){
    return P.getPath(baseline,template.path)!==undefined;
  }).map(P.copy);
  return{
    target:'maximize_final_fitness',
    profile:options.profile||'default_ga_v3',
    max_mutated_variables:5,
    builder_version:'3.0',
    engine_capability_version:options.engine_capability_version||'1.0',
    immutable:['meta.game_id','meta.engine_version','assets'],
    variables:variables
  };
}

A.OptimizationSchemaBuilder={build:build};
})();
