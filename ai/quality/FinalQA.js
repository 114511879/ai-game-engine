/** FinalQA.js - structural and semantic admission before Engine loading. */
(function(){
var A=window.AGE=window.AGE||{};

A.FinalQA=function(options){
  options=options||{};
  this.ai=options.ai===undefined?(A.callStructuredAI||null):options.ai;
};

A.FinalQA.prototype.validate=function(dsl,intent,blueprint){
  var structural=A.DSLValidator.validate(dsl);
  var findings=[];
  var expected=A.IntentDSL.engineType(intent&&intent.game_type);
  var actual=dsl&&dsl.meta&&dsl.meta.game_type;
  if(expected!==actual){
    findings.push({severity:'error',code:'intent_game_type_mismatch',path:'meta.game_type',reason:'Expected '+expected+', received '+actual});
  }
  if(blueprint&&blueprint.levels&&blueprint.levels.length&&(!dsl.levels||!dsl.levels.length)){
    findings.push({severity:'warning',code:'blueprint_levels_missing',path:'levels'});
  }
  return{
    admitted:structural.valid&&!findings.some(function(finding){return finding.severity==='error'||finding.severity==='blocking';}),
    structural:structural,
    findings:findings
  };
};

A.FinalQA.prototype.admit=async function(dsl,intent,blueprint){
  var result=this.validate(dsl,intent,blueprint);
  if(!result.admitted||!this.ai)return result;
  try{
    var semantic=await this.ai(
      '你是Final QA Agent。检查Game DSL是否忠实实现Intent和Blueprint。只输出{findings:[{severity,code,path,reason}]}。',
      JSON.stringify({intent:intent,blueprint:blueprint,dsl:dsl}),
      {max_tokens:900,timeout_ms:20000,errorStatus:'Final QA语义检查离线'}
    );
    if(semantic&&Array.isArray(semantic.findings))result.findings=result.findings.concat(semantic.findings);
    result.admitted=!result.findings.some(function(finding){return finding.severity==='error'||finding.severity==='blocking';});
  }catch(error){
    result.findings.push({severity:'warning',code:'semantic_qa_offline',path:'$',reason:error.message||String(error)});
  }
  return result;
};
})();
