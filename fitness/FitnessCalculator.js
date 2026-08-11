/** FitnessCalculator.js - deterministic, explainable FitnessResult V2. */
(function(){
var A=window.AGE=window.AGE||{},T=A.FitnessTypes;

function completionQuality(value,band){
  if(value>=band[0]&&value<=band[1])return 1;
  if(value<band[0])return T.ratio(value/band[0],0);
  return T.ratio((1-value)/(1-band[1]),0);
}
function deathQuality(value,target){
  if(value<=target)return T.ratio(value/target,0);
  return T.ratio((1-value)/(1-target),0);
}
function availabilityConfidence(availability,keys){
  return keys.filter(function(key){return availability[key];}).length/keys.length;
}
function structureScore(type){
  var scores={linear:0.25,hub:0.50,branching:0.75,procedural:1,random:1};
  return Object.prototype.hasOwnProperty.call(scores,type)?scores[type]:0.5;
}
function metadataMatches(metadata,gameId,versionId){
  if(!metadata||typeof metadata!=='object')return false;
  if(metadata.game_id&&gameId&&metadata.game_id!==gameId)return false;
  if(metadata.version_id&&versionId&&metadata.version_id!==versionId)return false;
  return ['mechanics','level_structure','enemy_features','skill_features'].some(function(key){return metadata[key]!==undefined;});
}
function novelty(metadata,gameId,versionId){
  if(!metadataMatches(metadata,gameId,versionId))return{score:0.5,confidence:0.3,reason:'missing_blueprint_metadata'};
  var mechanics=Array.isArray(metadata.mechanics)?metadata.mechanics:[];
  var unique={};
  mechanics.forEach(function(item){if(item!==undefined&&item!==null)unique[String(item)]=true;});
  var mechanicPresent=Array.isArray(metadata.mechanics);
  var mechanic=T.ratio(Object.keys(unique).length/6,0);
  var skills=metadata.skill_features&&typeof metadata.skill_features==='object'?metadata.skill_features:{};
  var interactionPresent=T.finite(skills.interaction_count);
  var interaction=interactionPresent?T.ratio(skills.interaction_count/10,0):0.5;
  var level=metadata.level_structure&&typeof metadata.level_structure==='object'?metadata.level_structure:{};
  var structureValues=[];
  if(typeof level.type==='string')structureValues.push(structureScore(level.type.toLowerCase()));
  if(T.finite(level.exploration_depth))structureValues.push(T.ratio(level.exploration_depth,0));
  var structurePresent=structureValues.length>0;
  var structure=T.mean(structureValues,0.5);
  var enemies=metadata.enemy_features&&typeof metadata.enemy_features==='object'?metadata.enemy_features:{};
  var contentValues=[];
  if(T.finite(enemies.enemy_types))contentValues.push(T.ratio(enemies.enemy_types/12,0));
  if(T.finite(enemies.boss_patterns))contentValues.push(T.ratio(enemies.boss_patterns/5,0));
  if(T.finite(skills.skill_count))contentValues.push(T.ratio(skills.skill_count/20,0));
  var contentPresent=contentValues.length>0;
  var content=T.mean(contentValues,0.5);
  var populated=[mechanicPresent,interactionPresent,structurePresent,contentPresent].filter(Boolean).length;
  return{
    score:T.mean([mechanic,interaction,structure,content],0.5),
    confidence:0.3+0.7*(populated/4),
    reason:populated<4?'partial_blueprint_metadata':'blueprint_metadata'
  };
}
function stability(runtime){
  if(!runtime.available_count)return{score:0.5,confidence:0.2};
  var v=runtime.values,a=runtime.availability;
  var crashFree=a.crashed?(v.crashed?0:1):0.5;
  var bootQuality=(a.started||a.boot_failures)?(v.started&&v.boot_failures===0?1:0):0.5;
  var errorQuality=(a.uncaught_errors||a.invalid_state_count)?1-T.ratio((v.uncaught_errors+v.invalid_state_count)/5,0):0.5;
  var frameParts=[];
  if(a.frame_drop_rate)frameParts.push(1-v.frame_drop_rate);
  if(a.avg_fps&&a.target_fps&&v.target_fps>0)frameParts.push(T.ratio(v.avg_fps/v.target_fps,0));
  var frameQuality=T.mean(frameParts,0.5);
  return{
    score:crashFree*0.35+bootQuality*0.25+errorQuality*0.25+frameQuality*0.15,
    confidence:Math.max(0.2,runtime.available_count/9)
  };
}
function sortExplanations(rows){
  return rows.sort(function(left,right){
    var magnitude=Math.abs(Number(right.impact)||0)-Math.abs(Number(left.impact)||0);
    return magnitude||String(left.factor).localeCompare(String(right.factor));
  });
}
function qaWithSimulationBugs(qa,bugs){
  qa=qa&&typeof qa==='object'?qa:{};
  var merged={};
  Object.keys(qa).forEach(function(key){merged[key]=key==='findings'?null:qa[key];});
  merged.findings=(Array.isArray(qa.findings)?T.copy(qa.findings):[]).concat(Array.isArray(bugs)?T.copy(bugs):[]);
  return merged;
}

A.FitnessCalculator=function(options){
  options=options||{};
  this.profileName=options.profile||'default_v2';
  this.gameId=options.game_id||'';
  this.versionId=options.version_id||'';
  this.fitnessId=options.fitness_id||('fitness-'+this.gameId+'-'+this.versionId);
};

A.FitnessCalculator.prototype.calculateFitness=function(evaluationInput,qaInput,runtimeInput,trendInput,metadata){
  var profile=A.FitnessProfiles.resolve(this.profileName);
  var evaluation=A.MetricsNormalizer.evaluation(evaluationInput);
  var runtime=A.MetricsNormalizer.runtime(runtimeInput);
  var trend=A.MetricsNormalizer.trend(trendInput);
  var v=evaluation.values,a=evaluation.availability;
  var completion=completionQuality(v.completion_rate,profile.completion_band);
  var behavior=T.mean([
    a.coverage?v.coverage:null,
    a.exploration_rate?v.exploration_rate:null,
    a.skill_usage_diversity?v.skill_usage_diversity:null,
    a.route_variation?v.route_variation:null
  ],0.5);
  var pace=T.mean([
    a.progression_quality?v.progression_quality:null,
    a.early_failure_rate?1-v.early_failure_rate:null
  ],0.5);
  var replay=a.retry_rate?v.retry_rate:0.5;
  var frustration=T.mean([
    a.death_rate?v.death_rate:null,
    a.early_failure_rate?v.early_failure_rate:null
  ],0.5);
  var fun=T.ratio(
    (v.engagement_proxy/10)*0.30+completion*0.20+behavior*0.20+pace*0.15+replay*0.15-frustration*0.20,
    0
  );
  var playability=T.ratio(v.completion_rate*0.35+v.coverage*0.30+(1-v.early_failure_rate)*0.20+v.progression_quality*0.15,0);
  var balance=T.ratio(deathQuality(v.death_rate,profile.target_death_rate)*0.50+completion*0.35+v.progression_quality*0.15,0);
  var noveltyResult=novelty(metadata,this.gameId,this.versionId);
  var stabilityResult=stability(runtime);
  var scores={fun_proxy:fun,playability:playability,balance:balance,novelty:noveltyResult.score,stability:stabilityResult.score};
  var penalties=A.PenaltyCalculator.calculate(qaWithSimulationBugs(qaInput,evaluation.bugs),runtime);
  var base=0;
  T.DIMENSIONS.forEach(function(key){base+=scores[key]*profile.weights[key];});
  var finalFitness=T.ratio(base-penalties.qa_penalty-penalties.runtime_penalty,0);
  var episodeConfidence=Math.min(1,evaluation.episodes/3);
  var confidence={
    fun_proxy:T.ratio(availabilityConfidence(a,['engagement_proxy','completion_rate','coverage','exploration_rate','skill_usage_diversity','route_variation','progression_quality','early_failure_rate','retry_rate','death_rate'])*0.6+episodeConfidence*0.4,0),
    playability:availabilityConfidence(a,['completion_rate','coverage','early_failure_rate','progression_quality']),
    balance:availabilityConfidence(a,['death_rate','completion_rate','progression_quality']),
    novelty:noveltyResult.confidence,
    stability:stabilityResult.confidence
  };
  var overall=0;
  T.DIMENSIONS.forEach(function(key){overall+=confidence[key]*profile.weights[key];});
  if(evaluation.status!=='completed')overall=Math.min(overall,0.60);
  if(evaluation.episodes===0)overall=Math.min(overall,0.40);
  confidence.overall=T.ratio(overall,0);
  var explanations=[
    {factor:'completion_rate',dimension:'fun_proxy',impact:T.round(completion*0.20),reason:completion===1?'completion rate is inside the target band':'completion rate is outside the target band'},
    {factor:'death_rate',dimension:'balance',impact:T.round(deathQuality(v.death_rate,profile.target_death_rate)*0.50),reason:'death rate compared with the profile target'},
    {factor:noveltyResult.reason,dimension:'novelty',impact:0,reason:noveltyResult.reason.replace(/_/g,' ')}
  ].concat(penalties.explanations);
  if(profile.fallback)explanations.push({factor:'profile_fallback',dimension:'profile',impact:0,reason:'unknown profile fell back to default_v2'});
  if(trend.previous_fitness!==null)explanations.push({factor:'fitness_trend',dimension:'trend',impact:T.round(finalFitness-trend.previous_fitness),reason:'change from previous version fitness'});
  return T.fitnessResult({
    fitness_id:this.fitnessId,
    game_id:this.gameId,
    version_id:this.versionId,
    profile:profile.name,
    scores:scores,
    weights:profile.weights,
    penalties:penalties,
    base_fitness:base,
    final_fitness:finalFitness,
    confidence:confidence,
    trend:{points:trend.points,previous_fitness:trend.previous_fitness,improvement_delta:trend.previous_fitness===null?null:finalFitness-trend.previous_fitness},
    explanations:sortExplanations(explanations)
  });
};

A.calculateFitness=function(evaluation,qa,runtime,trend,blueprintMetadata){
  return new A.FitnessCalculator().calculateFitness(evaluation,qa,runtime,trend,blueprintMetadata);
};
})();
