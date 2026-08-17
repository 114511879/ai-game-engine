/** SelectionEngine.js v3.0 - deterministic ranking, tournament, and elitism. */
(function(){
var A=window.AGE=window.AGE||{};
var P=A.EvolutionProtocols;

function fitnessRecord(candidate){
  return candidate&&candidate.fitness_result||candidate&&candidate.fitness||{};
}

function finalFitness(candidate){
  var record=fitnessRecord(candidate);
  return P.finite(record.final_fitness)?record.final_fitness:-Infinity;
}

function confidence(candidate){
  var record=fitnessRecord(candidate);
  var overall=record.confidence&&record.confidence.overall;
  return P.finite(overall)?overall:0;
}

function changeCount(candidate){
  return candidate&&Array.isArray(candidate.changes)?candidate.changes.length:0;
}

function compare(a,b){
  var difference=finalFitness(b)-finalFitness(a);
  if(difference)return difference;
  difference=confidence(b)-confidence(a);
  if(difference)return difference;
  difference=changeCount(a)-changeCount(b);
  if(difference)return difference;
  return String(a&&a.candidate_id||'').localeCompare(String(b&&b.candidate_id||''));
}

A.SelectionEngine=function(){};

A.SelectionEngine.prototype.sort=function(population){
  return(population||[]).slice().sort(compare);
};

A.SelectionEngine.prototype.tournament=function(population,options){
  options=options||{};
  var size=options.size||3;
  if(!population||!population.length||size<1)throw new Error('invalid_tournament');
  var prng=new A.SeededPRNG(options.seed||'');
  var sampled=prng.sample(population,Math.min(size,population.length));
  return this.sort(sampled)[0];
};

A.SelectionEngine.prototype.elites=function(population,count){
  return this.sort(population).slice(0,count).map(P.copy);
};

A.SelectionEngine.compare=compare;
})();
