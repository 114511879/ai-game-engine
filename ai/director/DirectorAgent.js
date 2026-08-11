/** DirectorAgent.js - parallel expert orchestration and blueprint synthesis. */
(function(){
var A=window.AGE=window.AGE||{};

function now(){return Date.now();}

function taskFor(role,index,intent,userPrompt){
  var expertIntent=JSON.parse(JSON.stringify(intent||{}));
  delete expertIntent.research;
  return{
    task_id:role.toLowerCase()+'-'+(index+1),
    role:role,
    objective:'为已确认Intent设计'+role,
    intent:expertIntent,
    user_prompt:userPrompt||''
  };
}

function fallbackProposal(role,task,error){
  return A.AgentProtocols.agentProposal({
    task_id:task.task_id,
    agent:role,
    status:'fallback',
    confidence:0.25,
    proposal:{},
    risks:[error&&error.message||String(error||'invalid_agent_output')]
  });
}

A.DirectorAgent=function(options){
  options=options||{};
  this.registry=options.registry||new A.AgentRegistry();
  this.router=options.router||new A.ContextRouter();
  this.preqa=options.preqa||new A.PreQAValidator();
  this.constraints=options.constraints||new A.ConstraintEngine();
  this.ai=options.ai===undefined?(A.callStructuredAI||null):options.ai;
  this.onStatus=options.onStatus||function(){};
};

A.DirectorAgent.prototype.design=async function(intent,userPrompt){
  if(!intent||intent.schema_version!=='1.0')return{success:false,error:'confirmed_intent_required'};
  var trace=[],roles=this.registry.rolesFor(intent),started=now(),self=this;

  this.onStatus('context','按角色检索设计知识...');
  var contexts=await this.router.route(intent,roles);
  trace.push({
    stage:'context',
    status:'completed',
    elapsed_ms:now()-started,
    warnings:roles.filter(function(role){return contexts[role]&&contexts[role].offline;})
  });

  this.onStatus('experts','专家Agent并行设计...');
  started=now();
  var tasks=roles.map(function(role,index){return taskFor(role,index,intent,userPrompt);});
  var settled=await Promise.allSettled(roles.map(function(role,index){
    return self.registry.create(role).run(tasks[index],contexts[role]);
  }));
  var proposals=settled.map(function(item,index){
    if(item.status==='fulfilled'&&A.AgentProtocols.validateProposal(item.value).valid)return item.value;
    return fallbackProposal(roles[index],tasks[index],item.reason);
  });
  var fallbackRoles=proposals.filter(function(proposal){return proposal.status==='fallback';}).map(function(proposal){return proposal.agent;});
  trace.push({stage:'experts',status:fallbackRoles.length===roles.length?'failed':'completed',elapsed_ms:now()-started,warnings:fallbackRoles});
  if(fallbackRoles.length===roles.length){
    return{success:false,error:'all_experts_failed',contexts:contexts,proposals:proposals,trace:trace};
  }

  this.onStatus('preqa','执行Pre-QA和确定性规则...');
  started=now();
  var preqa=this.preqa.validate(proposals);
  var constraints=this.constraints.evaluate(intent,proposals);
  trace.push({stage:'preqa',status:preqa.status,elapsed_ms:now()-started,warnings:preqa.findings.map(function(finding){return finding.code;})});
  if(preqa.status==='blocked'){
    return{success:false,error:'preqa_blocked',contexts:contexts,proposals:proposals,preqa:preqa,constraints:constraints,trace:trace};
  }

  this.onStatus('synthesis','Director综合Game Blueprint...');
  started=now();
  var blueprint=await this.synthesize(intent,proposals,preqa,constraints);
  trace.push({stage:'synthesis',status:'completed',elapsed_ms:now()-started,warnings:[]});

  return{
    success:true,
    intent:intent,
    contexts:contexts,
    proposals:proposals,
    preqa:preqa,
    constraints:constraints,
    blueprint:blueprint,
    trace:trace
  };
};

A.DirectorAgent.prototype.synthesize=async function(intent,proposals,preqa,constraints){
  if(this.ai){
    try{
      var raw=await this.ai(
        '你是Game Director Agent。依据专家提案和不可覆盖的规则输出Game Blueprint JSON。硬规则必须落实，不能删除。',
        JSON.stringify({intent:intent,proposals:proposals,preqa:preqa,constraint_decisions:constraints.decisions}),
        {max_tokens:1800,timeout_ms:30000,errorStatus:'导演综合失败，使用确定性蓝图'}
      );
      if(raw){
        raw=raw.blueprint||raw;
        if(raw.gameplay&&raw.world)return this.normalizeBlueprint(intent,raw,proposals,constraints);
      }
    }catch(error){}
  }
  return this.deterministicBlueprint(intent,proposals,constraints);
};

A.DirectorAgent.prototype.normalizeBlueprint=function(intent,raw,proposals,constraints){
  var blueprint=A.AgentProtocols.gameBlueprint({
    request_id:intent.request_id,
    gameplay:raw.gameplay,
    world:raw.world,
    levels:raw.levels,
    characters:raw.characters,
    balance:raw.balance,
    art_direction:raw.art_direction,
    engine_constraints:constraints.decisions,
    decisions:raw.decisions||constraints.decisions,
    agent_trace:proposals.map(function(proposal){
      return{agent:proposal.agent,task_id:proposal.task_id,confidence:proposal.confidence,status:proposal.status};
    })
  });
  this.applyDecisions(blueprint,constraints.decisions);
  return blueprint;
};

A.DirectorAgent.prototype.deterministicBlueprint=function(intent,proposals,constraints){
  var byRole={};
  proposals.forEach(function(proposal){byRole[proposal.agent]=proposal.proposal;});
  return this.normalizeBlueprint(intent,{
    gameplay:byRole.DesignerAgent||{},
    world:{theme:intent.theme&&intent.theme.world||'default'},
    levels:byRole.LevelAgent&&byRole.LevelAgent.levels||[],
    characters:byRole.StoryAgent&&byRole.StoryAgent.characters||{},
    balance:{combat:byRole.CombatAgent||{},economy:byRole.EconomyAgent||{}},
    art_direction:byRole.AssetAgent||{},
    decisions:constraints.decisions
  },proposals,constraints);
};

A.DirectorAgent.prototype.applyDecisions=function(blueprint,decisions){
  (decisions||[]).forEach(function(decision){
    if(decision.action!=='set'&&decision.action!=='cap')return;
    var path=decision.path;
    if(path.indexOf('combat.')===0)path='balance.'+path;
    var keys=path.split('.'),target=blueprint;
    for(var i=0;i<keys.length-1;i++){
      if(!target[keys[i]]||typeof target[keys[i]]!=='object')target[keys[i]]={};
      target=target[keys[i]];
    }
    target[keys[keys.length-1]]=decision.value;
  });
};
})();
