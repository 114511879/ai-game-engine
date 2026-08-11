/** MetricsNormalizer.js - finite, bounded adapters for V1/V2 fitness evidence. */
(function(){
var A=window.AGE=window.AGE||{},T=A.FitnessTypes;

function own(object,key){return !!object&&Object.prototype.hasOwnProperty.call(object,key);}
function sourceMetric(evaluation,key){
  var metrics=evaluation&&evaluation.metrics;
  if(own(metrics,key))return{available:T.finite(metrics[key]),value:metrics[key]};
  if(own(evaluation,key))return{available:T.finite(evaluation[key]),value:evaluation[key]};
  return{available:false,value:null};
}
function normalizedRatio(evaluation,key,fallback){
  var source=sourceMetric(evaluation,key);
  return{available:source.available,value:source.available?T.ratio(source.value,fallback):fallback};
}

function evaluation(input){
  input=input&&typeof input==='object'?input:{};
  var availability={},values={};
  ['completion_rate','death_rate','coverage','retry_rate','exploration_rate','skill_usage_diversity','route_variation','early_failure_rate','progression_quality'].forEach(function(key){
    var normalized=normalizedRatio(input,key,0.5);
    values[key]=normalized.value;
    availability[key]=normalized.available;
  });
  var engagement=sourceMetric(input,'engagement_proxy');
  values.engagement_proxy=engagement.available?T.clamp(engagement.value,0,10,0):5;
  availability.engagement_proxy=engagement.available;
  var playTime=sourceMetric(input,'play_time');
  values.play_time=playTime.available?Math.max(0,playTime.value):0;
  availability.play_time=playTime.available;
  return{
    status:typeof input.status==='string'?input.status:'incomplete',
    episodes:T.finite(input.episodes)?Math.max(0,Math.floor(input.episodes)):0,
    values:values,
    availability:availability,
    bugs:Array.isArray(input.bugs)?T.copy(input.bugs):[]
  };
}

function runtime(input){
  input=input&&typeof input==='object'?input:{};
  var availability={};
  function bool(key,fallback){availability[key]=typeof input[key]==='boolean';return availability[key]?input[key]:fallback;}
  function count(key){availability[key]=T.finite(input[key]);return availability[key]?Math.max(0,Math.floor(input[key])):0;}
  function ratio(key,fallback){availability[key]=T.finite(input[key]);return availability[key]?T.ratio(input[key],fallback):fallback;}
  function number(key,fallback){availability[key]=T.finite(input[key]);return availability[key]?Math.max(0,input[key]):fallback;}
  return{
    values:{
      started:bool('started',false),
      crashed:bool('crashed',false),
      boot_failures:count('boot_failures'),
      uncaught_errors:count('uncaught_errors'),
      invalid_state_count:count('invalid_state_count'),
      soft_failures:count('soft_failures'),
      frame_drop_rate:ratio('frame_drop_rate',0.5),
      avg_fps:number('avg_fps',0),
      target_fps:number('target_fps',60)
    },
    availability:availability,
    available_count:Object.keys(availability).filter(function(key){return availability[key];}).length
  };
}

function trend(input){
  input=input&&typeof input==='object'?input:{};
  var previous=T.finite(input.previous_fitness)?T.ratio(input.previous_fitness,0):null;
  return{
    points:T.finite(input.points)?Math.max(0,Math.floor(input.points)):0,
    previous_fitness:previous,
    metrics:input.metrics&&typeof input.metrics==='object'?T.copy(input.metrics):{}
  };
}

A.MetricsNormalizer={evaluation:evaluation,runtime:runtime,trend:trend};
})();
