/** types.js - shared FitnessCalculator V2 contracts and numeric helpers. */
(function(){
var A=window.AGE=window.AGE||{};
var DIMENSIONS=['fun_proxy','playability','balance','novelty','stability'];

function finite(value){return typeof value==='number'&&isFinite(value);}
function clamp(value,min,max,fallback){
  var number=finite(value)?value:(finite(fallback)?fallback:min);
  return Math.max(min,Math.min(max,number));
}
function round(value){return Number(clamp(value,-Number.MAX_VALUE,Number.MAX_VALUE,0).toFixed(4));}
function ratio(value,fallback){return clamp(value,0,1,fallback===undefined?0:fallback);}
function mean(values,fallback){
  var valid=(values||[]).filter(finite);
  if(!valid.length)return finite(fallback)?fallback:0;
  return valid.reduce(function(sum,value){return sum+value;},0)/valid.length;
}
function copy(value){
  if(value===undefined||value===null)return value;
  return JSON.parse(JSON.stringify(value));
}
function scoreMap(input){
  var output={};
  DIMENSIONS.forEach(function(key){output[key]=round(ratio(input&&input[key],0));});
  return output;
}

function fitnessResult(input){
  input=input||{};
  var confidence=scoreMap(input.confidence||{});
  confidence.overall=round(ratio(input.confidence&&input.confidence.overall,0));
  var previous=input.trend&&finite(input.trend.previous_fitness)?round(ratio(input.trend.previous_fitness,0)):null;
  var delta=input.trend&&finite(input.trend.improvement_delta)?round(input.trend.improvement_delta):null;
  return{
    schema_version:'2.0',
    fitness_id:String(input.fitness_id||''),
    game_id:String(input.game_id||''),
    version_id:String(input.version_id||''),
    profile:String(input.profile||'default_v2'),
    scores:scoreMap(input.scores||{}),
    weights:scoreMap(input.weights||{}),
    penalties:{
      critical_bugs:Math.max(0,Math.floor(clamp(input.penalties&&input.penalties.critical_bugs,0,Number.MAX_SAFE_INTEGER,0))),
      soft_failures:Math.max(0,Math.floor(clamp(input.penalties&&input.penalties.soft_failures,0,Number.MAX_SAFE_INTEGER,0))),
      qa_penalty:round(clamp(input.penalties&&input.penalties.qa_penalty,0,0.35,0)),
      runtime_penalty:round(clamp(input.penalties&&input.penalties.runtime_penalty,0,0.40,0))
    },
    base_fitness:round(ratio(input.base_fitness,0)),
    final_fitness:round(ratio(input.final_fitness,0)),
    confidence:confidence,
    trend:{
      points:Math.max(0,Math.floor(clamp(input.trend&&input.trend.points,0,Number.MAX_SAFE_INTEGER,0))),
      previous_fitness:previous,
      improvement_delta:delta
    },
    explanations:Array.isArray(input.explanations)?copy(input.explanations):[]
  };
}

A.FitnessTypes={
  VERSION:'2.0',
  DIMENSIONS:DIMENSIONS.slice(),
  finite:finite,
  clamp:clamp,
  round:round,
  ratio:ratio,
  mean:mean,
  copy:copy,
  fitnessResult:fitnessResult
};
})();
