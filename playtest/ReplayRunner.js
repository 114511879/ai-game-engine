/** ReplayRunner.js v4.0 - seeded Macro sequence replay confirmation. */
(function(){
var A=window.AGE=window.AGE||{};

function abortError(error){
  return(error&&((error.name==='AbortError')||error.code==='cancelled'));
}
function criteria(deterministic){
  return deterministic?{attempts:1,required_successes:1}:{attempts:3,required_successes:2};
}

A.ReplayRunner=function(dependencies){
  dependencies=dependencies||{};
  this.restoreCheckpoint=dependencies.restoreCheckpoint||function(){};
  this.executeSequence=dependencies.executeSequence||function(){return{};};
};

A.ReplayRunner.prototype.confirm=async function(finding,options){
  finding=finding||{}; options=options||{};
  var deterministic=options.replay_deterministic===true;
  var rule=criteria(deterministic);
  var successes=0,failures=0,attempts=[];
  var mismatched=[];
  var baseSeed=String(finding.candidate_seed||'')+':finding:'+String(Number.isInteger(finding.finding_index)?finding.finding_index:0);
  var status='incomplete';
  for(var index=0;index<rule.attempts;index++){
    var attemptNo=index+1;
    var seed=baseSeed+':replay:'+attemptNo;
    try{
      if(options.signal&&options.signal.aborted){status='cancelled';break;}
      await Promise.resolve(this.restoreCheckpoint(finding.checkpoint, {replay_seed:seed}));
      var observed=await Promise.resolve(this.executeSequence(finding.trigger_sequence||[], {replay_seed:seed,signal:options.signal}));
      var observedFingerprint=observed&&observed.bug_fingerprint||'';
      var match=observedFingerprint===finding.bug_fingerprint;
      attempts.push({attempt:attemptNo,replay_seed:seed,status:match?'success':'failure',bug_fingerprint:observedFingerprint});
      if(match)successes++;else{failures++;if(observedFingerprint)mismatched.push(observedFingerprint);}
    }catch(error){
      if(abortError(error)){status='cancelled';break;}
      attempts.push({attempt:attemptNo,replay_seed:seed,status:'incomplete',error:{code:error&&error.code||'',message:error&&error.message||String(error)}});
      status='incomplete';
      break;
    }
    if(successes>=rule.required_successes){status='confirmed';break;}
    if(failures>rule.attempts-rule.required_successes){status='rejected';break;}
  }
  var hasIncompleteAttempt=attempts.some(function(attempt){return attempt.status==='incomplete';});
  if(status==='incomplete'&&attempts.length===rule.attempts&&!hasIncompleteAttempt){
    status=successes>=rule.required_successes?'confirmed':'rejected';
  }
  return{
    finding_id:finding.finding_id||'',
    bug_fingerprint:finding.bug_fingerprint||'',
    replay_deterministic:deterministic,
    criteria:{max_attempts:rule.attempts,required_successes:rule.required_successes},
    attempts_run:attempts.length,
    successes:successes,
    failures:failures,
    attempts:attempts,
    mismatched_fingerprints:mismatched,
    status:status
  };
};
})();
