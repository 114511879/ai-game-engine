/** DuplicateDetector.js v3.0 - normalized gene-vector duplicate tracking. */
(function(){
var A=window.AGE=window.AGE||{};
var P=A.EvolutionProtocols;

A.DuplicateDetector=function(){
  this._fingerprints=Object.create(null);
};

A.DuplicateDetector.prototype.fingerprint=function(vector){
  return P.geneFingerprint(vector);
};

A.DuplicateDetector.prototype.has=function(vector){
  return this._fingerprints[this.fingerprint(vector)]===true;
};

A.DuplicateDetector.prototype.add=function(vector){
  var fingerprint=this.fingerprint(vector);
  if(this._fingerprints[fingerprint])return false;
  this._fingerprints[fingerprint]=true;
  return true;
};

A.DuplicateDetector.prototype.clear=function(){
  this._fingerprints=Object.create(null);
};
})();
