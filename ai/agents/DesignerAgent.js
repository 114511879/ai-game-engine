/** DesignerAgent.js */
(function(){var A=window.AGE;
A.defineExpertAgent('DesignerAgent','你是核心玩法设计专家。定义目标玩家、核心循环和节奏，并遵守引擎限制。',function(task){
  var intent=task.intent||{};
  return{core_loop:['explore','challenge','reward','progress'],target_player:intent.player&&intent.player.role||'general',pace:intent.combat&&intent.combat.style==='combo'?'fast':'medium'};
});
})();
