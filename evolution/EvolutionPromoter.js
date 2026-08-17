/** EvolutionPromoter.js v3.0 - transactional experimental winner promotion. */
(function(){
var A=window.AGE=window.AGE||{};

function errorData(error){
  return error?{name:error.name||'Error',message:error.message||String(error),code:error.code||''}:null;
}

function candidates(input){
  var rows=[];
  if(input.winner)rows.push(input.winner);
  if(Array.isArray(input.ranked_candidates))rows=rows.concat(input.ranked_candidates);
  var seen={};
  return rows.filter(function(candidate){
    if(!candidate||!candidate.dsl)return false;
    var key=String(candidate.candidate_id||rows.indexOf(candidate));
    if(seen[key])return false;
    seen[key]=true;
    return true;
  });
}

A.EvolutionPromoter=function(dependencies){
  dependencies=dependencies||{};
  this.finalQA=dependencies.finalQA;
  this.engine=dependencies.engine;
  this.store=dependencies.store;
  this.idFactory=dependencies.idFactory;
};

A.EvolutionPromoter.prototype._recoverBaseline=async function(baseline){
  if(this.engine&&typeof this.engine.teardown==='function')await this.engine.teardown();
  if(this.engine&&typeof this.engine.reset==='function')await this.engine.reset();
  if(this.engine&&typeof this.engine.load==='function')await this.engine.load(baseline.dsl);
};

A.EvolutionPromoter.prototype.promote=async function(input){
  input=input||{};
  var baseline=input.baseline;
  if(!baseline||!baseline.dsl||!baseline.version_id){
    return{status:'failed',reason:'baseline_required'};
  }
  var ranked=candidates(input);
  var selected=null;
  var selectedQA=null;
  try{
    for(var index=0;index<ranked.length;index++){
      var qa=await Promise.resolve(this.finalQA.validate(ranked[index].dsl,input.intent,input.blueprint));
      if(qa&&qa.admitted===true){selected=ranked[index];selectedQA=qa;break;}
    }
  }catch(qaError){
    return{status:'failed',reason:'final_qa_failed',error:errorData(qaError)};
  }
  if(!selected)return{status:'rejected',reason:'winner_qa_rejected'};

  var snapshot=null;
  var began=false;
  var stage='prepare';
  try{
    var promotedVersionId=await Promise.resolve(this.idFactory({
      game_id:input.game_id||selected.dsl&&selected.dsl.meta&&selected.dsl.meta.game_id||'',
      baseline_version:baseline.version_id,
      candidate_id:selected.candidate_id
    }));
    if(!promotedVersionId)throw new Error('promoted_version_id_required');
    stage='begin';
    snapshot=await Promise.resolve(this.store.begin());
    began=true;
    stage='engine_load';
    await Promise.resolve(this.engine.load(selected.dsl));
    stage='commit';
    await Promise.resolve(this.store.commit({
      promoted_version_id:String(promotedVersionId),
      candidate_id:selected.candidate_id,
      run_id:input.run_id||'',
      game_id:input.game_id||selected.dsl&&selected.dsl.meta&&selected.dsl.meta.game_id||'',
      dsl:selected.dsl,
      parent_version:baseline.version_id,
      evaluation:selected.evaluation,
      fitness:selected.fitness_result,
      persona:selected.evaluation&&selected.evaluation.persona||'new_player',
      changes:selected.changes||[],
      qa:selectedQA
    }));
    return{
      status:'promoted',
      promoted_version_id:String(promotedVersionId),
      candidate_id:selected.candidate_id,
      dsl:selected.dsl,
      evaluation:selected.evaluation,
      fitness_result:selected.fitness_result,
      qa:selectedQA
    };
  }catch(error){
    var rollbackError=null;
    if(began&&this.store&&typeof this.store.rollback==='function'){
      try{await Promise.resolve(this.store.rollback(snapshot));}catch(caughtRollback){rollbackError=caughtRollback;}
    }
    try{await this._recoverBaseline(baseline);}catch(recoveryError){rollbackError=rollbackError||recoveryError;}
    return{
      status:'failed',
      reason:stage==='engine_load'?'engine_load_failed':stage==='commit'?'promotion_commit_failed':'promotion_prepare_failed',
      error:errorData(error),
      rollback_error:errorData(rollbackError)
    };
  }
};
})();
