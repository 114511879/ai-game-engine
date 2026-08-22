/** ObservationNormalizer.js v4.0 - deterministic observation boundary. */
(function(){
var A=window.AGE=window.AGE||{};

function copy(value){
  if(Array.isArray(value))return value.map(copy);
  if(value&&typeof value==='object'){
    var output={};
    Object.keys(value).sort().forEach(function(key){
      if(key!=='timestamp'&&key!=='created_at'&&key!=='wall_clock')output[key]=copy(value[key]);
    });
    return output;
  }
  return value;
}

A.ObservationNormalizer={
  VERSION:'observation-v4.0',
  normalize:function(input){
    input=input&&typeof input==='object'?input:{};
    return{
      schema_version:'4.0',
      tick:Number.isFinite(input.tick)?input.tick:0,
      snapshot:copy(input.snapshot||{}),
      events:copy(Array.isArray(input.events)?input.events:[])
    };
  }
};
})();
