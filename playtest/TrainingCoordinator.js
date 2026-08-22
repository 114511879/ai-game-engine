/** TrainingCoordinator.js v4.0 - safe-close offline training/validation orchestration. */
(function(){
var A=window.AGE=window.AGE||{};
function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
function aborted(signal){return signal&&signal.aborted;}
function hash(value){
  var text=JSON.stringify(value),h=0x811c9dc5;
  for(var i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}
  return'buffer:'+('00000000'+h.toString(16)).slice(-8);
}

A.TrainingCoordinator=function(dependencies){
  dependencies=dependencies||{};
  this.ledger=dependencies.ledger;
  this.buffer=dependencies.buffer;
  this.trainer=dependencies.trainer;
  this.trainingMemory=dependencies.trainingMemory;
  this.validationRunner=dependencies.validationRunner;
  this.promoter=dependencies.promoter;
};

A.TrainingCoordinator.prototype.trainAfterRunClose=async function(options){
  options=options||{};
  var signal=options.signal;
  if(aborted(signal))return{status:'cancelled',reason:'training_cancelled_before_start'};
  try{
    if(this.ledger&&typeof this.ledger.finalizeAll==='function')this.ledger.finalizeAll();
    var rawSnapshot=this.buffer&&typeof this.buffer.snapshot==='function'?this.buffer.snapshot():{layers:{}};
    var transitions=this.buffer&&typeof this.buffer.all==='function'?this.buffer.all():[];
    var dataset={
      snapshot_id:options.dataset_snapshot_id||'dataset-'+String(options.run_id||''),
      snapshot_hash:hash(rawSnapshot),
      source_run_ids:options.source_run_ids||[options.run_id||''],
      transition_count:transitions.length,
      transitions:copy(transitions),
      manifest:copy(rawSnapshot)
    };
    var trained=this.trainer.train({
      parent_policy:copy(options.parent_policy),
      dataset_snapshot:dataset,
      training_profile:copy(options.training_profile||{}),
      training_seed:String(options.training_seed||''),
      signal:signal
    });
    if(aborted(signal))return{status:'cancelled',reason:'training_cancelled_after_train',training:copy(trained)};
    var trainingRun={
      training_run_id:options.run_id||'training-run',
      parent_policy:options.parent_policy&&options.parent_policy.policy_version||'',
      dataset:dataset,
      training:copy(trained),
      status:'completed'
    };
    if(this.trainingMemory)this.trainingMemory.append(trainingRun);
    if(aborted(signal))return{status:'cancelled',reason:'training_cancelled_before_validation',training:copy(trained)};
    var validation=await this.validationRunner.run({
      active_policy:copy(options.parent_policy),
      candidate_policy:copy(trained),
      scenarios:options.scenarios,
      seeds:options.seeds,
      profile:options.validation_profile,
      signal:signal
    });
    if(aborted(signal))return{status:'cancelled',reason:'training_cancelled_before_promotion',training:copy(trained),validation:copy(validation)};
    var promotion=await this.promoter.promote({candidate:copy(trained),validation:validation.decision,training_run:trainingRun});
    return Object.assign({training:copy(trained),validation:copy(validation)},promotion);
  }catch(error){
    return{status:aborted(signal)?'cancelled':'failed',reason:error.code||error.message||'training_failed'};
  }
};
})();
