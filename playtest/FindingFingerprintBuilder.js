/** FindingFingerprintBuilder.js v4.0 - normalized semantic Bug fingerprints. */
(function(){
var A=window.AGE=window.AGE||{};

function fnv1a(value){
  var hash=0x811c9dc5;
  var text=String(value);
  for(var index=0;index<text.length;index++){
    hash^=text.charCodeAt(index);
    hash=Math.imul(hash,0x01000193)>>>0;
  }
  return('00000000'+hash.toString(16)).slice(-8);
}
function major(value){return String(value||'1.0').split('.')[0];}

A.FindingFingerprintBuilder=function(options){
  options=options||{};
  this.schema_version=String(options.schema_version||'bugfp-v1');
};

A.FindingFingerprintBuilder.prototype.build=function(finding){
  finding=finding&&typeof finding==='object'?finding:{};
  var semantic={
    schema_version:this.schema_version,
    rule_id:String(finding.rule_id||''),
    rule_major_version:major(finding.rule_version),
    game_type:String(finding.game_type||''),
    component:String(finding.component||''),
    region:String(finding.region||''),
    invariant_signature:String(finding.invariant_signature||''),
    trigger_sequence:Array.isArray(finding.trigger_sequence)?finding.trigger_sequence.map(String):[]
  };
  var output={};
  Object.keys(finding).forEach(function(key){output[key]=finding[key];});
  output.bug_fingerprint='bug:'+fnv1a(JSON.stringify(semantic));
  output.fingerprint_schema_version=this.schema_version;
  return output;
};
})();
