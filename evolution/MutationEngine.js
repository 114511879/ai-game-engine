/** MutationEngine.js v3.0 - seeded single-step bounded mutation. */
(function(){
var A=window.AGE=window.AGE||{};
var P=A.EvolutionProtocols;

function mutateValue(current,gene,prng){
  if(gene.type==='integer'||gene.type==='number'){
    var direction=prng.pick([-1,1]);
    var next=A.GeneEncoder.normalizeValue(current+direction*gene.step,gene);
    if(next===current)next=A.GeneEncoder.normalizeValue(current-direction*gene.step,gene);
    return next;
  }
  if(gene.type==='enum'){
    return prng.pick(gene.values.filter(function(value){return value!==current;}));
  }
  if(gene.type==='boolean')return!current;
  throw new Error('unsupported_gene_type');
}

A.MutationEngine=function(){};

A.MutationEngine.prototype.mutate=function(vector,schema,options){
  options=options||{};
  var prng=new A.SeededPRNG(options.seed||'');
  var budget=options.max_mutated_variables;
  if(!Number.isInteger(budget)||budget<1)throw new Error('invalid_mutation_budget');
  var genes=(schema||[]).slice().sort(function(a,b){
    return P.normalizePath(a.path).localeCompare(P.normalizePath(b.path));
  });
  if(!genes.length)throw new Error('no_mutable_genes');
  var triggered=[];
  genes.forEach(function(gene){
    if(prng.next()<gene.mutation_rate)triggered.push(gene);
  });
  var triggeredCount=triggered.length;
  var applied=triggered.length?triggered:[prng.pick(genes)];
  if(applied.length>budget)applied=prng.sample(applied,budget);
  var appliedPaths={};
  applied.forEach(function(gene){appliedPaths[P.normalizePath(gene.path)]=gene;});

  var output=P.copy(vector||[]).sort(function(a,b){
    return P.normalizePath(a.path).localeCompare(P.normalizePath(b.path));
  });
  var entries={};
  output.forEach(function(entry){entries[P.normalizePath(entry.path)]=entry;});
  var changes=[];
  Object.keys(appliedPaths).sort().forEach(function(path){
    var gene=appliedPaths[path];
    var entry=entries[path];
    if(!entry)throw new Error('gene_vector_path_missing:'+path);
    var oldValue=entry.value;
    var newValue=mutateValue(oldValue,gene,prng);
    entry.value=newValue;
    if(P.canonical(oldValue)!==P.canonical(newValue)){
      changes.push({
        name:gene.name,
        path:path,
        old:oldValue,
        new:newValue,
        importance:gene.importance
      });
    }
  });

  return{
    gene_vector:output,
    changes:changes,
    triggered_genes:triggeredCount,
    applied_mutations:changes.length
  };
};
})();
