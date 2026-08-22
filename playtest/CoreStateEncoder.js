/** CoreStateEncoder.js v4.0 - discrete cross-game state encoder. */
(function(){
var A=window.AGE=window.AGE||{};
var FIELDS=[
  'position_region','velocity_x_bucket','velocity_y_bucket','health_bucket',
  'collision_state','boundary_state','nearest_enemy_distance','movement_state',
  'game_phase','grounded','recent_damage','recent_failure'
];

function valueOrUnknown(value){return value===undefined||value===null?'unknown':value;}
function bucketVelocity(value){
  if(typeof value!=='number'||!isFinite(value))return'unknown';
  if(value<=-2)return'fast_negative';
  if(value<0)return'negative';
  if(value===0)return'zero';
  if(value<2)return'positive';
  return'fast_positive';
}
function bucketHealth(value){
  if(typeof value!=='number'||!isFinite(value))return'unknown';
  if(value<=0)return'dead';
  if(value<=3)return'low';
  if(value<=7)return'medium';
  return'high';
}
function bucketDistance(value){
  if(typeof value!=='number'||!isFinite(value))return'unknown';
  if(value<=50)return'near';
  if(value<=150)return'medium';
  return'far';
}
function bool(value){
  if(typeof value!=='boolean')return'unknown';
  return value?'true':'false';
}

A.CoreStateEncoder=function(options){
  options=options||{};
  this.version=String(options.version||'core-v4.0');
};

A.CoreStateEncoder.prototype.encode=function(snapshot,adapter,context){
  snapshot=snapshot&&typeof snapshot==='object'?snapshot:{};
  var vector={};
  vector['core.position_region']=valueOrUnknown(snapshot.position_region);
  vector['core.velocity_x_bucket']=bucketVelocity(snapshot.velocity_x);
  vector['core.velocity_y_bucket']=bucketVelocity(snapshot.velocity_y);
  vector['core.health_bucket']=bucketHealth(snapshot.health);
  vector['core.collision_state']=valueOrUnknown(snapshot.collision_state);
  vector['core.boundary_state']=valueOrUnknown(snapshot.boundary_state);
  vector['core.nearest_enemy_distance']=bucketDistance(snapshot.nearest_enemy_distance);
  vector['core.movement_state']=valueOrUnknown(snapshot.movement_state);
  vector['core.game_phase']=valueOrUnknown(snapshot.game_phase);
  vector['core.grounded']=bool(snapshot.grounded);
  vector['core.recent_damage']=bool(snapshot.recent_damage);
  vector['core.recent_failure']=bool(snapshot.recent_failure);
  var adapterValues=adapter&&typeof adapter.encode==='function'?adapter.encode(snapshot,context):{};
  Object.keys(adapterValues).forEach(function(key){vector['adapter.'+key]=adapterValues[key];});
  return{vector:vector,state_id:A.CanonicalStateSerializer.stateId(vector),encoder_version:this.version};
};

A.CoreStateEncoder.FIELDS=FIELDS.slice();
})();
