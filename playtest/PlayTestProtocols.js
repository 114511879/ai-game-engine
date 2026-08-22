/** PlayTestProtocols.js v4.0 - immutable protocol defaults and status contracts. */
(function(){
var A=window.AGE=window.AGE||{};
var VERSION='4.0';

function isObject(value){
  return value&&typeof value==='object'&&!Array.isArray(value);
}

function copy(value){
  if(Array.isArray(value))return value.map(copy);
  if(isObject(value)){
    var output={};
    Object.keys(value).forEach(function(key){output[key]=copy(value[key]);});
    return output;
  }
  return value;
}

function merge(base,override){
  var output=copy(base);
  if(!isObject(override))return output;
  Object.keys(override).forEach(function(key){
    var value=override[key];
    output[key]=isObject(value)&&isObject(output[key])
      ?merge(output[key],value)
      :copy(value);
  });
  return output;
}

var DEFAULTS={
  schema_version:VERSION,
  policy_update:{
    mode:'freeze_during_run',
    policy_scope:'evolution_run',
    learn_after_run:true,
    allow_mid_run_update:false,
    record_policy_version:true,
    record_policy_hash:true
  },
  learning:{
    algorithm:'tabular_q_learning',
    state_space:'discrete_bucketed',
    action_space:'macro_actions',
    randomness:'seeded',
    online_update_during_evolution_run:false
  },
  state_space:{
    architecture:'core_plus_game_type_adapter',
    encoding:'discrete_bucketed',
    canonical_order:true,
    unknown_value:'unknown',
    allow_raw_continuous_values:false,
    max_adapter_features:6
  },
  action_space:{
    architecture:'core_plus_capability_adapter',
    execution:'deterministic_bounded_sequence',
    one_transition_per_macro:true,
    allow_runtime_generated_actions:false,
    allow_randomness_inside_macro:false,
    max_adapter_actions:6,
    max_macro_frames:120,
    input_cleanup_required:true
  },
  episode:{
    budget_mode:'macro_transitions_with_tick_guard',
    max_macro_transitions:40,
    max_simulation_ticks:1200,
    no_progress_transition_limit:8,
    wall_clock_timeout_ms:120000,
    stop_on_provisional_finding:false,
    stop_on_fatal_finding:true
  },
  anomaly_detection:{
    architecture:'versioned_deterministic_rule_registry',
    input:'normalized_engine_events_and_snapshots',
    fingerprint:'normalized_finding_context',
    replay:'seeded_confirmation',
    allow_llm_detection:false,
    allow_wall_clock_dependency:false,
    allow_engine_internal_reads:false
  },
  replay_confirmation:{
    deterministic:{attempts:1,required_successes:1},
    non_deterministic_or_unknown:{attempts:3,required_successes:2}
  },
  reward:{
    objective:'bug_discovery',
    architecture:'event_ledger',
    profile:'bug-discovery-v1',
    replay_confirmation_required:true,
    allow_delayed_relabeling:true,
    use_final_fitness:false,
    per_episode_caps:true,
    duplicate_reward_decay:true
  },
  training:{
    profile:'bug-hunter-q-v1',
    alpha:0.1,
    gamma:0.95,
    epochs_per_run:3,
    max_updates_per_run:5000,
    sample_order:'seeded_stratified',
    train_after_safe_run_close:true,
    sample_repetition:{confirmed:4,negative_evidence:2,exploration:1}
  },
  exploration:{
    epsilon_initial:0.20,
    epsilon_decay_on_promotion:0.95,
    epsilon_min:0.05,
    allow_mid_run_change:false
  },
  replay_buffer:{
    max_transitions:10000,
    max_source_runs:50,
    retention:'stratified_fifo',
    store_raw_engine_state:false,
    store_finalized_reward_ledger_refs:true,
    exclude_incomplete_transitions:true
  },
  policy_store:{
    max_retained_promoted_versions:10,
    retain_rejected_metadata:true,
    retain_rejected_q_table:false,
    rollback_mode:'explicit_active_version',
    official_version_requires_hash:true
  },
  training_memory:{max_training_runs:50},
  validation:{
    profile:'bug-hunter-validation-v1',
    scenarios:'fixed_holdout_v1',
    seeds:'fixed',
    hard_gates:{
      schema_compatible:true,
      reproducibility_hash_match:true,
      finite_q_values:true,
      fatal_runtime_regressions:0
    },
    non_regression:{
      confirmed_bug_count:'candidate >= active',
      reproduction_success_rate:'candidate >= active',
      novel_finding_count:'candidate >= active',
      invalid_action_rate:'candidate <= active + 0.05',
      no_progress_rate:'candidate <= active + 0.05'
    },
    comparison_order:[
      'confirmed_bug_count',
      'reproduction_success_rate',
      'novel_finding_count',
      'invalid_action_rate',
      'no_progress_rate'
    ],
    tie_policy:'no_promotion_without_strict_validation_improvement'
  },
  playtest:{
    enabled:false,
    scope:'all_unique_evaluated_candidates',
    episodes_per_candidate:1,
    max_playtest_episodes_per_run:18,
    reuse_elite_results:true
  },
  replay_budget:{
    max_replay_attempts_per_run:24,
    replay_findings_in_transition_order:true,
    replay_budget_is_separate:true
  }
};

var STATUS={
  finding:{provisional:true,finalized:true,revoked:true},
  replay:{confirmed:true,rejected:true,cancelled:true,incomplete:true},
  policy_decision:{promotion_eligible:true,no_improvement:true,rejected:true},
  policy:{candidate:true,active:true,superseded:true,rejected:true}
};

A.PlayTestProtocols={
  VERSION:VERSION,
  defaults:function(){return copy(DEFAULTS);},
  playtestProfile:function(overrides){return merge(DEFAULTS,overrides||{});},
  stateProfile:function(overrides){return merge(DEFAULTS.state_space,overrides||{});},
  actionProfile:function(overrides){return merge(DEFAULTS.action_space,overrides||{});},
  episodeProfile:function(overrides){return merge(DEFAULTS.episode,overrides||{});},
  rewardProfile:function(overrides){return merge(DEFAULTS.reward,overrides||{});},
  trainingProfile:function(overrides){return merge(DEFAULTS.training,overrides||{});},
  policyStoreProfile:function(overrides){return merge(DEFAULTS.policy_store,overrides||{});},
  validationProfile:function(overrides){return merge(DEFAULTS.validation,overrides||{});},
  isStatus:function(value,kind){return!!(STATUS[kind]&&STATUS[kind][value]);}
};
})();
