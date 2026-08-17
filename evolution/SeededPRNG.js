/** SeededPRNG.js v3.0 - FNV-1a seeded Mulberry32 random source. */
(function(){
var A=window.AGE=window.AGE||{};
var P=A.EvolutionProtocols;

A.SeededPRNG=function(seed){
  this.seed=String(seed);
  this.state=parseInt(P.fnv1a(this.seed),16)>>>0;
};

A.SeededPRNG.prototype.next=function(){
  var t=this.state+=0x6D2B79F5;
  t=Math.imul(t^t>>>15,t|1);
  t^=t+Math.imul(t^t>>>7,t|61);
  return((t^t>>>14)>>>0)/4294967296;
};

A.SeededPRNG.prototype.pick=function(values){
  if(!values||!values.length)throw new Error('seeded_pick_empty');
  return values[Math.floor(this.next()*values.length)];
};

A.SeededPRNG.prototype.sample=function(values,count){
  var pool=(values||[]).slice();
  var out=[];
  while(out.length<count&&pool.length){
    out.push(pool.splice(Math.floor(this.next()*pool.length),1)[0]);
  }
  return out;
};

A.SeededPRNG.prototype.derive=function(suffix){
  return new A.SeededPRNG(this.seed+String(suffix));
};
})();
