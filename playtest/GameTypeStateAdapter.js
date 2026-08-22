/** GameTypeStateAdapter.js v4.0 - bounded pure game-type state adapter. */
(function(){
var A=window.AGE=window.AGE||{};

function copy(value){
  if(Array.isArray(value))return value.slice();
  if(value&&typeof value==='object'){
    var output={};
    Object.keys(value).forEach(function(key){output[key]=value[key];});
    return output;
  }
  return value;
}

A.GameTypeStateAdapter=function(options){
  options=options||{};
  this.id=String(options.id||'unknown-adapter');
  this.version=String(options.version||'1.0');
  this.maxFeatures=Number.isInteger(options.max_features)?options.max_features:6;
  this._encode=typeof options.encode==='function'?options.encode:function(){return{};};
};

A.GameTypeStateAdapter.prototype.encode=function(snapshot,context){
  var result=this._encode(snapshot,context);
  if(!result||typeof result!=='object'||Array.isArray(result))throw new Error('adapter_output_invalid');
  var keys=Object.keys(result).sort();
  if(keys.length>this.maxFeatures)throw new Error('adapter_feature_budget_exceeded');
  var output={};
  keys.forEach(function(key){
    var value=result[key];
    if(value===undefined||value===null)value='unknown';
    if(typeof value==='number'&&!isFinite(value))value='unknown';
    if(typeof value==='object'||typeof value==='function')throw new Error('adapter_value_not_discrete');
    output[key]=value;
  });
  return output;
};
})();
