/** PolicyPromoter.js v4.0 - sole transactional Policy activation entry point. */
(function(){
var A=window.AGE=window.AGE||{};
function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}

A.PolicyPromoter=function(dependencies){
  dependencies=dependencies||{};
  this.store=dependencies.store;
  this.trainingMemory=dependencies.trainingMemory;
  this.idFactory=dependencies.idFactory||function(){return'pt-v4-'+Date.now();};
};

A.PolicyPromoter.prototype.promote=async function(input){
  input=input||{};
  var candidate=copy(input.candidate||{});
  var validation=input.validation||{};
  var training=copy(input.training_run||{});
  try{
    if(validation.status==='no_improvement'){
      if(this.trainingMemory)this.trainingMemory.append(Object.assign(training,{promotion:{status:'no_improvement',reason:validation.reason||'validation_scorecard_equal'}}));
      if(this.store&&typeof this.store.clearCandidate==='function')this.store.clearCandidate();
      return{status:'no_improvement',reason:validation.reason||'validation_scorecard_equal'};
    }
    if(validation.status!=='promotion_eligible'){
      var rejected=Object.assign({},candidate,{status:'rejected',reason:validation.reason||'validation_rejected',validation:copy(validation)});
      if(this.store)this.store.saveRejectedMetadata(rejected);
      if(this.trainingMemory)this.trainingMemory.append(Object.assign(training,{promotion:{status:'rejected',reason:rejected.reason}}));
      return{status:'rejected',reason:rejected.reason};
    }
    var before=this.store.begin();
    try{
      candidate.policy_version=this.idFactory();
      candidate.status='candidate';
      candidate.parent_version=before.current_active&&before.current_active.policy_version||candidate.parent_version||null;
      this.store.verifyPolicy(candidate);
      this.store.stageCandidate(candidate);
      if(this.trainingMemory)this.trainingMemory.append(Object.assign(training,{promotion:{status:'pending',policy_version:candidate.policy_version}}));
      var promoted=this.store.commitPromotion(candidate);
      if(this.trainingMemory)this.trainingMemory.append(Object.assign({},training,{training_run_id:(training.training_run_id||'')+':promotion',promotion:{status:'promoted',policy_version:promoted.policy_version}}));
      return{status:'promoted',policy_version:promoted.policy_version,policy:promoted};
    }catch(error){
      this.store.rollback(before);
      throw error;
    }
  }catch(error){
    return{status:'failed',reason:error.code||error.message||'promotion_failed'};
  }
};
})();
