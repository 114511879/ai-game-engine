/** CandidateEvaluator.js v3.0 - isolated deterministic candidate admission and evaluation. */
(function(){
var A=window.AGE=window.AGE||{};

function errorData(error){
  if(!error)return null;
  return{name:error.name||'Error',message:error.message||String(error),code:error.code||''};
}

function abortedResult(clock,started){
  return{
    status:'cancelled',qa:null,evaluation:null,runtime:{},fitness:null,
    simulation_deterministic:false,elapsed_ms:Math.max(0,clock()-started),error:{name:'AbortError',message:'Evaluation cancelled',code:''}
  };
}

A.CandidateEvaluator=function(dependencies){
  dependencies=dependencies||{};
  this.finalQA=dependencies.finalQA;
  this.engine=dependencies.engine;
  this.simulation=dependencies.simulation;
  this.fitnessFactory=dependencies.fitnessFactory||function(options){return new A.FitnessCalculator(options);};
  this.clock=dependencies.clock||function(){return Date.now();};
  this.createAbortController=dependencies.createAbortController||function(){return new AbortController();};
};

A.CandidateEvaluator.prototype.evaluate=async function(candidateDSL,options){
  options=options||{};
  var started=this.clock();
  if(options.signal&&options.signal.aborted)return abortedResult(this.clock,started);

  var controller=this.createAbortController();
  var timeoutMs=Number(options.timeout_ms);
  if(!isFinite(timeoutMs)||timeoutMs<=0)timeoutMs=300000;
  var timedOut=false;
  var externallyAborted=false;
  var rejectAbort;
  var abortPromise=new Promise(function(_resolve,reject){rejectAbort=reject;});
  function stop(name,message){
    if(controller.signal.aborted)return;
    var error=new Error(message);
    error.name=name;
    controller.abort();
    rejectAbort(error);
  }
  var timer=setTimeout(function(){timedOut=true;stop('AbortError','Candidate evaluation timed out');},timeoutMs);
  var externalHandler=function(){externallyAborted=true;stop('AbortError','Candidate evaluation cancelled');};
  if(options.signal&&typeof options.signal.addEventListener==='function'){
    options.signal.addEventListener('abort',externalHandler,{once:true});
  }
  if(options.signal&&options.signal.aborted)externalHandler();

  async function waitForSafeSettlement(operation){
    try{
      return await Promise.race([operation,abortPromise]);
    }catch(error){
      if(controller.signal.aborted){
        try{await operation;}catch(settleError){}
      }
      throw error;
    }
  }

  function releaseAbort(){
    clearTimeout(timer);
    if(options.signal&&typeof options.signal.removeEventListener==='function'){
      options.signal.removeEventListener('abort',externalHandler);
    }
  }

  var qa=null;
  try{
    qa=await waitForSafeSettlement(Promise.resolve().then(function(){
      return this.finalQA.validate(candidateDSL,options.intent,options.blueprint);
    }.bind(this)));
  }catch(qaError){
    releaseAbort();
    return{
      status:timedOut?'timeout':(externallyAborted||(qaError&&qaError.name==='AbortError')?'cancelled':'failed'),
      qa:null,evaluation:null,runtime:{},fitness:null,
      simulation_deterministic:false,elapsed_ms:Math.max(0,this.clock()-started),error:errorData(qaError)
    };
  }
  if(controller.signal.aborted){
    releaseAbort();
    return timedOut?{
      status:'timeout',qa:qa,evaluation:null,runtime:{},fitness:null,
      simulation_deterministic:false,elapsed_ms:Math.max(0,this.clock()-started),
      error:{name:'AbortError',message:'Candidate evaluation timed out',code:''}
    }:abortedResult(this.clock,started);
  }
  if(!qa||qa.admitted!==true){
    releaseAbort();
    return{
      status:'qa_rejected',qa:qa||null,evaluation:null,runtime:{},fitness:null,
      simulation_deterministic:false,elapsed_ms:Math.max(0,this.clock()-started),error:null
    };
  }

  var evaluation=null;
  var fitness=null;
  var runtime=options.runtime_metrics||{};
  var resultStatus='failed';
  var failure=null;
  try{
    await waitForSafeSettlement(Promise.resolve().then(function(){return this.engine.reset();}.bind(this)));
    await waitForSafeSettlement(Promise.resolve().then(function(){return this.engine.load(candidateDSL);}.bind(this)));
    var simulationOperation=Promise.resolve().then(function(){return this.simulation.run(this.engine,{
        seed:options.candidate_seed||'',
        candidate_seed:options.candidate_seed||'',
        persona:options.persona||'new_player',
        episodes:options.episodes||1,
        signal:controller.signal,
        deterministic:options.deterministic===true,
        simulation_id:options.simulation_id
      });}.bind(this));
    evaluation=await waitForSafeSettlement(simulationOperation);
    var calculator=this.fitnessFactory({
      profile:options.fitness_profile||'default_v2',
      game_id:options.game_id||candidateDSL&&candidateDSL.meta&&candidateDSL.meta.game_id||'',
      version_id:options.candidate_id||'candidate',
      fitness_id:options.fitness_id
    });
    fitness=await waitForSafeSettlement(Promise.resolve().then(function(){
      return calculator.calculateFitness(evaluation,qa,runtime,options.trend||{},options.blueprint_metadata);
    }));
    if(!fitness||typeof fitness.final_fitness!=='number'||!isFinite(fitness.final_fitness)||fitness.final_fitness<0||fitness.final_fitness>1){
      var fitnessError=new Error('invalid_candidate_fitness');
      fitnessError.code='invalid_candidate_fitness';
      throw fitnessError;
    }
    resultStatus='evaluated';
  }catch(error){
    failure=error;
    if(timedOut)resultStatus='timeout';
    else if(externallyAborted||(error&&error.name==='AbortError'))resultStatus='cancelled';
    else resultStatus='failed';
  }finally{
    releaseAbort();
    try{await Promise.resolve(this.engine.teardown());}catch(teardownError){if(!failure)failure=teardownError;}
    try{await Promise.resolve(this.engine.reset());}catch(resetError){if(!failure)failure=resetError;}
    if(failure&&resultStatus==='evaluated')resultStatus='failed';
  }

  return{
    status:resultStatus,
    qa:qa,
    evaluation:evaluation,
    runtime:runtime,
    fitness:fitness,
    simulation_deterministic:!!(evaluation&&evaluation.simulation_deterministic===true),
    elapsed_ms:Math.max(0,this.clock()-started),
    error:errorData(failure)
  };
};
})();
