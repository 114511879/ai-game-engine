/** GeneticOptimizer.js v3.0 - pure deterministic population evolution. */
(function(){
var A=window.AGE=window.AGE||{};
var P=A.EvolutionProtocols;

function stats(reused){
  return{
    generated_attempts:0,
    duplicates_rejected:0,
    evaluated_candidates:0,
    reused_candidates:reused||0,
    failed_candidates:0
  };
}

function candidateSeed(runSeed,generation,index,retry){
  var seed=String(runSeed)+':g'+generation+':c'+index;
  return retry?seed+':retry'+retry:seed;
}

function pendingCandidate(generation,index,seed,mutation,lineage,parentIds,detector){
  return{
    generation:generation,
    candidate_id:'g'+generation+'-c'+index,
    candidate_seed:seed,
    lineage:lineage,
    parent_ids:(parentIds||[]).slice(),
    gene_vector:mutation.gene_vector,
    changes:mutation.changes,
    triggered_genes:mutation.triggered_genes,
    applied_mutations:mutation.applied_mutations,
    fingerprint:detector.fingerprint(mutation.gene_vector),
    status:'pending'
  };
}

A.GeneticOptimizer=function(dependencies){
  dependencies=dependencies||{};
  this.mutation=dependencies.mutation||new A.MutationEngine();
  this.crossover=dependencies.crossover||new A.CrossoverEngine();
  this.selection=dependencies.selection||new A.SelectionEngine();
  this.createDuplicateDetector=dependencies.createDuplicateDetector||function(){return new A.DuplicateDetector();};
};

A.GeneticOptimizer.prototype.createInitialPopulation=function(options){
  options=options||{};
  var profile=options.profile;
  var detector=this.createDuplicateDetector();
  var generationStats=stats(1);
  var baseline=P.copy(options.baselineGeneVector||[]);
  var candidates=[{
    generation:0,
    candidate_id:'g0-c0',
    candidate_seed:candidateSeed(options.runSeed,0,0,0),
    lineage:'baseline',
    parent_ids:[],
    gene_vector:baseline,
    changes:[],
    fingerprint:detector.fingerprint(baseline),
    status:'baseline_reuse'
  }];
  detector.add(baseline);

  for(var index=1;index<profile.population_size;index++){
    var accepted=null;
    var last=null;
    for(var retry=0;retry<=profile.max_duplicate_retries;retry++){
      var seed=candidateSeed(options.runSeed,0,index,retry);
      var mutation=this.mutation.mutate(baseline,options.geneSchema,{
        seed:seed,
        max_mutated_variables:profile.max_mutated_variables
      });
      generationStats.generated_attempts++;
      last=pendingCandidate(0,index,seed,mutation,'mutation',['g0-c0'],detector);
      if(detector.add(mutation.gene_vector)){
        accepted=last;
        break;
      }
      generationStats.duplicates_rejected++;
    }
    if(!accepted){
      last.status='duplicate_exhausted';
      generationStats.failed_candidates++;
      accepted=last;
    }
    candidates.push(accepted);
  }
  return{generation:0,candidates:candidates,stats:generationStats};
};

A.GeneticOptimizer.prototype._offspring=function(population,geneSchema,profile,seed,generation,index,detector){
  var parentA=this.selection.tournament(population,{seed:seed+':parentA',size:profile.selection.tournament_size});
  var parentB=this.selection.tournament(population,{seed:seed+':parentB',size:profile.selection.tournament_size});
  var doCrossover=new A.SeededPRNG(seed+':crossover-rate').next()<profile.crossover.rate;
  var baseVector;
  if(doCrossover){
    baseVector=this.crossover.cross(parentA.gene_vector,parentB.gene_vector,{seed:seed+':crossover'});
  }else{
    baseVector=P.copy(this.selection.sort([parentA,parentB])[0].gene_vector);
  }
  var mutation=this.mutation.mutate(baseVector,geneSchema,{
    seed:seed+':mutation',
    max_mutated_variables:profile.max_mutated_variables
  });
  return pendingCandidate(
    generation,
    index,
    seed,
    mutation,
    'offspring',
    [parentA.candidate_id,parentB.candidate_id],
    detector
  );
};

A.GeneticOptimizer.prototype.nextGeneration=function(options){
  options=options||{};
  var generation=options.generation;
  var profile=options.profile;
  if(!Number.isInteger(generation)||generation<1||generation>=profile.max_generations){
    throw new Error('invalid_generation');
  }
  var population=options.evaluatedPopulation||[];
  if(population.length<profile.elite_count)throw new Error('insufficient_population');
  var detector=this.createDuplicateDetector();
  var eliteSources=this.selection.sort(population).slice(0,profile.elite_count);
  var candidates=[];
  var generationStats=stats(profile.elite_count);

  for(var eliteIndex=0;eliteIndex<eliteSources.length;eliteIndex++){
    var elite=P.copy(eliteSources[eliteIndex]);
    elite.generation=generation;
    elite.candidate_id='g'+generation+'-c'+eliteIndex;
    elite.candidate_seed=candidateSeed(options.runSeed,generation,eliteIndex,0);
    elite.lineage='elite';
    elite.parent_ids=[eliteSources[eliteIndex].candidate_id];
    elite.status='reused';
    elite.fingerprint=detector.fingerprint(elite.gene_vector);
    detector.add(elite.gene_vector);
    candidates.push(elite);
  }

  for(var index=profile.elite_count;index<profile.population_size;index++){
    var accepted=null;
    var last=null;
    for(var retry=0;retry<=profile.max_duplicate_retries;retry++){
      var seed=candidateSeed(options.runSeed,generation,index,retry);
      last=this._offspring(population,options.geneSchema,profile,seed,generation,index,detector);
      generationStats.generated_attempts++;
      if(detector.add(last.gene_vector)){
        accepted=last;
        break;
      }
      generationStats.duplicates_rejected++;
    }
    if(!accepted){
      last.status='duplicate_exhausted';
      generationStats.failed_candidates++;
      accepted=last;
    }
    candidates.push(accepted);
  }
  return{generation:generation,candidates:candidates,stats:generationStats};
};
})();
