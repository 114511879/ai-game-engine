/** AgentProtocols.js - versioned contracts shared by Director 2.0 modules. */
(function(){
var A=window.AGE=window.AGE||{};
var VERSION='1.0';

function copy(value){
  if(value===undefined||value===null)return value;
  return JSON.parse(JSON.stringify(value));
}

function array(value){return Array.isArray(value)?copy(value):[];}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?copy(value):{};}
function number(value,fallback){return typeof value==='number'&&isFinite(value)?value:fallback;}
function unit(value,fallback){return Math.max(0,Math.min(1,number(value,fallback)));}

A.AgentProtocols={
  VERSION:VERSION,

  agentContext:function(input){
    input=input||{};
    return{
      schema_version:VERSION,
      agent:input.agent||'',
      documents:array(input.documents),
      coverage:unit(input.coverage,0),
      limitations:array(input.limitations),
      citations:array(input.citations),
      offline:input.offline===true
    };
  },

  agentProposal:function(input){
    input=input||{};
    return{
      schema_version:VERSION,
      task_id:input.task_id||'',
      agent:input.agent||'',
      status:input.status||'completed',
      confidence:unit(input.confidence,0),
      proposal:object(input.proposal),
      constraints:array(input.constraints),
      risks:array(input.risks),
      dependencies:array(input.dependencies)
    };
  },

  gameBlueprint:function(input){
    input=input||{};
    return{
      schema_version:VERSION,
      request_id:input.request_id||'',
      gameplay:object(input.gameplay),
      world:object(input.world),
      levels:array(input.levels),
      characters:object(input.characters),
      balance:object(input.balance),
      art_direction:object(input.art_direction),
      engine_constraints:array(input.engine_constraints),
      decisions:array(input.decisions),
      agent_trace:array(input.agent_trace)
    };
  },

  evaluationResult:function(input){
    input=input||{};
    var metrics=input.metrics||{};
    return{
      schema_version:VERSION,
      simulation_id:input.simulation_id||'',
      persona:input.persona||'default',
      episodes:Math.max(0,number(input.episodes,0)),
      status:input.status||'completed',
      metrics:{
        play_time:Math.max(0,number(metrics.play_time,0)),
        death_rate:unit(metrics.death_rate,0),
        completion_rate:unit(metrics.completion_rate,0),
        coverage:unit(metrics.coverage,0),
        engagement_proxy:Math.max(0,Math.min(10,number(metrics.engagement_proxy,0)))
      },
      bugs:array(input.bugs),
      reward:number(input.reward,0),
      simulation_deterministic:input.simulation_deterministic===true
    };
  },

  fitnessResult:function(input){
    if(A.FitnessTypes&&typeof A.FitnessTypes.fitnessResult==='function')return A.FitnessTypes.fitnessResult(input||{});
    input=input||{};
    return{
      schema_version:'2.0',
      fitness_id:input.fitness_id||'',
      game_id:input.game_id||'',
      version_id:input.version_id||'',
      profile:input.profile||'default_v2',
      scores:input.scores||{},
      weights:input.weights||{},
      penalties:input.penalties||{critical_bugs:0,soft_failures:0,qa_penalty:0,runtime_penalty:0},
      base_fitness:number(input.base_fitness,0),
      final_fitness:unit(input.final_fitness,0),
      confidence:input.confidence||{overall:0},
      trend:input.trend||{points:0,previous_fitness:null,improvement_delta:null},
      explanations:array(input.explanations)
    };
  },

  validateProposal:function(value){
    var errors=[];
    if(!value||typeof value!=='object')errors.push('proposal_not_object');
    else{
      if(value.schema_version!==VERSION)errors.push('schema_version');
      if(!value.task_id)errors.push('task_id');
      if(!value.agent)errors.push('agent');
      if(!value.proposal||typeof value.proposal!=='object'||Array.isArray(value.proposal))errors.push('proposal');
      if(typeof value.confidence!=='number'||value.confidence<0||value.confidence>1)errors.push('confidence');
      ['constraints','risks','dependencies'].forEach(function(key){
        if(!Array.isArray(value[key]))errors.push(key);
      });
    }
    return{valid:errors.length===0,errors:errors};
  }
};
})();
