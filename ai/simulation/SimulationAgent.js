/** SimulationAgent.js - bounded persona playtest episodes and evaluation. */
(function(){
var A=window.AGE=window.AGE||{};

function average(rows,key){
  return rows.reduce(function(sum,row){return sum+(Number(row[key])||0);},0)/rows.length;
}

A.SimulationAgent=function(options){
  options=options||{};
  this.episodeRunner=options.episodeRunner||this.runEngineEpisode;
};

A.SimulationAgent.prototype.run=async function(engine,options){
  options=options||{};
  var count=Math.max(1,Math.min(5,Number(options.episodes)||3));
  var persona=options.persona||'new_player';
  var rows=[];
  for(var index=0;index<count;index++){
    rows.push(await this.episodeRunner(engine,persona,index,options));
  }
  var deaths=rows.filter(function(row){return row.death;}).length;
  var completions=rows.filter(function(row){return row.completed;}).length;
  var bugs=[];
  rows.forEach(function(row){bugs=bugs.concat(row.bugs||[]);});
  var completionRate=completions/rows.length;
  var coverage=average(rows,'coverage');
  return A.AgentProtocols.evaluationResult({
    simulation_id:options.simulation_id||'sim_'+Date.now(),
    persona:persona,
    episodes:rows.length,
    status:'completed',
    metrics:{
      play_time:average(rows,'play_time'),
      death_rate:deaths/rows.length,
      completion_rate:completionRate,
      coverage:coverage,
      engagement_proxy:average(rows,'engagement_proxy')
    },
    bugs:bugs,
    reward:Math.round(completionRate*50+coverage*30-bugs.length*10)
  });
};

A.SimulationAgent.prototype.runEngineEpisode=async function(engine,persona,index,options){
  var mode=persona==='explorer'?'explore':persona==='stress_tester'?'stress':'progress';
  var tester=new A.AITestAgent(engine);
  var observer=new A.GameObserver(engine);
  var anomaly=new A.AnomalyDetector(engine);
  tester.maxFrames=options.maxFrames||1200;
  tester.start(mode);
  observer.start();
  anomaly.start();
  engine.playTester=tester;

  await new Promise(function(resolve){
    var tick=function(){
      try{observer.update();anomaly.update();}catch(error){}
      if(!tester._active||tester._done||engine.gameOver||engine._win||tester.frame>=tester.maxFrames){
        tester.stop();
        observer.stop();
        anomaly.stop();
        engine.playTester=null;
        resolve();
      }else setTimeout(tick,50);
    };
    tick();
  });

  var report=tester.generateReport();
  var anomalyReport=anomaly.generateReport();
  var levelCount=Math.max(1,engine.dsl&&engine.dsl.levels&&engine.dsl.levels.length||1);
  return{
    persona:persona,
    episode:index,
    play_time:report.survivalTime,
    death:!!(report.endState&&report.endState.gameOver),
    completed:!!(report.endState&&report.endState.win),
    coverage:Math.min(1,((report.progress&&report.progress.maxLevel)||0)/levelCount),
    engagement_proxy:Math.min(10,2+report.totalActions/50),
    bugs:anomalyReport.anomalies||[]
  };
};
})();
