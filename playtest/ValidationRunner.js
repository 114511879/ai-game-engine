/** ValidationRunner.js v4.0 - paired fixed-holdout Active/Candidate evaluation. */
(function(){
var A=window.AGE=window.AGE||{};
function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}

A.ValidationRunner=function(dependencies){
  dependencies=dependencies||{};
  this.validator=dependencies.validator||new A.PolicyValidator();
  this.runPolicy=dependencies.runPolicy||function(){return{};};
};

A.ValidationRunner.prototype.run=async function(options){
  options=options||{};
  var context={
    holdout:true,
    training_access:false,
    scenarios:copy(options.scenarios||[]),
    seeds:copy(options.seeds||[]),
    profile:options.profile||'bug-hunter-validation-v1',
    holdout_version:options.holdout_version||'fixed_holdout_v1',
    signal:options.signal
  };
  var active=await Promise.resolve(this.runPolicy(options.active_policy,context));
  var candidate=await Promise.resolve(this.runPolicy(options.candidate_policy,context));
  var activeScorecard=active&&active.scorecard?active.scorecard:active||{};
  var candidateScorecard=candidate&&candidate.scorecard?candidate.scorecard:candidate||{};
  var hardGates=options.hard_gates||{schema_compatible:true,reproducibility_hash_match:true,finite_q_values:true,fatal_runtime_regressions:0};
  var decision=this.validator.compare({active_scorecard:activeScorecard,candidate_scorecard:candidateScorecard,hard_gates:hardGates});
  return{
    schema_version:'4.0',
    validation_id:options.validation_id||'policy-validation-'+String(options.holdout_version||'fixed_holdout_v1'),
    profile:context.profile,
    holdout_version:context.holdout_version,
    active_policy:copy(options.active_policy),
    candidate_policy:copy(options.candidate_policy),
    active_scorecard:copy(activeScorecard),
    candidate_scorecard:copy(candidateScorecard),
    proposed_epsilon:this.validator.proposedEpsilon(options.active_policy&&options.active_policy.epsilon),
    hard_gates:copy(hardGates),
    decision:decision
  };
};
})();
