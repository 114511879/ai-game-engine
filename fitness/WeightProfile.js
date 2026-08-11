/** WeightProfile.js - validated, replaceable FitnessCalculator profiles. */
(function(){
var A=window.AGE=window.AGE||{},T=A.FitnessTypes;
var profiles={};

function validate(name,profile){
  if(!name||!profile||typeof profile!=='object')throw new Error('invalid_weight_profile');
  var weights=profile.weights||{},sum=0;
  if(T.DIMENSIONS.some(function(key){
    var value=weights[key];
    if(!T.finite(value)||value<0)return true;
    sum+=value;
    return false;
  })||Math.abs(sum-1)>1e-9)throw new Error('invalid_weight_profile');
  var band=profile.completion_band||[0.4,0.8];
  if(!Array.isArray(band)||band.length!==2||!T.finite(band[0])||!T.finite(band[1])||band[0]<0||band[1]>1||band[0]>=band[1]){
    throw new Error('invalid_weight_profile');
  }
  var death=profile.target_death_rate;
  if(!T.finite(death)||death<=0||death>=1)throw new Error('invalid_weight_profile');
  return{
    name:name,
    weights:T.copy(weights),
    completion_band:[band[0],band[1]],
    target_death_rate:death
  };
}

function register(name,profile){
  var normalized=validate(name,profile);
  profiles[name]=normalized;
  return T.copy(normalized);
}

function resolve(name){
  var requested=name||'default_v2';
  var resolved=profiles[requested]||profiles.default_v2;
  var output=T.copy(resolved);
  output.fallback=requested!==resolved.name;
  output.requested_name=requested;
  return output;
}

register('default_v2',{
  weights:{fun_proxy:0.30,playability:0.20,balance:0.20,novelty:0.10,stability:0.20},
  completion_band:[0.40,0.80],
  target_death_rate:0.30
});

var api={register:register,resolve:resolve};
Object.defineProperty(api,'default_v2',{enumerable:true,get:function(){return T.copy(profiles.default_v2);}});
A.FitnessProfiles=api;
})();
