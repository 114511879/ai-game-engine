/** EngineAdapter.js v4.0 - narrow Engine lifecycle and observation boundary. */
(function(){
var A=window.AGE=window.AGE||{};

A.EngineAdapter=function(options){
  options=options||{};
  this.engine=options.engine||null;
  this._reset=options.reset;
  this._load=options.load;
  this._teardown=options.teardown;
  this._release=options.releaseAllInputs;
  this._normalize=options.normalizeObservation;
};
A.EngineAdapter.prototype.reset=async function(){
  if(typeof this._reset==='function')return this._reset();
  if(this.engine&&typeof this.engine.reset==='function')return this.engine.reset();
};
A.EngineAdapter.prototype.load=async function(dsl){
  if(typeof this._load==='function')return this._load(dsl);
  if(this.engine&&typeof this.engine.load==='function')return this.engine.load(dsl);
};
A.EngineAdapter.prototype.teardown=async function(){
  if(typeof this._teardown==='function')return this._teardown();
  if(this.engine&&typeof this.engine.teardown==='function')return this.engine.teardown();
};
A.EngineAdapter.prototype.releaseAllInputs=async function(){
  if(typeof this._release==='function')return this._release();
  if(this.engine&&typeof this.engine.releaseAllInputs==='function')return this.engine.releaseAllInputs();
};
A.EngineAdapter.prototype.restoreCheckpoint=async function(checkpoint,dsl){
  await this.reset();
  if(dsl!==undefined)await this.load(dsl);
  if(checkpoint&&typeof checkpoint.restore==='function')await checkpoint.restore(this.engine);
  await this.releaseAllInputs();
};
A.EngineAdapter.prototype.normalizeObservation=function(input){
  if(typeof this._normalize==='function')return this._normalize(input);
  return input||{};
};
})();
