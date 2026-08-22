/** AnomalyRuleRegistry.js v4.0 - deterministic invariant and temporal rules. */
(function(){
var A=window.AGE=window.AGE||{};

function finding(rule,category,severity,context){
  context=context||{};
  return{
    rule_id:rule.rule_id,
    rule_version:rule.rule_version||'1.0',
    category:category,
    severity:severity,
    component:context.component||'game',
    region:context.region||'unknown',
    invariant_signature:context.invariant_signature||rule.rule_id,
    trigger_sequence:Array.isArray(context.trigger_sequence)?context.trigger_sequence.slice():[],
    context:context
  };
}

function defaultRules(){
  return[
    {
      rule_id:'state.hp_zero_alive',
      category:'state',
      severity:'high',
      detect:function(snapshot){
        if(Number(snapshot.player_hp)<=0&&snapshot.player_state==='alive'&&snapshot.game_over!==true&&snapshot.win!==true){
          return finding(this,'state','high',{component:'player',invariant_signature:'hp_zero_alive'});
        }
        return null;
      }
    },
    {
      rule_id:'physics.boundary_escape',
      category:'physics',
      severity:'high',
      detect:function(snapshot){
        if(snapshot.game_phase==='active'&&snapshot.boundary_state==='outside_playable_area'){
          return finding(this,'physics','high',{component:'player',region:snapshot.region||'unknown',invariant_signature:'outside_playable_area'});
        }
        return null;
      }
    },
    {
      rule_id:'logic.cooldown_violation',
      category:'logic',
      severity:'high',
      detect:function(snapshot,events){
        var rows=Array.isArray(events)?events:[];
        for(var i=0;i<rows.length;i++){
          if(rows[i]&&rows[i].type==='skill_activated'&&rows[i].cooldown_active===true){
            return finding(this,'logic','high',{component:'skill',invariant_signature:'cooldown_active_skill_success',trigger_sequence:[rows[i].skill||'skill']});
          }
        }
        return null;
      }
    },
    {
      rule_id:'temporal.input_after_death',
      category:'temporal',
      severity:'high',
      detect:function(snapshot,events,history,context){
        var previous=Array.isArray(history)?history:[];
        var current=Array.isArray(events)?events:[];
        var window=Number(context&&context.window); if(!isFinite(window)||window<0)window=2;
        for(var i=0;i<previous.length;i++){
          var death=previous[i];
          if(!death||death.type!=='death')continue;
          for(var j=0;j<current.length;j++){
            var move=current[j];
            if(move&&move.type==='move_input'&&isFinite(death.tick)&&isFinite(move.tick)&&move.tick-death.tick>=0&&move.tick-death.tick<=window){
              return finding(this,'temporal','high',{component:'input',invariant_signature:'input_after_death',trigger_sequence:['death','move_input']});
            }
          }
        }
        return null;
      }
    }
  ];
}

A.AnomalyRuleRegistry=function(options){
  options=options||{};
  this.registry_version=String(options.registry_version||'anomaly-rules-v4.0');
  this.rules=Array.isArray(options.rules)?options.rules.slice():defaultRules();
};

A.AnomalyRuleRegistry.prototype.detect=function(snapshot,events,history,context){
  var findings=[];
  for(var i=0;i<this.rules.length;i++){
    var rule=this.rules[i];
    if(!rule||typeof rule.detect!=='function')continue;
    var result=rule.detect.call(rule,snapshot||{},events||[],history||[],context||{});
    if(result)findings.push(result);
  }
  return findings;
};
})();
