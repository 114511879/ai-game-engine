/** PolicyValidator.js v4.0 - pure Policy scorecard and Promotion gate. */
(function(){
var A=window.AGE=window.AGE||{};
var ORDER=[
  {key:'confirmed_bug_count',direction:1},
  {key:'reproduction_success_rate',direction:1},
  {key:'novel_finding_count',direction:1},
  {key:'invalid_action_rate',direction:-1},
  {key:'no_progress_rate',direction:-1}
];

function finite(value){return typeof value==='number'&&isFinite(value);}
function gateFailure(gates){
  gates=gates||{};
  if(gates.schema_compatible!==true)return'schema_incompatible';
  if(gates.reproducibility_hash_match!==true)return'reproducibility_hash_mismatch';
  if(gates.finite_q_values!==true)return'non_finite_q_values';
  if(Number(gates.fatal_runtime_regressions||0)>0)return'fatal_runtime_regression';
  return null;
}

A.PolicyValidator=function(options){
  options=options||{};
  this.invalid_action_tolerance=finite(options.invalid_action_tolerance)?options.invalid_action_tolerance:0.05;
  this.no_progress_tolerance=finite(options.no_progress_tolerance)?options.no_progress_tolerance:0.05;
};

A.PolicyValidator.proposedEpsilon=function(active,min){
  var value=finite(active)?active:0.2;
  var floor=finite(min)?min:0.05;
  return Math.max(value*0.95,floor);
};
A.PolicyValidator.prototype.proposedEpsilon=A.PolicyValidator.proposedEpsilon;

A.PolicyValidator.prototype.compare=function(input){
  input=input||{};
  var active=input.active_scorecard||{};
  var candidate=input.candidate_scorecard||{};
  var failure=gateFailure(input.hard_gates);
  if(failure)return{status:'rejected',reason:'hard_gate_failed',gate:failure};
  var nonRegression=[];
  ['confirmed_bug_count','novel_finding_count'].forEach(function(key){
    if(!finite(candidate[key])||!finite(active[key])||candidate[key]<active[key])nonRegression.push(key);
  });
  var activeReplay=active.reproduction_success_rate;
  var candidateReplay=candidate.reproduction_success_rate;
  var replayComparable=finite(activeReplay)&&finite(candidateReplay);
  if(replayComparable&&candidateReplay<activeReplay)nonRegression.push('reproduction_success_rate');
  if(!replayComparable&&((activeReplay===null) !== (candidateReplay===null))){
    // A one-sided null is explicitly non-decisive for this metric.
  }
  if(!finite(candidate.invalid_action_rate)||!finite(active.invalid_action_rate)||candidate.invalid_action_rate>active.invalid_action_rate+this.invalid_action_tolerance)nonRegression.push('invalid_action_rate');
  if(!finite(candidate.no_progress_rate)||!finite(active.no_progress_rate)||candidate.no_progress_rate>active.no_progress_rate+this.no_progress_tolerance)nonRegression.push('no_progress_rate');
  if(nonRegression.length)return{status:'rejected',reason:'non_regression_failed',findings:nonRegression};

  var deciding=null;
  for(var index=0;index<ORDER.length;index++){
    var metric=ORDER[index],left=active[metric.key],right=candidate[metric.key];
    if(metric.key==='reproduction_success_rate'&&(left===null||right===null))continue;
    if(!finite(left)||!finite(right))continue;
    if((right-left)*metric.direction>0){deciding=metric.key;break;}
  }
  if(!deciding)return{status:'no_improvement',reason:'validation_scorecard_equal'};
  return{status:'promotion_eligible',deciding_metric:deciding};
};
})();
