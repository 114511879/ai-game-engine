/** EpisodeTracker.js v4.0 - bounded deterministic episode accounting. */
(function(){
var A=window.AGE=window.AGE||{};

function now(clock){return typeof clock==='function'?Number(clock()):Date.now();}
function array(value){return Array.isArray(value)?value:[];}

A.EpisodeTracker=function(options){
  options=options||{};
  this.max_macro_transitions=Number.isInteger(options.max_macro_transitions)?options.max_macro_transitions:40;
  this.max_simulation_ticks=Number.isFinite(options.max_simulation_ticks)?options.max_simulation_ticks:1200;
  this.no_progress_transition_limit=Number.isInteger(options.no_progress_transition_limit)?options.no_progress_transition_limit:8;
  this.wall_clock_timeout_ms=Number.isFinite(options.wall_clock_timeout_ms)?options.wall_clock_timeout_ms:120000;
  this.clock=options.clock||function(){return Date.now();};
  this.start();
};

A.EpisodeTracker.prototype.start=function(initial){
  initial=initial||{};
  this.status='running';
  this.termination_reason=null;
  this.macro_transitions=0;
  this.simulation_ticks=0;
  this.no_progress_transitions=0;
  this.started_at=now(this.clock);
  this.last_state_id=initial.state_id||null;
  this.last_progress_signature=initial.progress_signature||null;
  return this.snapshot();
};

A.EpisodeTracker.prototype._finish=function(reason,status){
  this.status=status||'completed';
  this.termination_reason=reason;
};

A.EpisodeTracker.prototype.recordTransition=function(transition){
  transition=transition||{};
  if(this.status!=='running')return this.snapshot();
  this.macro_transitions++;
  this.simulation_ticks+=Number(transition.simulation_ticks)||0;
  var stateChanged=transition.state_id!==undefined&&transition.state_id!==this.last_state_id;
  var eventChanged=array(transition.events).length>0;
  var findingChanged=array(transition.finding_ids).length>0;
  var progressChanged=transition.progress_signature!==undefined&&transition.progress_signature!==this.last_progress_signature;
  if(stateChanged||eventChanged||findingChanged||progressChanged)this.no_progress_transitions=0;
  else this.no_progress_transitions++;
  if(transition.state_id!==undefined)this.last_state_id=transition.state_id;
  if(transition.progress_signature!==undefined)this.last_progress_signature=transition.progress_signature;

  if(transition.terminal){
    this._finish(typeof transition.terminal==='string'?transition.terminal:'engine_error',transition.terminal==='engine_error'?'failed':'completed');
  }else if(this.macro_transitions>=this.max_macro_transitions){
    this._finish('macro_budget_exhausted');
  }else if(this.simulation_ticks>=this.max_simulation_ticks){
    this._finish('simulation_tick_budget');
  }else if(this.no_progress_transitions>=this.no_progress_transition_limit){
    this._finish('no_progress');
  }else if(now(this.clock)-this.started_at>=this.wall_clock_timeout_ms){
    this._finish('timeout','failed');
  }
  return this.snapshot();
};

A.EpisodeTracker.prototype.cancel=function(reason){
  if(this.status==='running')this._finish(reason||'cancelled','completed');
  return this.snapshot();
};

A.EpisodeTracker.prototype.snapshot=function(){
  return{
    status:this.status,
    termination_reason:this.termination_reason,
    macro_transitions:this.macro_transitions,
    simulation_ticks:this.simulation_ticks,
    no_progress_transitions:this.no_progress_transitions
  };
};
})();
