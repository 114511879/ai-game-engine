/** MacroActionSchema.js v4.0 - deterministic static Macro validation. */
(function(){
var A=window.AGE=window.AGE||{};
var MAX_FRAMES=120;
var MAX_ADAPTER_ACTIONS=6;

function finding(code,reason){return{severity:'error',code:code,reason:reason||code};}

A.MacroActionSchema={
  max_macro_frames:MAX_FRAMES,
  max_adapter_actions:MAX_ADAPTER_ACTIONS,
  validate:function(action,capabilities,state,options){
    options=options||{};
    var findings=[];
    action=action&&typeof action==='object'?action:{};
    capabilities=capabilities&&typeof capabilities==='object'?capabilities:{};
    state=state&&typeof state==='object'?state:{};
    if(typeof action.action_id!=='string'||!action.action_id){
      findings.push(finding('action_id_invalid'));
    }
    if(!Number.isInteger(action.duration_frames)||action.duration_frames<1||action.duration_frames>MAX_FRAMES){
      findings.push(finding('macro_duration_invalid'));
    }
    if(action.random===true)findings.push(finding('macro_randomness_forbidden'));
    if(typeof action.sequence==='function'||typeof action.generate==='function'){
      findings.push(finding('runtime_action_generation_forbidden'));
    }
    if(!Array.isArray(action.sequence))findings.push(finding('macro_sequence_invalid'));
    var required=Array.isArray(action.requires)?action.requires:[];
    required.forEach(function(capability){
      if(capabilities[capability]!==true)findings.push(finding('capability_unavailable',capability));
    });
    var precondition=action.precondition;
    if(precondition&&typeof precondition==='object'&&state[precondition.field]!==precondition.equals){
      findings.push(finding('precondition_failed',precondition.field));
    }
    if(options.adapter_action===true&&Number(options.adapter_action_count||0)>MAX_ADAPTER_ACTIONS){
      findings.push(finding('adapter_action_budget_exceeded'));
    }
    return{valid:findings.length===0,findings:findings};
  }
};
})();
