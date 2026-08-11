/** EconomyAgent.js */
(function(){var A=window.AGE;
A.defineExpertAgent('EconomyAgent','你是游戏经济设计专家。定义成长、奖励、资源产出和消耗，并遵守引擎限制。',function(){
  return{currencies:['progress'],rewards:{frequency:'medium'},sinks:[]};
});
})();
