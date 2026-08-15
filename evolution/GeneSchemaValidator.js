/** GeneSchemaValidator.js v3.0 - strict optimization whitelist validation. */
(function(){
var A=window.AGE=window.AGE||{};
var P=A.EvolutionProtocols;
var TYPES={integer:true,number:true,enum:true,boolean:true};

function pathConflict(variablePath,immutablePath){
  var variable=P.normalizePath(variablePath);
  var immutable=P.normalizePath(immutablePath);
  return variable===immutable||variable.indexOf(immutable+'.')===0||immutable.indexOf(variable+'.')===0;
}

function addFinding(findings,code,gene){
  findings.push({
    code:code,
    name:gene&&gene.name||'',
    path:gene&&P.normalizePath(gene.path)||''
  });
}

function numericValid(gene,value,findings){
  var before=findings.length;
  var range=gene.range;
  var step=gene.step;
  if(!Array.isArray(range)||range.length!==2||!P.finite(range[0])||!P.finite(range[1])||range[0]>range[1]){
    addFinding(findings,'GENE_RANGE_INVALID',gene);
    return false;
  }
  if(!P.finite(step)||step<=0){
    addFinding(findings,'GENE_STEP_INVALID',gene);
    return false;
  }
  if(gene.type==='integer'&&(!Number.isInteger(range[0])||!Number.isInteger(range[1])||!Number.isInteger(step))){
    addFinding(findings,'GENE_INTEGER_SCHEMA_INVALID',gene);
  }
  if(!P.finite(value)||(gene.type==='integer'&&!Number.isInteger(value))){
    addFinding(findings,'GENE_BASELINE_TYPE_INVALID',gene);
    return false;
  }
  if(value<range[0]||value>range[1]){
    addFinding(findings,'GENE_BASELINE_OUT_OF_RANGE',gene);
    return false;
  }
  var normalized=range[0]+Math.round((value-range[0])/step)*step;
  var tolerance=Math.max(1e-9,Math.abs(step)*1e-9);
  if(Math.abs(normalized-value)>tolerance)addFinding(findings,'GENE_BASELINE_OFF_GRID',gene);
  return findings.length===before;
}

function enumValid(gene,value,findings){
  var values=gene.values;
  if(!Array.isArray(values)||values.length<2){
    addFinding(findings,'GENE_ENUM_VALUES_INVALID',gene);
    return false;
  }
  var unique={};
  for(var i=0;i<values.length;i++){
    var key=typeof values[i]+':'+JSON.stringify(values[i]);
    if(unique[key]){
      addFinding(findings,'GENE_ENUM_VALUES_INVALID',gene);
      return false;
    }
    unique[key]=true;
  }
  if(values.indexOf(value)<0){
    addFinding(findings,'GENE_BASELINE_ENUM_INVALID',gene);
    return false;
  }
  return true;
}

A.GeneSchemaValidator=function(){};

A.GeneSchemaValidator.prototype.validate=function(baseline,schema){
  schema=schema||{};
  var variables=Array.isArray(schema.variables)?schema.variables:[];
  var immutable=Array.isArray(schema.immutable)?schema.immutable:[];
  var findings=[];
  var valid=[];
  var names={};
  var paths={};

  for(var index=0;index<variables.length;index++){
    var source=variables[index];
    var gene=source&&typeof source==='object'?P.copy(source):{};
    gene.path=P.normalizePath(gene.path);
    var start=findings.length;
    if(!gene.name||typeof gene.name!=='string')addFinding(findings,'GENE_NAME_INVALID',gene);
    else if(names[gene.name])addFinding(findings,'GENE_NAME_DUPLICATE',gene);
    else names[gene.name]=true;
    if(!gene.path)addFinding(findings,'GENE_PATH_INVALID',gene);
    else if(paths[gene.path])addFinding(findings,'GENE_PATH_DUPLICATE',gene);
    else paths[gene.path]=true;
    if(!TYPES[gene.type])addFinding(findings,'GENE_TYPE_UNSUPPORTED',gene);
    if(!P.finite(gene.mutation_rate)||gene.mutation_rate<0||gene.mutation_rate>1){
      addFinding(findings,'GENE_MUTATION_RATE_INVALID',gene);
    }
    if(gene.path&&P.getPath(baseline,gene.path)===undefined)addFinding(findings,'GENE_PATH_MISSING',gene);
    for(var immutableIndex=0;immutableIndex<immutable.length;immutableIndex++){
      if(gene.path&&pathConflict(gene.path,immutable[immutableIndex])){
        addFinding(findings,'GENE_IMMUTABLE_CONFLICT',gene);
        break;
      }
    }

    var value=gene.path?P.getPath(baseline,gene.path):undefined;
    if((gene.type==='integer'||gene.type==='number')&&value!==undefined)numericValid(gene,value,findings);
    else if(gene.type==='enum'&&value!==undefined)enumValid(gene,value,findings);
    else if(gene.type==='boolean'&&value!==undefined&&value!==true&&value!==false){
      addFinding(findings,'GENE_BASELINE_TYPE_INVALID',gene);
    }
    if(findings.length===start)valid.push(gene);
  }

  return{
    valid_genes:valid,
    findings:findings,
    status:valid.length?'valid':'no_valid_genes'
  };
};

A.GeneSchemaValidator.pathConflict=pathConflict;
})();
