/** CrossoverEngine.js v3.0 - seeded uniform gene crossover. */
(function(){
var A=window.AGE=window.AGE||{};
var P=A.EvolutionProtocols;

A.CrossoverEngine=function(){};

A.CrossoverEngine.prototype.cross=function(parentA,parentB,options){
  options=options||{};
  var prng=new A.SeededPRNG(options.seed||'');
  var left={};
  var right={};
  (parentA||[]).forEach(function(gene){left[P.normalizePath(gene.path)]=gene;});
  (parentB||[]).forEach(function(gene){right[P.normalizePath(gene.path)]=gene;});
  var paths=Object.keys(left).sort();
  if(paths.length!==Object.keys(right).length)throw new Error('crossover_gene_mismatch');
  return paths.map(function(path){
    if(!right[path])throw new Error('crossover_gene_mismatch');
    return P.copy(prng.next()<0.5?left[path]:right[path]);
  });
};
})();
