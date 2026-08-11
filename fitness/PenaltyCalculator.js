/** PenaltyCalculator.js - independent, capped QA and runtime deductions. */
(function(){
var A=window.AGE=window.AGE||{},T=A.FitnessTypes;

function findings(qa){
  qa=qa&&typeof qa==='object'?qa:{};
  var rows=[];
  if(Array.isArray(qa.findings))rows=rows.concat(qa.findings);
  if(Array.isArray(qa.errors))rows=rows.concat(qa.errors);
  if(qa.structural&&Array.isArray(qa.structural.errors))rows=rows.concat(qa.structural.errors);
  return rows.map(function(row){return typeof row==='string'?{severity:'error',code:row}:row||{};});
}

function calculate(qa,runtime){
  qa=qa&&typeof qa==='object'?qa:{};
  var rows=findings(qa),counts={critical:0,high:0,medium:0,low:0};
  rows.forEach(function(row){
    var severity=String(row.severity||'warning').toLowerCase();
    if(severity==='blocking'||severity==='critical')counts.critical++;
    else if(severity==='error'||severity==='high')counts.high++;
    else if(severity==='warning'||severity==='medium')counts.medium++;
    else counts.low++;
  });
  if(T.finite(qa.critical_bugs))counts.critical+=Math.max(0,Math.floor(qa.critical_bugs));
  var values=runtime&&runtime.values?runtime.values:(runtime||{});
  var qaPenalty=T.clamp(counts.critical*0.12+counts.high*0.06+counts.medium*0.025+counts.low*0.01,0,0.35,0);
  var crashes=values.crashed?1:0;
  var runtimePenalty=T.clamp((values.boot_failures||0)*0.20+crashes*0.20+(values.uncaught_errors||0)*0.03+(values.soft_failures||0)*0.01,0,0.40,0);
  var explanations=[];
  if(qaPenalty>0)explanations.push({factor:'qa_penalty',dimension:'penalty',impact:-T.round(qaPenalty),reason:'QA findings reduced final fitness'});
  if(runtimePenalty>0)explanations.push({factor:'runtime_penalty',dimension:'penalty',impact:-T.round(runtimePenalty),reason:'Runtime failures reduced final fitness'});
  return{
    critical_bugs:counts.critical,
    soft_failures:Math.max(0,Math.floor(values.soft_failures||0)),
    qa_penalty:qaPenalty,
    runtime_penalty:runtimePenalty,
    explanations:explanations
  };
}

A.PenaltyCalculator={calculate:calculate};
})();
