/** CombatAgent.js */
(function(){var A=window.AGE;
A.defineExpertAgent('CombatAgent','你是战斗设计专家。定义战斗、技能、敌人、Boss和基础数值，并遵守引擎限制。',function(task){
  var combat=task.intent&&task.intent.combat||{},hard=combat.difficulty==='hard';
  return{style:combat.style||'action',player_hp:hard?6:8,boss:{phases:3,damage:hard?2:1},skills:['attack','movement','defense']};
});
})();
