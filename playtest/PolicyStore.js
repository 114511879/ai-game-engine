/** PolicyStore.js v4.0 - retained executable Policy versions and activation. */
(function(){
var A=window.AGE=window.AGE||{};
var KEY='age_playtest_policy_store_v4';
var MAX_RETAINED=10;

function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
function validPolicy(policy){return policy&&typeof policy==='object'&&typeof policy.policy_version==='string'&&typeof policy.policy_hash==='string'&&policy.policy_hash.length>0&&policy.q_table&&typeof policy.q_table==='object';}
function finiteValues(value){
  if(typeof value==='number')return isFinite(value);
  if(!value||typeof value!=='object')return true;
  return Object.keys(value).every(function(key){return finiteValues(value[key]);});
}

A.PolicyStore=function(storage,options){
  this.storage=storage||window.localStorage;
  options=options||{};
  this.max_retained_promoted_versions=Number.isInteger(options.max_retained_promoted_versions)?options.max_retained_promoted_versions:MAX_RETAINED;
};

A.PolicyStore.prototype._read=function(){
  var value;
  try{value=JSON.parse(this.storage.getItem(KEY)||'null');}catch(error){value=null;}
  if(!value||typeof value!=='object')value={};
  value.current_active=value.current_active||null;
  value.promoted_versions=Array.isArray(value.promoted_versions)?value.promoted_versions:[];
  value.rejected_metadata=Array.isArray(value.rejected_metadata)?value.rejected_metadata:[];
  value.candidate=value.candidate||null;
  value.lineage=Array.isArray(value.lineage)?value.lineage:[];
  return value;
};
A.PolicyStore.prototype._write=function(value){this.storage.setItem(KEY,JSON.stringify(value));return value;};
A.PolicyStore.prototype.begin=function(){return copy(this._read());};
A.PolicyStore.prototype.rollback=function(snapshot){
  if(typeof snapshot==='string')return this.activate(snapshot);
  this._write(copy(snapshot));
  return this.currentActive();
};
A.PolicyStore.prototype.currentActive=function(){return copy(this._read().current_active);};
A.PolicyStore.prototype.get=function(version){
  var state=this._read();
  if(state.current_active&&state.current_active.policy_version===version)return copy(state.current_active);
  for(var i=0;i<state.promoted_versions.length;i++)if(state.promoted_versions[i].policy_version===version)return copy(state.promoted_versions[i]);
  return null;
};
A.PolicyStore.prototype.rejectedMetadata=function(){return copy(this._read().rejected_metadata);};
A.PolicyStore.prototype.saveCandidate=function(policy){
  if(!validPolicy(policy))throw new Error('invalid_policy_candidate');
  var state=this._read(); state.candidate=copy(policy); this._write(state); return copy(policy);
};
A.PolicyStore.prototype.clearCandidate=function(){var state=this._read();state.candidate=null;this._write(state);};
A.PolicyStore.prototype.stageCandidate=function(policy){return this.saveCandidate(policy);};
A.PolicyStore.prototype.verifyPolicy=function(policy){
  if(!validPolicy(policy))throw new Error('invalid_policy_hash_or_q_table');
  if(!finiteValues(policy.q_table))throw new Error('non_finite_policy_q_table');
  return true;
};
A.PolicyStore.prototype.saveRejectedMetadata=function(metadata){
  var state=this._read();
  state.rejected_metadata.push(copy(metadata));
  this._write(state);
  return copy(metadata);
};
A.PolicyStore.prototype.commitPromotion=function(policy){
  this.verifyPolicy(policy);
  var state=this._read();
  var promoted=copy(policy); promoted.status='active';
  if(state.current_active){
    var previous=copy(state.current_active); previous.status='superseded';
    var replaced=false;
    state.promoted_versions=state.promoted_versions.map(function(row){
      if(row.policy_version===previous.policy_version){replaced=true;return previous;}
      return row;
    });
    if(!replaced)state.promoted_versions.push(previous);
  }
  state.promoted_versions=state.promoted_versions.filter(function(row){return row.policy_version!==promoted.policy_version;});
  state.promoted_versions.push(copy(promoted));
  state.current_active=copy(promoted);
  state.candidate=null;
  state.lineage.push({from:policy.parent_version||null,to:promoted.policy_version});
  while(state.promoted_versions.length>this.max_retained_promoted_versions){
    var removable=-1;
    for(var index=0;index<state.promoted_versions.length;index++){
      if(state.promoted_versions[index].policy_version!==state.current_active.policy_version){removable=index;break;}
    }
    if(removable<0)break;
    state.promoted_versions.splice(removable,1);
  }
  this._write(state);
  return copy(promoted);
};
A.PolicyStore.prototype.activate=function(version){
  var target=this.get(version);
  if(!target)throw new Error('policy_version_not_retained');
  this.verifyPolicy(target);
  var state=this._read();
  if(state.current_active&&state.current_active.policy_version!==version){
    var previous=copy(state.current_active); previous.status='superseded';
    state.promoted_versions=state.promoted_versions.map(function(row){return row.policy_version===previous.policy_version?previous:row;});
  }
  target.status='active';
  state.current_active=copy(target);
  state.promoted_versions=state.promoted_versions.map(function(row){return row.policy_version===version?copy(target):row;});
  this._write(state);
  return copy(target);
};
A.PolicyStore.prototype.rollbackTo=function(version){return this.activate(version);};
A.PolicyStore.KEY=KEY;
})();
