/** PreQAValidator.js - proposal checks before Director synthesis. */
(function(){
var A=window.AGE=window.AGE||{};

A.PreQAValidator=function(){};

A.PreQAValidator.prototype.validate=function(proposals){
  var findings=[];
  var availableAgents={};
  (proposals||[]).forEach(function(proposal){if(proposal&&proposal.agent)availableAgents[proposal.agent]=true;});
  (proposals||[]).forEach(function(proposal){
    var validation=A.AgentProtocols.validateProposal(proposal);
    validation.errors.forEach(function(code){
      findings.push({
        severity:'blocking',
        code:'schema_'+code,
        path:proposal&&proposal.agent||'unknown',
        source_agent:proposal&&proposal.agent||''
      });
    });
    var data=proposal&&proposal.proposal||{},boss=data.boss||{};
    if(typeof boss.damage==='number'&&typeof data.player_hp==='number'&&boss.damage>=data.player_hp*2){
      findings.push({
        severity:'high',
        code:'boss_one_shot_risk',
        path:'combat.boss.damage',
        source_agent:proposal.agent,
        reason:'Boss damage is at least twice player HP'
      });
    }
    (proposal&&proposal.dependencies||[]).forEach(function(dependency){
      if(!dependency)findings.push({severity:'medium',code:'empty_dependency',path:'dependencies',source_agent:proposal.agent});
      else if(typeof dependency==='string'&&/Agent$/.test(dependency)&&!availableAgents[dependency]){
        findings.push({severity:'blocking',code:'missing_dependency',path:'dependencies',source_agent:proposal.agent,reason:dependency+' is not available'});
      }
    });
  });
  return{
    status:findings.some(function(finding){return finding.severity==='blocking';})?'blocked':'review',
    findings:findings
  };
};
})();
