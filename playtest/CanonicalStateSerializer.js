/** CanonicalStateSerializer.js v4.0 - deterministic state vector serialization. */
(function(){
var A=window.AGE=window.AGE||{};

function scalar(value){
  if(value===null||value===undefined)return 'unknown';
  if(typeof value==='number')return isFinite(value)?String(value):'unknown';
  if(typeof value==='boolean')return value?'true':'false';
  return String(value);
}

function fnv1a(value){
  var hash=0x811c9dc5;
  var text=String(value);
  for(var index=0;index<text.length;index++){
    hash^=text.charCodeAt(index);
    hash=Math.imul(hash,0x01000193)>>>0;
  }
  return('00000000'+hash.toString(16)).slice(-8);
}

A.CanonicalStateSerializer={
  serialize:function(vector){
    var keys=Object.keys(vector||{}).sort();
    return keys.map(function(key){return key+'='+scalar(vector[key]);}).join('|');
  },
  stateId:function(vector){return'state:'+fnv1a(A.CanonicalStateSerializer.serialize(vector));},
  hash:function(value){return'fnv1a:'+fnv1a(value);}
};
})();
