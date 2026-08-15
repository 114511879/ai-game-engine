/** EvolutionRunner.js v3.0 - bounded sequential evolution orchestration. */
(function(){
var A=window.AGE=window.AGE||{};
var P=A.EvolutionProtocols;

function fitnessValue(candidate){
  var value=candidate&&candidate.fitness_result&&candidate.fitness_result.final_fitness;
  return P.finite(value)?value:-Infinity;
}

function validFitness(fitness){
  return fitness&&fitness.schema_version==='2.0'&&P.finite(fitness.final_fitness)&&fitness.final_fitness>=0&&fitness.final_fitness<=1;
}

function qaPassed(qa){
  if(!qa||qa.admitted!==true)return false;
  return!qa.semantic_qa||qa.semantic_qa.status==='passed';
}

function errorData(error){
  return error?{name:error.name||'Error',message:error.message||String(error),code:error.code||''}:null;
}

A.EvolutionRunner=function(dependencies){
  dependencies=dependencies||{};
  this.optimizer=dependencies.optimizer;
  this.evaluator=dependencies.evaluator;
  this.memory=dependencies.memory;
  this.schemaValidator=dependencies.schemaValidator;
  this.schemaBuilder=dependencies.schemaBuilder;
  this.finalQA=dependencies.finalQA;
  this.selection=dependencies.selection||new A.SelectionEngine();
  this.engineAdapter=dependencies.engineAdapter||null;
  this.onStatus=dependencies.onStatus||function(){};
  this.clock=dependencies.clock||function(){return Date.now();};
};

A.EvolutionRunner.prototype._emit=function(status){
  try{this.onStatus(P.copy(status));}catch(error){}
};

A.EvolutionRunner.prototype._restoreBaseline=async function(baselineDSL){
  var engine=this.engineAdapter;
  if(!engine)return;
  if(typeof engine.restoreBaseline==='function'){
    await engine.restoreBaseline(baselineDSL);
    return;
  }
  if(typeof engine.teardown==='function')await engine.teardown();
  if(typeof engine.reset==='function')await engine.reset();
  if(typeof engine.load==='function')await engine.load(baselineDSL);
};

A.EvolutionRunner.prototype.runEvolution=async function(baselineDSL,options){
  options=options||{};
  var runner=this;
  var gameId=options.game_id||baselineDSL&&baselineDSL.meta&&baselineDSL.meta.game_id||'unknown-game';
  var runSeed=String(options.random_seed||options.run_id||('ga-'+gameId+'-run'));
  var result={
    schema_version:'3.0',
    run_id:String(options.run_id||runSeed),
    status:'rejected',
    game_id:String(gameId),
    run_seed:runSeed,
    optimization_scope_hash:'',
    baseline:{
      version_id:options.baseline_version||'',
      fitness:validFitness(options.baseline_fitness)?options.baseline_fitness.final_fitness:null,
      fitness_result:validFitness(options.baseline_fitness)?P.copy(options.baseline_fitness):null
    },
    best_candidate:null,
    best_candidate_so_far:null,
    generations:[],
    optimization_trace:[],
    generation_stats:[],
    promotion:{status:'not_requested'},
    stopped_reason:'internal_error',
    created_at:this.clock()
  };
  var profile=null;
  var schema=null;
  var validGenes=[];
  var allCandidates=[];
  var evaluatedCount=0;
  var failedCount=0;
  var stop=false;
  var currentCandidateId='';

  function cancelAt(generation,candidateId){
    result.status='completed';
    result.stopped_reason='cancelled';
    result.cancelled_at={generation:generation,candidate_id:candidateId||currentCandidateId||''};
    stop=true;
  }

  function bestFrom(candidates){
    var eligible=candidates.filter(function(candidate){return validFitness(candidate.fitness_result);});
    return eligible.length?runner.selection.sort(eligible)[0]:null;
  }

  try{
    if(!validFitness(options.baseline_fitness)){
      result.stopped_reason='baseline_fitness_required';
      return result;
    }
    if(!qaPassed(options.baseline_qa)){
      result.stopped_reason='baseline_qa_required';
      return result;
    }
    if(options.signal&&options.signal.aborted){cancelAt(0,'');return result;}

    profile=options.profile&&typeof options.profile==='object'?P.copy(options.profile):A.EvolutionProfiles.resolve(options.profile||'default_ga_v3');
    schema=baselineDSL&&baselineDSL.optimization&&Array.isArray(baselineDSL.optimization.variables)
      ?P.copy(baselineDSL.optimization)
      :this.schemaBuilder.build(baselineDSL,{profile:profile.profile,engine_capability_version:options.engine_capability_version||'1.0'});
    result.optimization_scope_hash=P.scopeHash(schema);
    var admittedScope=options.baseline_qa.semantic_qa&&options.baseline_qa.semantic_qa.optimization_scope_hash;
    if(admittedScope&&admittedScope!==result.optimization_scope_hash){
      result.stopped_reason='optimization_scope_changed';
      return result;
    }
    var validation=this.schemaValidator.validate(baselineDSL,schema);
    result.schema_findings=P.copy(validation.findings);
    validGenes=validation.valid_genes;
    if(!validGenes.length){
      result.stopped_reason='no_valid_genes';
      return result;
    }
    if(Number.isInteger(schema.max_mutated_variables)&&schema.max_mutated_variables>0){
      profile.max_mutated_variables=Math.min(profile.max_mutated_variables,schema.max_mutated_variables);
    }

    var baselineVector=A.GeneEncoder.encode(baselineDSL,validGenes);
    var populationResult=this.optimizer.createInitialPopulation({
      baselineGeneVector:baselineVector,
      geneSchema:validGenes,
      profile:profile,
      runSeed:runSeed
    });
    var previousBest=options.baseline_fitness.final_fitness;
    var stagnant=0;

    for(var generation=0;generation<profile.max_generations&&!stop;generation++){
      if(options.signal&&options.signal.aborted){cancelAt(generation,'');break;}
      this._emit({stage:'generation',generation:generation,candidate_id:'',baseline_fitness:options.baseline_fitness.final_fitness});
      var candidates=populationResult.candidates;
      var generationEvaluated=0;
      var generationFailed=0;

      for(var index=0;index<candidates.length;index++){
        var candidate=candidates[index];
        currentCandidateId=candidate.candidate_id;
        if(options.signal&&options.signal.aborted){cancelAt(generation,candidate.candidate_id);break;}
        if(candidate.lineage==='baseline'){
          candidate.status='reused';
          candidate.dsl=P.copy(baselineDSL);
          candidate.qa=P.copy(options.baseline_qa);
          candidate.evaluation=P.copy(options.baseline_evaluation||null);
          candidate.fitness_result=P.copy(options.baseline_fitness);
          allCandidates.push(candidate);
          continue;
        }
        if(candidate.lineage==='elite'&&validFitness(candidate.fitness_result)){
          candidate.status='reused';
          allCandidates.push(candidate);
          continue;
        }
        if(candidate.status==='duplicate_exhausted'){
          allCandidates.push(candidate);
          result.optimization_trace.push({generation:generation,candidate_id:candidate.candidate_id,candidate_seed:candidate.candidate_seed,status:'duplicate_exhausted',gene_vector:P.copy(candidate.gene_vector),changes:P.copy(candidate.changes)});
          failedCount++;
          generationFailed++;
          if(failedCount>profile.max_failed_candidates){
            result.status='failed';
            result.stopped_reason='failure_budget_exceeded';
            stop=true;
            break;
          }
          continue;
        }
        if(evaluatedCount>=profile.max_candidates){
          result.status='completed';
          result.stopped_reason='candidate_budget_exhausted';
          stop=true;
          break;
        }

        var applied=A.GeneEncoder.apply(baselineDSL,validGenes,candidate.gene_vector);
        candidate.dsl=applied.dsl;
        candidate.gene_vector=applied.gene_vector;
        candidate.changes=applied.changes;
        this._emit({
          stage:'candidate',generation:generation,candidate_id:candidate.candidate_id,
          baseline_fitness:options.baseline_fitness.final_fitness,
          best_fitness:result.best_candidate_so_far&&result.best_candidate_so_far.fitness||options.baseline_fitness.final_fitness
        });
        var evaluation=await this.evaluator.evaluate(candidate.dsl,{
          candidate_id:candidate.candidate_id,
          candidate_seed:candidate.candidate_seed,
          intent:options.intent,
          blueprint:options.blueprint,
          optimization_scope_hash:result.optimization_scope_hash,
          persona:profile.evaluation.persona,
          episodes:profile.episodes_per_candidate,
          timeout_ms:profile.candidate_timeout_ms,
          fitness_profile:options.fitness_profile||'default_v2',
          game_id:gameId,
          runtime_metrics:options.runtime_metrics||{},
          trend:options.trend||{},
          blueprint_metadata:options.blueprint_metadata,
          deterministic:options.deterministic===true,
          signal:options.signal
        });
        evaluatedCount++;
        generationEvaluated++;
        candidate.qa=evaluation.qa;
        candidate.evaluation=evaluation.evaluation;
        candidate.runtime=evaluation.runtime;
        candidate.fitness_result=evaluation.fitness;
        candidate.simulation_deterministic=evaluation.simulation_deterministic===true;
        candidate.status=evaluation.status;
        if(evaluation.status!=='evaluated'){
          failedCount++;
          generationFailed++;
        }
        allCandidates.push(candidate);
        result.optimization_trace.push({
          run_seed:runSeed,candidate_seed:candidate.candidate_seed,generation:generation,
          candidate_id:candidate.candidate_id,lineage:candidate.lineage,parent_ids:P.copy(candidate.parent_ids||[]),
          gene_vector:P.copy(candidate.gene_vector),changes:P.copy(candidate.changes),qa:P.copy(candidate.qa),
          evaluation:P.copy(candidate.evaluation),fitness:P.copy(candidate.fitness_result),status:candidate.status
        });
        var currentBest=bestFrom(allCandidates);
        if(currentBest){
          result.best_candidate_so_far={candidate_id:currentBest.candidate_id,fitness:fitnessValue(currentBest)};
        }
        this._emit({
          stage:'candidate_complete',generation:generation,candidate_id:candidate.candidate_id,
          current_fitness:fitnessValue(candidate),best_fitness:currentBest?fitnessValue(currentBest):options.baseline_fitness.final_fitness,
          baseline_fitness:options.baseline_fitness.final_fitness
        });
        if(options.signal&&options.signal.aborted){cancelAt(generation,candidate.candidate_id);break;}
        if(failedCount>profile.max_failed_candidates){
          result.status='failed';
          result.stopped_reason='failure_budget_exceeded';
          stop=true;
          break;
        }
      }

      populationResult.stats.evaluated_candidates=generationEvaluated;
      populationResult.stats.failed_candidates=generationFailed;
      result.generations.push(P.copy(populationResult));
      result.generation_stats.push(P.copy(populationResult.stats));
      var validPopulation=candidates.filter(function(candidate){return validFitness(candidate.fitness_result);});
      var generationBest=bestFrom(validPopulation);
      if(generationBest){
        var improvement=fitnessValue(generationBest)-previousBest;
        if(improvement<profile.early_stop.min_improvement)stagnant++;else stagnant=0;
        previousBest=Math.max(previousBest,fitnessValue(generationBest));
      }else stagnant++;
      if(stop)break;
      if(stagnant>=profile.early_stop.patience){
        result.status='completed';
        result.stopped_reason='early_stop';
        break;
      }
      if(generation===profile.max_generations-1){
        result.status='completed';
        result.stopped_reason='max_generations';
        break;
      }
      if(validPopulation.length<profile.elite_count){
        result.status='failed';
        result.stopped_reason='failure_budget_exceeded';
        break;
      }
      populationResult=this.optimizer.nextGeneration({
        generation:generation+1,
        evaluatedPopulation:validPopulation,
        geneSchema:validGenes,
        profile:profile,
        runSeed:runSeed
      });
    }

    var ranked=this.selection.sort(allCandidates.filter(function(candidate){
      return validFitness(candidate.fitness_result)&&candidate.changes&&candidate.changes.length&&fitnessValue(candidate)>options.baseline_fitness.final_fitness;
    }));
    if(ranked.length){
      result.best_candidate_so_far={candidate_id:ranked[0].candidate_id,fitness:fitnessValue(ranked[0])};
    }
    if(result.stopped_reason!=='cancelled'){
      for(var rank=0;rank<ranked.length;rank++){
        var finalCandidate=ranked[rank];
        var outputQA=this.finalQA&&typeof this.finalQA.validate==='function'
          ?await Promise.resolve(this.finalQA.validate(finalCandidate.dsl,options.intent,options.blueprint))
          :{admitted:true,findings:[]};
        if(outputQA&&outputQA.admitted===true){
          result.best_candidate={
            candidate_id:finalCandidate.candidate_id,
            candidate_seed:finalCandidate.candidate_seed,
            fitness:fitnessValue(finalCandidate),
            fitness_delta:fitnessValue(finalCandidate)-options.baseline_fitness.final_fitness,
            evaluation:P.copy(finalCandidate.evaluation),
            fitness_result:P.copy(finalCandidate.fitness_result),
            qa:P.copy(outputQA),
            gene_vector:P.copy(finalCandidate.gene_vector),
            changes:P.copy(finalCandidate.changes),
            dsl:P.copy(finalCandidate.dsl)
          };
          break;
        }
      }
    }
    if(result.status==='rejected'&&result.stopped_reason==='internal_error'){
      result.status='completed';
      result.stopped_reason='max_generations';
    }
  }catch(error){
    result.status='failed';
    result.stopped_reason='internal_error';
    result.error=errorData(error);
  }finally{
    try{
      await this._restoreBaseline(baselineDSL);
    }catch(restoreError){
      result.status='failed';
      result.stopped_reason='internal_error';
      result.error=errorData(restoreError);
    }
    try{
      if(this.memory)this.memory.append(result);
    }catch(memoryError){
      result.status='failed';
      result.stopped_reason='internal_error';
      result.error=errorData(memoryError);
    }
  }
  return result;
};
})();
