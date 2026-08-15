/** GeneEncoder.js v3.0 - normalized gene vectors and safe DSL application. */
(function(){
var A=window.AGE=window.AGE||{};
var P=A.EvolutionProtocols;

function precisionFor(step){
  var text=String(step).toLowerCase();
  if(text.indexOf('e-')>=0)return parseInt(text.split('e-')[1],10)||0;
  return(text.split('.')[1]||'').length;
}

function normalizeNumber(value,gene){
  if(!P.finite(value))throw new Error('invalid_gene_value');
  var min=gene.range[0];
  var step=gene.step;
  var normalized=min+Math.round((value-min)/step)*step;
  normalized=Math.max(min,Math.min(gene.range[1],normalized));
  if(gene.type==='integer')return Math.round(normalized);
  return Number(normalized.toFixed(precisionFor(step)));
}

function normalizeValue(value,gene){
  if(gene.type==='integer'||gene.type==='number')return normalizeNumber(value,gene);
  if(gene.type==='enum'){
    if(!Array.isArray(gene.values)||gene.values.indexOf(value)<0)throw new Error('invalid_gene_value');
    return value;
  }
  if(gene.type==='boolean'){
    if(value!==true&&value!==false)throw new Error('invalid_gene_value');
    return value;
  }
  throw new Error('unsupported_gene_type');
}

function encode(dsl,genes){
  return(genes||[]).map(function(gene){
    return{
      name:gene.name,
      path:P.normalizePath(gene.path),
      type:gene.type,
      value:normalizeValue(P.getPath(dsl,gene.path),gene),
      importance:gene.importance
    };
  }).sort(function(a,b){return a.path.localeCompare(b.path);});
}

function apply(baseline,genes,vector){
  var byPath={};
  (genes||[]).forEach(function(gene){byPath[P.normalizePath(gene.path)]=gene;});
  var dsl=P.copy(baseline);
  var normalized=[];
  var changes=[];
  var seen={};

  (vector||[]).forEach(function(entry){
    var path=P.normalizePath(entry.path);
    var gene=byPath[path];
    if(!gene)throw new Error('undeclared_gene_path:'+path);
    if(seen[path])throw new Error('duplicate_gene_path:'+path);
    seen[path]=true;
    var oldValue=P.getPath(baseline,path);
    var newValue=normalizeValue(entry.value,gene);
    P.setPath(dsl,path,newValue);
    normalized.push({
      name:gene.name,
      path:path,
      type:gene.type,
      value:newValue,
      importance:gene.importance
    });
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

  normalized.sort(function(a,b){return a.path.localeCompare(b.path);});
  changes.sort(function(a,b){return a.path.localeCompare(b.path);});
  return{dsl:dsl,gene_vector:normalized,changes:changes};
}

A.GeneEncoder={
  encode:encode,
  apply:apply,
  normalizeValue:normalizeValue,
  normalizeNumber:normalizeNumber
};
})();
