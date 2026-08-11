/** BaseAgent.js - common structured-LLM execution for expert roles. */
(function(){
var A=window.AGE=window.AGE||{};

A.BaseAgent=function(options){
  options=options||{};
  this.name=options.name||'BaseAgent';
  this.systemPrompt=options.systemPrompt||'';
  this.ai=options.ai===undefined?(A.callStructuredAI||null):options.ai;
  this.fallback=options.fallback||function(){return{};};
};

A.BaseAgent.prototype.run=async function(task,context){
  task=task||{};
  context=context||A.AgentProtocols.agentContext({agent:this.name,offline:true});
  var raw=null;
  if(this.ai){
    try{
      raw=await this.ai(
        this.systemPrompt+' 只返回JSON，不生成代码。',
        JSON.stringify({task:task,intent:task.intent||{},context:context}),
        {max_tokens:1200,timeout_ms:30000,errorStatus:this.name+'暂时不可用'}
      );
    }catch(error){raw=null;}
  }
  var usedFallback=!raw;
  if(usedFallback){
    raw={
      proposal:this.fallback(task,context),
      confidence:context.offline?0.3:0.5,
      risks:['使用本地默认提案']
    };
  }
  return A.AgentProtocols.agentProposal({
    task_id:task.task_id,
    agent:this.name,
    status:usedFallback?'fallback':'completed',
    confidence:typeof raw.confidence==='number'?raw.confidence:(context.offline?0.55:0.75),
    proposal:raw.proposal||raw,
    constraints:raw.constraints,
    risks:raw.risks,
    dependencies:raw.dependencies
  });
};

A.defineExpertAgent=function(name,systemPrompt,fallback){
  var Expert=function(options){
    options=options||{};
    A.BaseAgent.call(this,{name:name,ai:options.ai,systemPrompt:systemPrompt,fallback:fallback});
  };
  Expert.prototype=Object.create(A.BaseAgent.prototype);
  Expert.prototype.constructor=Expert;
  A[name]=Expert;
};
})();
