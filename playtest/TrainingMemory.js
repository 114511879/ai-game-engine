/** TrainingMemory.js v4.0 - bounded immutable training and validation history. */
(function(){
var A=window.AGE=window.AGE||{};
var KEY='age_playtest_training_memory_v4';
var MAX_RUNS=50;
function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}

A.TrainingMemory=function(storage,options){
  this.storage=storage||window.localStorage;
  options=options||{};
  this.max_training_runs=Number.isInteger(options.max_training_runs)?options.max_training_runs:MAX_RUNS;
};
A.TrainingMemory.prototype.all=function(){
  var rows=[];
  try{rows=JSON.parse(this.storage.getItem(KEY)||'[]');}catch(error){rows=[];}
  return(Array.isArray(rows)?rows:[]).map(copy);
};
A.TrainingMemory.prototype.append=function(run){
  if(!run||typeof run!=='object'||!run.training_run_id)throw new Error('invalid_training_run');
  var rows=this.all(); rows.push(copy(run));
  if(rows.length>this.max_training_runs)rows=rows.slice(rows.length-this.max_training_runs);
  this.storage.setItem(KEY,JSON.stringify(rows));
  return copy(run);
};
A.TrainingMemory.KEY=KEY;
})();
