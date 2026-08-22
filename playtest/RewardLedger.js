/** RewardLedger.js v4.0 - auditable provisional/finalized reward ledger. */
(function(){
var A=window.AGE=window.AGE||{};
var DEFAULT_CAPS={coverage:0.2,boundary_state:0.2,novel_sequence:0.2,ordinary_movement:0.1};
var DUPLICATE_DECAY=[1,0.25,0.1];

function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
function finite(value,fallback){return typeof value==='number'&&isFinite(value)?value:fallback;}

A.RewardLedger=function(options){
  options=options||{};
  this.factor_caps=Object.assign({},DEFAULT_CAPS,options.factor_caps||{});
  this._entries=[];
  this._sequence=0;
  this._duplicateCounts={};
  this._episodeFactors={};
};

A.RewardLedger.prototype._capValue=function(entry,value){
  var cap=this.factor_caps[entry.factor];
  if(cap===undefined)return Math.max(0,value);
  var episode=entry.episode_id||'episode:default';
  var used=this._episodeFactors[episode]&&this._episodeFactors[episode][entry.factor]||0;
  var applied=Math.max(0,Math.min(value,Math.max(0,cap-used)));
  this._episodeFactors[episode]=this._episodeFactors[episode]||{};
  this._episodeFactors[episode][entry.factor]=used+applied;
  return applied;
};

A.RewardLedger.prototype.record=function(input){
  input=input||{};
  var value=finite(input.value,0);
  var entry={
    reward_event_id:input.reward_event_id||('reward-'+(++this._sequence)),
    event_id:input.event_id||'',
    finding_id:input.finding_id||null,
    factor:input.factor||'ordinary_movement',
    original_value:value,
    final_value:value,
    status:input.status|| (input.finding_id?'provisional':'finalized'),
    confirmed:input.confirmed===true,
    bug_fingerprint:input.bug_fingerprint||null,
    trajectory_id:input.trajectory_id||null,
    episode_id:input.episode_id||null,
    reward_profile:input.reward_profile||'bug-discovery-v1'
  };
  if(entry.status==='finalized'&&!entry.confirmed)entry.final_value=this._capValue(entry,value);
  this._entries.push(entry);
  return copy(entry);
};

A.RewardLedger.prototype.byFinding=function(findingId){
  return this._entries.filter(function(entry){return entry.finding_id===findingId;}).map(copy);
};

A.RewardLedger.prototype.finalizeFinding=function(findingId,update){
  update=update||{};
  var value=finite(update.value,1);
  var rows=[];
  this._entries.forEach(function(entry){
    if(entry.finding_id!==findingId)return;
    entry.factor=update.factor||'confirmed_novel_bug';
    entry.final_value=value;
    entry.status='finalized';
    entry.confirmed=true;
    rows.push(copy(entry));
  });
  return rows;
};

A.RewardLedger.prototype.rejectFinding=function(findingId,update){
  update=update||{};
  var value=finite(update.value,0);
  var rows=[];
  this._entries.forEach(function(entry){
    if(entry.finding_id!==findingId)return;
    entry.final_value=value;
    entry.status=value===0?'revoked':'finalized';
    entry.confirmed=false;
    rows.push(copy(entry));
  });
  return rows;
};

A.RewardLedger.prototype.markIncomplete=function(findingId){
  this._entries.forEach(function(entry){
    if(entry.finding_id===findingId){entry.status='provisional';entry.confirmed=false;entry.confirmation_state='incomplete';}
  });
  return this.byFinding(findingId);
};

A.RewardLedger.prototype.duplicateReward=function(fingerprint,baseValue){
  var key=String(fingerprint||'');
  var count=this._duplicateCounts[key]||0;
  this._duplicateCounts[key]=count+1;
  var multiplier=count<DUPLICATE_DECAY.length?DUPLICATE_DECAY[count]:0;
  return finite(baseValue,0)*multiplier;
};

A.RewardLedger.prototype.entries=function(){return this._entries.map(copy);};
})();
