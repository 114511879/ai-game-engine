/** MacroActionExecutor.js v4.0 - deterministic bounded input sequence executor. */
(function(){
var A=window.AGE=window.AGE||{};

function abortError(){
  var error=new Error('Macro action cancelled');
  error.name='AbortError';
  return error;
}
function checkAbort(signal){
  if(signal&&signal.aborted)throw abortError();
}

A.MacroActionExecutor=function(options){
  options=options||{};
  this.inputDriver=options.inputDriver||{
    apply:function(){},
    releaseAllInputs:function(){}
  };
  this._cancelled=false;
};

A.MacroActionExecutor.prototype.cancel=function(){this._cancelled=true;};

A.MacroActionExecutor.prototype.execute=async function(action,context){
  context=context||{};
  var signal=context.signal;
  this._cancelled=false;
  try{
    checkAbort(signal);
    if(this._cancelled)throw abortError();
    if(!action||!Array.isArray(action.sequence))throw new Error('macro_sequence_invalid');
    for(var index=0;index<action.sequence.length;index++){
      checkAbort(signal);
      if(this._cancelled)throw abortError();
      var segment=action.sequence[index]||{};
      await Promise.resolve(this.inputDriver.apply(segment.inputs||{},segment.frames,context));
    }
    checkAbort(signal);
    if(this._cancelled)throw abortError();
    return{status:'completed',action_id:action.action_id||''};
  }finally{
    await Promise.resolve(this.inputDriver.releaseAllInputs());
    this._cancelled=false;
  }
};
})();
