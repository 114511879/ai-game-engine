/** SimulationMemory.js - isolated, versioned simulation history. */
(function(){
var A=window.AGE=window.AGE||{};
var STORAGE_KEY='age_simulation_memory_v1';

function valid(record){return record&&record.run_id&&record.game_id&&record.version_id;}

A.SimulationMemory=function(storage){
  this.storage=storage||window.localStorage;
};

A.SimulationMemory.prototype.all=function(){
  try{
    var records=JSON.parse(this.storage.getItem(STORAGE_KEY)||'[]');
    return Array.isArray(records)?records.filter(valid):[];
  }catch(error){return[];}
};

A.SimulationMemory.prototype.append=function(record){
  if(!valid(record))throw new Error('invalid_simulation_record');
  var records=this.all();
  var safe={
    run_id:record.run_id,
    game_id:record.game_id,
    version_id:record.version_id,
    parent_version:record.parent_version||null,
    persona:record.persona||'default',
    changes:Array.isArray(record.changes)?record.changes.slice():[],
    evaluation:record.evaluation&&typeof record.evaluation==='object'?JSON.parse(JSON.stringify(record.evaluation)):{},
    status:record.status||'completed',
    created_at:record.created_at||Date.now()
  };
  if(record.fitness&&typeof record.fitness==='object')safe.fitness=JSON.parse(JSON.stringify(record.fitness));
  records.push(safe);
  if(records.length>200)records=records.slice(records.length-200);
  this.storage.setItem(STORAGE_KEY,JSON.stringify(records));
  return safe;
};

A.SimulationMemory.prototype.snapshot=function(){
  return this.storage.getItem(STORAGE_KEY);
};

A.SimulationMemory.prototype.restore=function(raw){
  if(raw===null||raw===undefined)this.storage.removeItem(STORAGE_KEY);
  else this.storage.setItem(STORAGE_KEY,raw);
};

A.SimulationMemory.prototype.history=function(gameId,persona){
  return this.all().filter(function(record){
    return record.game_id===gameId&&(!persona||record.persona===persona);
  }).sort(function(a,b){return a.created_at-b.created_at;});
};

A.SimulationMemory.prototype.trend=function(gameId,persona,metric){
  var records=this.history(gameId,persona);
  var first=records[0],last=records[records.length-1];
  var firstValue=first&&Number(first.evaluation[metric]);
  var lastValue=last&&Number(last.evaluation[metric]);
  return{
    metric:metric,
    points:records.length,
    first:isFinite(firstValue)?firstValue:null,
    last:isFinite(lastValue)?lastValue:null,
    delta:isFinite(firstValue)&&isFinite(lastValue)?Number((lastValue-firstValue).toFixed(4)):null
  };
};
})();
