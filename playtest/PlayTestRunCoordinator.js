/** PlayTestRunCoordinator.js v4.0 - unique Candidate Discovery and Replay budgets. */
(function(){
var A=window.AGE=window.AGE||{};
function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
function compareFindings(left,right){
  var transition=(Number(left.first_seen_transition)||0)-(Number(right.first_seen_transition)||0);
  if(transition)return transition;
  var fingerprint=String(left.bug_fingerprint||'').localeCompare(String(right.bug_fingerprint||''));
  if(fingerprint)return fingerprint;
  return String(left.candidate_id||'').localeCompare(String(right.candidate_id||''));
}

A.PlayTestRunCoordinator=function(dependencies){
  dependencies=dependencies||{};
  this.evaluator=dependencies.evaluator;
  this.replayRunner=dependencies.replayRunner;
};

A.PlayTestRunCoordinator.prototype.run=async function(subjects,options){
  options=options||{};
  var rows=(Array.isArray(subjects)?subjects:[]).map(copy);
  var result={
    enabled:options.enabled===true,
    subjects:rows,
    discovery:{episodes_started:0,episodes_completed:0,episodes_incomplete:0,duplicates_skipped:0,elite_results_reused:0},
    replay:{attempts_run:0,findings_confirmed:0,findings_rejected:0,findings_provisional:0}
  };
  if(!result.enabled){
    rows.forEach(function(row){row.playtest={enabled:false,status:'not_run',reason:'playtest_disabled'};});
    return result;
  }
  var maxEpisodes=Number.isInteger(options.max_playtest_episodes_per_run)?options.max_playtest_episodes_per_run:18;
  var maxReplay=Number.isInteger(options.max_replay_attempts_per_run)?options.max_replay_attempts_per_run:24;
  var seen={};
  for(var index=0;index<rows.length;index++){
    var row=rows[index];
    if(row.lineage==='elite'&&row.playtest){
      row.playtest=copy(row.playtest);row.playtest.playtest_reused=true;
      result.discovery.elite_results_reused++;
      continue;
    }
    if(row.status==='qa_rejected'||row.qa_admitted===false){
      row.playtest={enabled:true,status:'not_run',reason:'deterministic_qa_rejected'};
      continue;
    }
    var fingerprint=String(row.fingerprint||row.candidate_id||'');
    if(seen[fingerprint]){
      row.playtest={enabled:true,status:'not_run',reason:'duplicate'};
      result.discovery.duplicates_skipped++;
      continue;
    }
    seen[fingerprint]=true;
    if(result.discovery.episodes_started>=maxEpisodes){
      row.playtest={enabled:true,status:'not_run',reason:'playtest_budget_exhausted'};
      continue;
    }
    result.discovery.episodes_started++;
    row.playtest=await this.evaluator.evaluate(row.dsl,{
      candidate_id:row.candidate_id,
      candidate_seed:row.candidate_seed,
      policy_snapshot:options.policy_snapshot,
      signal:options.signal
    });
    if(row.playtest.status==='completed')result.discovery.episodes_completed++;else result.discovery.episodes_incomplete++;
  }
  var queue=[];
  rows.forEach(function(row){
    if(!row.playtest||!Array.isArray(row.playtest.findings))return;
    row.playtest.findings.forEach(function(finding){
      var item=copy(finding);item.candidate_id=row.candidate_id;item.candidate_seed=row.candidate_seed;item.playtest=row.playtest;queue.push(item);
    });
  });
  queue.sort(compareFindings);
  for(var qi=0;qi<queue.length;qi++){
    var finding=queue[qi], owner=rows.find(function(row){return row.candidate_id===finding.candidate_id;});
    if(!owner||!owner.playtest)continue;
    owner.playtest.replay_results=Array.isArray(owner.playtest.replay_results)?owner.playtest.replay_results:[];
    if(result.replay.attempts_run>=maxReplay){
      finding.status='provisional';finding.reason='replay_budget_exhausted';
      result.replay.findings_provisional++;
      continue;
    }
    var replay=await this.replayRunner.confirm(finding,{replay_deterministic:finding.replay_deterministic===true,signal:options.signal});
    result.replay.attempts_run+=Number(replay.attempts_run)||0;
    owner.playtest.replay_results.push(copy(replay));
    if(replay.status==='confirmed')result.replay.findings_confirmed++;
    else if(replay.status==='rejected')result.replay.findings_rejected++;
    else result.replay.findings_provisional++;
  }
  result.subjects=rows;
  return result;
};
})();
