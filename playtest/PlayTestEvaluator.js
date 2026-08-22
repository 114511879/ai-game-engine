/** PlayTestEvaluator.js v4.0 - isolated optional Bug Hunter evaluation session. */
(function(){
var A=window.AGE=window.AGE||{};
function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
function cancelled(signal){return signal&&signal.aborted;}

A.PlayTestEvaluator=function(dependencies){
  dependencies=dependencies||{};
  this.engineAdapter=dependencies.engineAdapter;
  this.episodeRunner=dependencies.episodeRunner||async function(){return{status:'completed',episodes:0,findings:[],reward_ledger:{entries:[]},replay_results:[]};};
};

A.PlayTestEvaluator.prototype.evaluate=async function(candidateDSL,options){
  options=options||{};
  var signal=options.signal;
  var base={
    enabled:true,
    status:'incomplete',
    candidate_id:options.candidate_id||'',
    policy_version:options.policy_snapshot&&options.policy_snapshot.policy_version||'',
    policy_hash:options.policy_snapshot&&options.policy_snapshot.policy_hash||'',
    findings:[],
    reward_ledger:{entries:[]},
    replay_results:[],
    episodes:0
  };
  if(cancelled(signal))return Object.assign(base,{status:'cancelled',reason:'cancelled_before_playtest'});
  try{
    await this.engineAdapter.reset();
    if(cancelled(signal))return Object.assign(base,{status:'cancelled',reason:'cancelled_before_playtest'});
    await this.engineAdapter.load(candidateDSL);
    await this.engineAdapter.releaseAllInputs();
    if(cancelled(signal))return Object.assign(base,{status:'cancelled',reason:'cancelled_before_episode'});
    var result=await this.episodeRunner(this.engineAdapter.engine||this.engineAdapter,Object.assign({},options,{candidate_dsl:candidateDSL}));
    result=result&&typeof result==='object'?result:{};
    return Object.assign(base,copy(result),{
      enabled:true,
      candidate_id:options.candidate_id||base.candidate_id,
      policy_version:options.policy_snapshot&&options.policy_snapshot.policy_version||base.policy_version,
      policy_hash:options.policy_snapshot&&options.policy_snapshot.policy_hash||base.policy_hash
    });
  }catch(error){
    return Object.assign(base,{status:cancelled(signal)?'cancelled':'incomplete',reason:error.code||error.message||'playtest_failed'});
  }finally{
    try{await this.engineAdapter.teardown();}catch(error){}
    try{await this.engineAdapter.reset();}catch(error){}
  }
};
})();
