/** BlueprintMetadata.js - deterministic novelty evidence extracted at the Director boundary. */
(function(){
var A=window.AGE=window.AGE||{};

function finite(value){return typeof value==='number'&&isFinite(value);}
function token(value){
  return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}
function unique(values){
  var seen={},result=[];
  (values||[]).forEach(function(value){
    var normalized=token(typeof value==='object'?(value.id||value.name||value.type):value);
    if(normalized&&!seen[normalized]){seen[normalized]=true;result.push(normalized);}
  });
  return result.sort();
}
function array(value){return Array.isArray(value)?value:[];}
function count(value){
  if(Array.isArray(value))return value.length;
  return finite(value)?Math.max(0,Math.floor(value)):null;
}
function levelSize(levels){
  var total=array(levels).length;
  if(!total)return null;
  if(total<=3)return'small';
  if(total<=8)return'medium';
  return'large';
}

A.BlueprintMetadata={
  fromBlueprint:function(blueprint,dsl,intent,options){
    blueprint=blueprint&&typeof blueprint==='object'?blueprint:{};
    dsl=dsl&&typeof dsl==='object'?dsl:{};
    intent=intent&&typeof intent==='object'?intent:{};
    options=options&&typeof options==='object'?options:{};
    var gameplay=blueprint.gameplay&&typeof blueprint.gameplay==='object'?blueprint.gameplay:{};
    var combat=blueprint.balance&&blueprint.balance.combat&&typeof blueprint.balance.combat==='object'?blueprint.balance.combat:{};
    var metadata={
      game_id:options.game_id||blueprint.request_id||intent.request_id||'',
      version_id:options.version_id||dsl.meta&&dsl.meta.version_id||''
    };

    var mechanics=unique(array(gameplay.mechanics));
    if(mechanics.length)metadata.mechanics=mechanics;

    var declaredStructure=gameplay.level_structure&&typeof gameplay.level_structure==='object'?gameplay.level_structure:{};
    var structure={};
    if(typeof declaredStructure.type==='string'&&token(declaredStructure.type))structure.type=token(declaredStructure.type);
    var size=declaredStructure.size||levelSize(blueprint.levels&&blueprint.levels.length?blueprint.levels:dsl.levels);
    if(typeof size==='string'&&token(size))structure.size=token(size);
    if(finite(declaredStructure.exploration_depth))structure.exploration_depth=Math.max(0,Math.min(1,declaredStructure.exploration_depth));
    if(Object.keys(structure).length)metadata.level_structure=structure;

    var enemyCount=count(combat.enemy_types);
    var dslEnemyTypes=unique(array(dsl.enemies).map(function(enemy){return enemy&&enemy.type||enemy&&enemy.name;})).length;
    if(dslEnemyTypes)enemyCount=Math.max(enemyCount===null?0:enemyCount,dslEnemyTypes);
    var boss=combat.boss&&typeof combat.boss==='object'?combat.boss:{};
    var dslBoss=dsl.boss&&typeof dsl.boss==='object'?dsl.boss:{};
    var bossPatterns=Math.max(count(boss.patterns)||0,count(dslBoss.patterns)||0);
    var enemyFeatures={};
    if(enemyCount!==null&&enemyCount>0)enemyFeatures.enemy_types=enemyCount;
    if(bossPatterns>0)enemyFeatures.boss_patterns=bossPatterns;
    if(Object.keys(enemyFeatures).length)metadata.enemy_features=enemyFeatures;

    var skills=array(dsl.skills).length?dsl.skills:array(combat.skills);
    var interactions=array(gameplay.interactions);
    var skillFeatures={};
    if(skills.length)skillFeatures.skill_count=skills.length;
    if(interactions.length)skillFeatures.interaction_count=interactions.length;
    else if(finite(gameplay.interaction_count))skillFeatures.interaction_count=Math.max(0,Math.floor(gameplay.interaction_count));
    if(Object.keys(skillFeatures).length)metadata.skill_features=skillFeatures;

    var world=blueprint.world&&typeof blueprint.world==='object'?blueprint.world:{};
    var tags=[];
    if(typeof world.theme==='string')tags.push(world.theme);
    tags=tags.concat(array(world.tags));
    if(intent.theme&&typeof intent.theme.world==='string')tags.push(intent.theme.world);
    tags=unique(tags);
    if(tags.length)metadata.theme_tags=tags;
    return metadata;
  }
};
})();
