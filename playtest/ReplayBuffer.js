/** ReplayBuffer.js v4.0 - stratified FIFO canonical transition buffer. */
(function(){
var A=window.AGE=window.AGE||{};
var STRATA=['confirmed','negative_evidence','exploration'];

function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
function validStratum(value){return STRATA.indexOf(value)>=0;}

A.ReplayBuffer=function(options){
  options=options||{};
  this.max_transitions=Number.isInteger(options.max_transitions)?options.max_transitions:10000;
  this.max_source_runs=Number.isInteger(options.max_source_runs)?options.max_source_runs:50;
  this.sample_repetition=Object.assign({confirmed:4,negative_evidence:2,exploration:1},options.sample_repetition||{});
  this.layers={confirmed:[],negative_evidence:[],exploration:[]};
};

A.ReplayBuffer.prototype._layerLimit=function(){return Math.max(1,Math.floor(this.max_transitions/STRATA.length));};

A.ReplayBuffer.prototype.append=function(transition){
  transition=transition&&typeof transition==='object'?transition:null;
  if(!transition||transition.status==='incomplete'||transition.eligible===false)return false;
  if(!transition.state_id||!transition.action_id||!transition.next_state_id)return false;
  var stratum=validStratum(transition.stratum)?transition.stratum:'exploration';
  var row={
    transition_id:transition.transition_id||'',
    state_id:String(transition.state_id),
    action_id:String(transition.action_id),
    reward:typeof transition.reward==='number'&&isFinite(transition.reward)?transition.reward:0,
    next_state_id:String(transition.next_state_id),
    terminal:transition.terminal===true,
    trajectory_id:transition.trajectory_id||null,
    finding_id:transition.finding_id||null,
    reward_ledger_ref:transition.reward_ledger_ref||null,
    source_run_id:transition.source_run_id||null,
    stratum:stratum
  };
  var layer=this.layers[stratum];
  layer.push(row);
  while(layer.length>this._layerLimit())layer.shift();
  return true;
};

A.ReplayBuffer.prototype.all=function(){
  var rows=[];
  STRATA.forEach(function(stratum){rows=rows.concat(this.layers[stratum]);},this);
  return rows.map(copy);
};

A.ReplayBuffer.prototype.snapshot=function(){return{layers:copy(this.layers)};};

A.ReplayBuffer.prototype.restore=function(snapshot){
  snapshot=snapshot&&snapshot.layers?snapshot:{layers:{}};
  this.layers={confirmed:[],negative_evidence:[],exploration:[]};
  var self=this;
  STRATA.forEach(function(stratum){
    var rows=Array.isArray(snapshot.layers[stratum])?snapshot.layers[stratum]:[];
    rows.forEach(function(row){self.append(row);});
  });
  return this.snapshot();
};

A.ReplayBuffer.prototype.trainingSequence=function(seed){
  var output=[];
  var self=this;
  STRATA.forEach(function(stratum){
    var rows=self.layers[stratum].map(copy);
    var shuffled;
    if(A.SeededPRNG){
      shuffled=new A.SeededPRNG(String(seed)+':'+stratum).sample(rows,rows.length);
    }else{
      shuffled=rows.slice().sort(function(a,b){return String(a.transition_id).localeCompare(String(b.transition_id));});
    }
    var repeat=Math.max(1,Number(self.sample_repetition[stratum])||1);
    for(var count=0;count<repeat;count++)output=output.concat(shuffled.map(copy));
  });
  return output;
};
})();
