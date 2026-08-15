/** EvolutionMemory.js v3.0 - bounded experimental evolution history. */
(function(){
var A=window.AGE=window.AGE||{};
var KEY='age_evolution_memory_v3';
var MAX_RUNS=50;
var MAX_TRACE=18;

function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}

function stripDsl(value){
  if(Array.isArray(value))return value.map(stripDsl);
  if(!value||typeof value!=='object')return value;
  var output={};
  Object.keys(value).forEach(function(key){
    if(key!=='dsl')output[key]=stripDsl(value[key]);
  });
  return output;
}

function valid(run){return run&&typeof run==='object'&&run.run_id&&run.game_id;}

A.EvolutionMemory=function(storage){
  this.storage=storage||localStorage;
};

A.EvolutionMemory.prototype.all=function(){
  var parsed;
  try{parsed=JSON.parse(this.storage.getItem(KEY)||'[]');}catch(error){return[];}
  if(!Array.isArray(parsed))return[];
  return parsed.filter(valid).map(copy).sort(function(a,b){return(Number(a.created_at)||0)-(Number(b.created_at)||0);});
};

A.EvolutionMemory.prototype.append=function(run){
  if(!valid(run))throw new Error('invalid_evolution_run');
  var normalized=stripDsl(copy(run));
  if(Array.isArray(normalized.optimization_trace))normalized.optimization_trace=normalized.optimization_trace.slice(0,MAX_TRACE);
  var rows=this.all();
  rows.push(normalized);
  rows.sort(function(a,b){return(Number(a.created_at)||0)-(Number(b.created_at)||0);});
  if(rows.length>MAX_RUNS)rows=rows.slice(rows.length-MAX_RUNS);
  this.storage.setItem(KEY,JSON.stringify(rows));
  return copy(normalized);
};

A.EvolutionMemory.prototype.get=function(runId){
  var rows=this.all();
  for(var index=rows.length-1;index>=0;index--)if(rows[index].run_id===runId)return rows[index];
  return null;
};

A.EvolutionMemory.KEY=KEY;
})();
