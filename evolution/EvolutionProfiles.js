/** EvolutionProfiles.js v3.0 - validated immutable evolution budgets. */
(function(){
var A=window.AGE=window.AGE||{};
var P=A.EvolutionProtocols;
var profiles={};

function invalid(){throw new Error('invalid_evolution_profile');}

function validate(profile){
  if(!profile||typeof profile!=='object')invalid();
  if(!Number.isInteger(profile.population_size)||profile.population_size<2)invalid();
  if(!Number.isInteger(profile.elite_count)||profile.elite_count<1||profile.elite_count>=profile.population_size)invalid();
  if(profile.max_generations!==3)invalid();
  if(!Number.isInteger(profile.episodes_per_candidate)||profile.episodes_per_candidate<1)invalid();
  if(!Number.isInteger(profile.max_candidates)||profile.max_candidates<1)invalid();
  if(!P.finite(profile.candidate_timeout_ms)||profile.candidate_timeout_ms<0)invalid();
  if(!Number.isInteger(profile.max_failed_candidates)||profile.max_failed_candidates<0)invalid();
  if(!Number.isInteger(profile.max_mutated_variables)||profile.max_mutated_variables<1)invalid();
  if(!profile.selection||profile.selection.method!=='tournament'||!Number.isInteger(profile.selection.tournament_size)||profile.selection.tournament_size<2)invalid();
  if(!profile.crossover||profile.crossover.method!=='uniform'||!P.finite(profile.crossover.rate)||profile.crossover.rate<0||profile.crossover.rate>1)invalid();
  if(profile.duplicate_policy!=='reject'||!Number.isInteger(profile.max_duplicate_retries)||profile.max_duplicate_retries<0)invalid();
  if(!profile.early_stop||!Number.isInteger(profile.early_stop.patience)||profile.early_stop.patience<1||!P.finite(profile.early_stop.min_improvement)||profile.early_stop.min_improvement<0)invalid();
  return true;
}

function register(name,profile){
  if(!name||profiles[name])invalid();
  validate(profile);
  profiles[name]=P.copy(profile);
  return P.copy(profiles[name]);
}

function resolve(name){
  if(!profiles[name])throw new Error('evolution_profile_not_found');
  return P.copy(profiles[name]);
}

register('default_ga_v3',{
  profile:'default_ga_v3',
  population_size:6,
  elite_count:2,
  max_generations:3,
  episodes_per_candidate:1,
  max_candidates:18,
  candidate_timeout_ms:300000,
  max_failed_candidates:3,
  max_mutated_variables:5,
  supported_types:['integer','number','enum','boolean'],
  selection:{method:'tournament',tournament_size:3},
  crossover:{method:'uniform',rate:0.7},
  duplicate_policy:'reject',
  max_duplicate_retries:5,
  fingerprint:'normalized_gene_vector',
  early_stop:{patience:2,min_improvement:0.01},
  evaluation:{mode:'sequential',persona:'new_player',restore_engine_after_run:true}
});

A.EvolutionProfiles={register:register,resolve:resolve,validate:validate};
})();
