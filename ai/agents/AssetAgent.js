/** AssetAgent.js */
(function(){var A=window.AGE;
A.defineExpertAgent('AssetAgent','你是美术与资产设计专家。定义风格、角色、环境和特效需求，并遵守引擎限制。',function(task){
  var theme=task.intent&&task.intent.theme&&task.intent.theme.world||'default';
  return{style:theme,characters:[],environments:[],effects:[]};
});
})();
