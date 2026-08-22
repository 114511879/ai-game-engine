/** QLearningTrainer.js v4.0 - deterministic offline tabular Q-Learning. */
(function(){
var A=window.AGE=window.AGE||{};
var STRATA=['confirmed','negative_evidence','exploration'];

function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
function finite(value,fallback){return typeof value==='number'&&isFinite(value)?value:fallback;}
function fnv1a(value){
  if(A.EvolutionProtocols&&typeof A.EvolutionProtocols.fnv1a==='function')return A.EvolutionProtocols.fnv1a(value);
  var hash=0x811c9dc5,text=String(value);
  for(var i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,0x01000193)>>>0;}
  return('00000000'+hash.toString(16)).slice(-8);
}
function sorted(value){
  if(Array.isArray(value))return value.map(sorted);
  if(value&&typeof value==='object'){
    var output={};
    Object.keys(value).sort().forEach(function(key){output[key]=sorted(value[key]);});
    return output;
  }
  return value;
}

function shuffled(rows,seed){
  var copyRows=rows.map(copy);
  if(A.SeededPRNG)return new A.SeededPRNG(seed).sample(copyRows,copyRows.length);
  return copyRows.sort(function(a,b){return String(a.transition_id).localeCompare(String(b.transition_id));});
}

A.QLearningTrainer=function(){};

A.QLearningTrainer.prototype.train=function(input){
  input=input||{};
  var parent=input.parent_policy||{};
  var snapshot=input.dataset_snapshot||{};
  var profile=input.training_profile||{};
  var alpha=finite(profile.alpha,0.1);
  var gamma=finite(profile.gamma,0.95);
  var maxEpochs=Math.max(0,Number(profile.epochs_per_run)||3);
  var maxUpdates=Math.max(0,Number(profile.max_updates_per_run)||5000);
  var repetition=Object.assign({confirmed:4,negative_evidence:2,exploration:1},profile.sample_repetition||{});
  var q=copy(parent.q_table||{});
  var grouped={confirmed:[],negative_evidence:[],exploration:[]};
  (Array.isArray(snapshot.transitions)?snapshot.transitions:[]).forEach(function(row){
    if(grouped[row.stratum])grouped[row.stratum].push(copy(row));
  });
  var sequences={};
  STRATA.forEach(function(stratum){
    var rows=shuffled(grouped[stratum],String(input.training_seed||'')+':'+stratum);
    var expanded=[];
    var count=Math.max(1,Number(repetition[stratum])||1);
    for(var i=0;i<count;i++)expanded=expanded.concat(rows.map(copy));
    sequences[stratum]=expanded;
  });
  var updates=0,epochs=0,stopped='max_epochs';
  var hasData=STRATA.some(function(stratum){return sequences[stratum].length>0;});
  if(!hasData)stopped='no_training_data';
  for(var epoch=0;epoch<maxEpochs&&updates<maxUpdates&&hasData;epoch++){
    var completed=true;
    for(var si=0;si<STRATA.length;si++){
      var sequence=sequences[STRATA[si]];
      for(var index=0;index<sequence.length;index++){
        if(updates>=maxUpdates){completed=false;break;}
        var transition=sequence[index];
        q[transition.state_id]=q[transition.state_id]||{};
        var current=finite(q[transition.state_id][transition.action_id],0);
        var target=finite(transition.reward,0);
        if(transition.terminal!==true){
          var next=q[transition.next_state_id]||{};
          var values=Object.keys(next).map(function(action){return finite(next[action],0);});
          var best=values.length?Math.max.apply(Math,values):0;
          target+=gamma*best;
        }
        q[transition.state_id][transition.action_id]=current+alpha*(target-current);
        updates++;
      }
      if(!completed)break;
    }
    if(!completed)break;
    epochs++;
  }
  if(updates>=maxUpdates&&hasData)stopped='update_budget_exhausted';
  var epsilon=finite(parent.epsilon,finite(input.epsilon,0.2));
  var semantic={
    schema_version:'4.0',
    parent_policy_hash:parent.policy_hash||'',
    q_table:sorted(q),
    training_profile:sorted(profile),
    training_seed:String(input.training_seed||''),
    epsilon:epsilon
  };
  return{
    schema_version:'4.0',
    q_table:q,
    policy_hash:'policy:'+fnv1a(JSON.stringify(semantic)),
    epsilon:epsilon,
    updates_applied:updates,
    epochs_completed:epochs,
    stopped_reason:stopped,
    training_seed:String(input.training_seed||''),
    dataset_snapshot_id:snapshot.snapshot_id||'',
    dataset_snapshot_hash:snapshot.snapshot_hash||''
  };
};
})();
