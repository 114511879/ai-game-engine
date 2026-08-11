/**
 * BugDetector.js v1.0 — AI测试时自动检测运行时Bug
 *
 * 检测类型:
 *   stuckInLevel        — 敌人已清空但关卡未切换(>15秒)
 *   bossNeverAppeared   — 进入Boss关后600帧Boss未激活
 *   spawnStarvation     — 300帧无任何敌人spawn
 *   instantDeath        — 5秒内玩家死亡
 *   hpAnomaly           — 玩家血量异常负值/NaN
 *   bossInvisible       — bossSystem存在但hp=0(刚创建就死了)
 *   levelSkipped        — 关卡idx跳跃>1
 *
 * 输出: window.__bugReport (供 generateAndTest 读取)
 */
(function(){var A=window.AGE;
A.BugDetector=function(engine){this.eng=engine;this.frame=0;this._lastLevel=0;this._lastSpawn=0;this._frameSinceClear=0;this._bossLevelEntered=false;this._bossLevelFrame=0;this._deathFrame=-1;this._bugs=[];this._prevSpawned=0;this._fixApplied=false;};
A.BugDetector.prototype.reset=function(){this.frame=0;this._lastLevel=0;this._lastSpawn=0;this._frameSinceClear=0;this._bossLevelEntered=false;this._bossLevelFrame=0;this._deathFrame=-1;this._bugs=[];this._prevSpawned=0;this._fixApplied=false;};
A.BugDetector.prototype.update=function(){
  this.frame++;var e=this.eng,p=e.player;
  // 记录当前关卡
  var lvIdx=e.levelMgr?e.levelMgr.getLevelIndex():0;
  if(lvIdx!==this._lastLevel){
    var diff=lvIdx-this._lastLevel;
    if(diff>1)this._bugs.push({type:'levelSkipped',frame:this.frame,detail:'从关'+this._lastLevel+'跳到关'+lvIdx,fix:'levelJump'});
    this._lastLevel=lvIdx;this._bossLevelEntered=false;this._bossLevelFrame=0;this._frameSinceClear=0;
  }
  // hp异常检测
  if(isNaN(p.hp)||p.hp<0){this._bugs.push({type:'hpAnomaly',frame:this.frame,detail:'hp='+p.hp,fix:'resetHP'});}
  // 秒死检测
  if(p.hp<=0&&this._deathFrame<0)this._deathFrame=this.frame;
  if(this._deathFrame>0&&this._deathFrame<300&&this.frame-this._deathFrame<10){this._bugs.push({type:'instantDeath',frame:this.frame,detail:'玩家'+this._deathFrame+'帧内死亡',fix:'increaseHP'});}
  // spawn停滞
  var spawned=e._enemiesSpawned||0;
  if(spawned>this._prevSpawned){this._lastSpawn=this.frame;this._prevSpawned=spawned;}
  if(this.frame-this._lastSpawn>300&&!e._win&&!e.gameOver&&!e.levelMgr.isComplete()){this._bugs.push({type:'spawnStarvation',frame:this.frame,detail:'300帧无敌人spawn',fix:'forceSpawn'});this._lastSpawn=this.frame;}
  // 卡关: 敌人清空但没切关
  var emyCnt=e.enemyMgr.enemies.filter(function(x){return x.hp>0;}).length;
  if(emyCnt===0&&spawned>0)this._frameSinceClear++;else this._frameSinceClear=0;
  if(this._frameSinceClear>900&&!e.levelMgr.isComplete()&&!e._win&&!e.gameOver){this._bugs.push({type:'stuckInLevel',frame:this.frame,detail:'关'+lvIdx+'清空'+this._frameSinceClear+'帧未切换',fix:'forceNextLevel'});}
  // Boss未出现
  var curr=e.levelMgr?e.levelMgr.getCurrent():null;
  if(curr&&curr.boss&&!this._bossLevelEntered){this._bossLevelEntered=true;this._bossLevelFrame=this.frame;}
  if(this._bossLevelEntered&&this.frame-this._bossLevelFrame>600&&!e.bossSystem&&!e._win&&!e.gameOver){this._bugs.push({type:'bossNeverAppeared',frame:this.frame,detail:'Boss关进入600帧Boss未激活',fix:'createBoss'});this._bossLevelEntered=false;}
  // Boss隐身(bossSystem存在但hp<=0)
  if(e.bossSystem&&e.bossSystem.hp<=0&&this.frame-this._bossLevelFrame<50&&!e._win){this._bugs.push({type:'bossInvisible',frame:this.frame,detail:'Boss刚创建就hp=0',fix:'resetBossHP'});}
};

/** 对检测到的bug生成修正指令 */
A.BugDetector.prototype.generateFixes=function(){
  var fixes=[],handled={};
  for(var i=0;i<this._bugs.length;i++){var b=this._bugs[i];if(handled[b.type])continue;handled[b.type]=true;
    switch(b.type){
      case'stuckInLevel':fixes.push({action:'fixLevelTransition',detail:'关卡卡住,强制解锁切换锁'});break;
      case'bossNeverAppeared':fixes.push({action:'fixBossActivation',detail:'Boss未激活,注入兜底Boss'});break;
      case'spawnStarvation':fixes.push({action:'fixSpawnRate',detail:'spawn停滞,降低spawn间隔'});break;
      case'instantDeath':fixes.push({action:'fixPlayerHP',detail:'HP+4'});break;
      case'hpAnomaly':fixes.push({action:'fixPlayerHP',detail:'重置HP为8'});break;
      case'levelSkipped':fixes.push({action:'fixLevelJump',detail:'修复关卡跳跃,重置LevelManager'});break;
      case'bossInvisible':fixes.push({action:'fixBossHP',detail:'BossHP异常,重置'});break;
    }
  }
  return fixes;
};

/** 应用fixes到DSL(返回修改后的dsl) + 打印报告 */
A.BugDetector.prototype.applyToDSL=function(dsl,fixes){
  if(!fixes||fixes.length===0)return dsl;
  var r=JSON.parse(JSON.stringify(dsl));
  for(var i=0;i<fixes.length;i++){
    var f=fixes[i];
    switch(f.action){
      case'fixLevelTransition':if(r.levels)for(var j=0;j<r.levels.length;j++)r.levels[j]._noSwitchBug=true;break;
      case'fixBossActivation':if(r.levels&&r.levels.length>0){var last=r.levels[r.levels.length-1];if(!last.boss||!last.boss.name)last.boss={name:'亡灵法师',hp:300,phase:3,theme:'dark',skills:[{name:'亡魂弹',type:'projectile',damage:1,cooldown:70},{name:'亡灵召唤',type:'summon',cooldown:200,count:2}]};}break;
      case'fixSpawnRate':if(r.enemies&&r.enemies[0])r.enemies[0].spawn_rate=Math.max(25,(r.enemies[0].spawn_rate||40)-15);break;
      case'fixPlayerHP':if(r.player)r.player.hp=Math.min(16,(r.player.hp||8)+4);break;
      case'fixLevelJump':r._forceReset=true;break;
      case'fixBossHP':if(r.levels)for(var k=r.levels.length-1;k>=0;k--){if(r.levels[k].boss){r.levels[k].boss.hp=Math.max(300,r.levels[k].boss.hp||400);break;}}break;
    }
  }
  return r;
};

})();
