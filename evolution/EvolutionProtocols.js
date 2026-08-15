/** EvolutionProtocols.js v3.0 - deterministic shared evolution contracts. */
(function(){
var A=window.AGE=window.AGE||{};
var VERSION='3.0';

function copy(value){
  return value===undefined?undefined:JSON.parse(JSON.stringify(value));
}

function finite(value){
  return typeof value==='number'&&isFinite(value);
}

function canonical(value){
  if(Array.isArray(value))return'['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object'){
    return'{'+Object.keys(value).sort().map(function(key){
      return JSON.stringify(key)+':'+canonical(value[key]);
    }).join(',')+'}';
  }
  return JSON.stringify(value);
}

function fnv1a(text){
  var bytes=new TextEncoder().encode(String(text));
  var hash=0x811c9dc5;
  for(var i=0;i<bytes.length;i++){
    hash^=bytes[i];
    hash=Math.imul(hash,0x01000193)>>>0;
  }
  return('00000000'+hash.toString(16)).slice(-8);
}

function normalizePath(path){
  return String(path||'').split('.').filter(Boolean).join('.');
}

function getPath(root,path){
  return normalizePath(path).split('.').reduce(function(value,key){
    return value==null?undefined:value[key];
  },root);
}

function setPath(root,path,value){
  var keys=normalizePath(path).split('.');
  var target=root;
  for(var i=0;i<keys.length-1;i++)target=target[keys[i]];
  target[keys[keys.length-1]]=value;
  return root;
}

function scopeHash(scope){
  scope=scope||{};
  var normalized={
    schema_version:VERSION,
    builder_version:scope.builder_version||VERSION,
    engine_capability_version:scope.engine_capability_version||'1.0',
    immutable:(scope.immutable||[]).map(normalizePath).sort(),
    variables:(scope.variables||[]).map(copy).sort(function(a,b){
      return normalizePath(a.path).localeCompare(normalizePath(b.path));
    })
  };
  return'ga3:'+fnv1a(canonical(normalized));
}

function geneFingerprint(vector){
  var normalized=(vector||[]).map(function(gene){
    return{path:normalizePath(gene.path),value:gene.value};
  }).sort(function(a,b){return a.path.localeCompare(b.path);});
  return'genes:'+fnv1a(canonical(normalized));
}

A.EvolutionProtocols={
  VERSION:VERSION,
  copy:copy,
  finite:finite,
  canonical:canonical,
  fnv1a:fnv1a,
  normalizePath:normalizePath,
  getPath:getPath,
  setPath:setPath,
  scopeHash:scopeHash,
  geneFingerprint:geneFingerprint
};
})();
