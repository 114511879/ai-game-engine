/** ConstraintEngine.js - deterministic, named hard rules. */
(function(){
var A=window.AGE=window.AGE||{};

A.ConstraintEngine=function(){};

A.ConstraintEngine.prototype.evaluate=function(intent,proposals){
  intent=intent||{};
  var decisions=[];
  var engineType=A.IntentDSL.engineType(intent.game_type);

  if(!A.GAME_TYPES||!A.GAME_TYPES[engineType]){
    decisions.push({
      rule_id:'ENGINE_TYPE_SUPPORTED',
      severity:'blocking',
      path:'intent.game_type',
      action:'replace',
      value:'runner',
      source_agent:'IntentParserAgent'
    });
  }

  (proposals||[]).forEach(function(proposal){
    var data=proposal&&proposal.proposal||{},boss=data.boss||{};
    if(typeof data.player_hp==='number'&&typeof boss.damage==='number'&&boss.damage>=data.player_hp){
      decisions.push({
        rule_id:'COMBAT_SURVIVABLE_HIT',
        severity:'blocking',
        path:'combat.boss.damage',
        action:'cap',
        value:Math.max(1,data.player_hp-1),
        source_agent:proposal.agent
      });
    }
  });

  if(intent.combat&&intent.combat.difficulty==='hard'){
    decisions.push({
      rule_id:'HARD_MODE_TUTORIAL',
      severity:'required',
      path:'gameplay.tutorial',
      action:'set',
      value:true,
      source_agent:'IntentParserAgent'
    });
  }

  return{
    status:decisions.some(function(decision){return decision.severity==='blocking';})?'corrected':'pass',
    decisions:decisions
  };
};
})();
