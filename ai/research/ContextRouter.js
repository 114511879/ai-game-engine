/** ContextRouter.js - the only expert-facing RAG caller. */
(function(){
var A=window.AGE=window.AGE||{};

var ROLE_FOCUS={
  DesignerAgent:'核心循环 目标玩家 节奏 可玩性',
  CombatAgent:'战斗手感 技能 敌人 Boss 数值 平衡',
  LevelAgent:'地图 关卡 节奏 教学 探索',
  StoryAgent:'叙事 事件 角色 分支 对话',
  EconomyAgent:'成长 奖励 资源 产出 消耗 平衡',
  AssetAgent:'美术风格 角色 场景 特效 资产'
};

function citation(document){
  var metadata=document&&document.metadata||{};
  return metadata.url||document.title||document.id||'';
}

A.ContextRouter=function(options){
  options=options||{};
  this.client=options.client||A.RAGClient||null;
};

A.ContextRouter.prototype.queryFor=function(intent,role){
  intent=intent||{};
  return[
    intent.game_type||'game',
    intent.theme&&intent.theme.world,
    intent.combat&&intent.combat.style,
    (intent.reference||[]).join(' '),
    ROLE_FOCUS[role]||'游戏设计',
    role
  ].filter(Boolean).join(' ');
};

A.ContextRouter.prototype.route=async function(intent,roles){
  var self=this;
  var pairs=await Promise.all((roles||[]).map(async function(role){
    try{
      if(!self.client||typeof self.client.retrieve!=='function')throw new Error('RAG client unavailable');
      var result=await self.client.retrieve(self.queryFor(intent,role),intent);
      if(!result||result.available===false)throw new Error(result&&result.error||'RAG unavailable');
      var documents=Array.isArray(result.documents)?result.documents:[];
      return[role,A.AgentProtocols.agentContext({
        agent:role,
        documents:documents,
        coverage:result.coverage||0,
        limitations:result.plan&&result.plan.limitations||[],
        citations:documents.map(citation).filter(Boolean),
        offline:false
      })];
    }catch(error){
      return[role,A.AgentProtocols.agentContext({
        agent:role,
        coverage:0,
        limitations:[error.message||String(error)],
        offline:true
      })];
    }
  }));
  var contexts={};
  pairs.forEach(function(pair){contexts[pair[0]]=pair[1];});
  return contexts;
};
})();
