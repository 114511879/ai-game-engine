/** PlayTestSystem.js v8.4 — 真实跳跃+3轮全跑+评分 */
(function(){var A=window.AGE;
A.PlayTestSystem=function(engine){
  this.eng=engine;this.frame=0;this.maxFrames=2400;
  this._actionTimer=0;this._lastHP=8;this._deathCount=0;
  this._totalDamage=0;this._bossDmg=0;this._shotsFired=0;this._enemiesKilled=0;
  this._prevEmyCount=0;this._active=false;this._done=false;this._report=null;
  this._strafePhase=0;
  this._jumpCharging=false;this._jumpChargeStart=0;
};
A.PlayTestSystem.prototype.start=function(){
  this.frame=0;this._active=true;this._done=false;
  this._lastHP=this.eng.player.hp||8;this._deathCount=0;
  this._totalDamage=0;this._bossDmg=0;
  this._shotsFired=0;this._enemiesKilled=0;this._prevEmyCount=0;
  this._report=null;this._strafePhase=0;
  this._jumpCharging=false;this._jumpChargeStart=0;
};
A.PlayTestSystem.prototype.stop=function(){this._active=false;this._done=true;};

A.PlayTestSystem.prototype._doJump=function(e){
  if(this._jumpCharging){this._jumpCharging=false;e.releaseJump();return;}
  if(!e.player.isJumping){e.startCharge();this._jumpCharging=true;this._jumpChargeStart=this.frame;}
};

A.PlayTestSystem.prototype.update=function(){
  if(!this._active||this._done)return;
  this.frame++;
  var e=this.eng,p=e.player;
  if(e.plugin&&e.plugin.aiStep){e.plugin.aiStep(e);if(e._win||e.gameOver)this._done=true;return;}
  if(this._jumpCharging&&this.frame-this._jumpChargeStart>6){this._jumpCharging=false;e.releaseJump();}
  if(p.hp<=0){this._deathCount++;this._totalDamage+=Math.max(0,this._lastHP);this._lastHP=8;return;}
  if(e._win||e.gameOver){this._done=true;return;}
  if(p.hp<this._lastHP){this._totalDamage+=(this._lastHP-p.hp);this._lastHP=p.hp;}
  var ems=e.enemyMgr.enemies.filter(function(x){return x.hp>0;}),nowCnt=ems.length;
  if(this._prevEmyCount>nowCnt)this._enemiesKilled+=(this._prevEmyCount-nowCnt);
  this._prevEmyCount=nowCnt;
  if(e.bossSystem&&e.bossSystem.hp>0)this._bossDmg=Math.max(this._bossDmg,(e.bossSystem.maxHp||400)-e.bossSystem.hp);

  var bossProj=null;
  if(e._projectiles)for(var bi=0;bi<e._projectiles.length;bi++){var bp=e._projectiles[bi];if(bp.fromBoss&&bp.hp>0&&bp.x>p.x-50&&bp.x<p.x+p.w+50&&bp.y<p.y+p.h&&bp.y>p.y-20){bossProj=bp;break;}}
  var boss=e.bossSystem&&e.bossSystem.hp>0?e.bossSystem:null;
  var bossRage=boss&&e.bossSystem.phaseManager&&e.bossSystem.phaseManager.currentPhase>=3;
  var nearEnemy=null,minDist=400;
  for(var i=0;i<ems.length;i++){var en=ems[i];if(en.x>p.x&&en.x-p.x<minDist){minDist=en.x-p.x;nearEnemy=en;}}

  this._actionTimer++;
  if(this._actionTimer>=4){
    this._actionTimer=0;this._strafePhase=(this._strafePhase+1)%60;
    if(boss){
      this._shotsFired++;this._tryUse(e,'fireball');
      var sv=Math.sin(this._strafePhase*0.2);
      if(sv>0.3)this._pressKey(e,'arrowright');else if(sv<-0.3)this._pressKey(e,'arrowleft');
      if(bossProj)this._doJump(e);
      if(this._strafePhase%20===0&&!this._jumpCharging)this._doJump(e);
      if(bossRage)this._tryUse(e,'shield');
      if(p.x>boss.x-50&&this._tryUse(e,'dash'))p.x=Math.max(5,p.x-100);
    }else if(nearEnemy){
      this._shotsFired++;this._tryUse(e,'fireball');
      var dx=nearEnemy.x-p.x;
      if(dx<120)this._pressKey(e,'arrowleft');else if(dx>240)this._pressKey(e,'arrowright');
      if(dx<60){this._doJump(e);}
      if(ems.length>=3&&dx<80&&this._tryUse(e,'dash'))p.x=Math.max(5,p.x-100);
    }else{
      if(this._strafePhase<25)this._pressKey(e,'arrowright');else if(this._strafePhase<50)this._pressKey(e,'arrowleft');
      if(this._strafePhase%15===0){this._shotsFired++;this._tryUse(e,'fireball');}
    }
  }
  if(this.frame>=this.maxFrames||this._deathCount>=3||e._win){this._done=true;}
};

A.PlayTestSystem.prototype._tryUse=function(e,n){if(!e.skillSystem)return false;return e.skillSystem.use(n,e);};
A.PlayTestSystem.prototype._pressKey=function(e,k){if(e.plugin&&e.plugin.onAllKeys)e.plugin.onAllKeys(e,k);};

A.PlayTestSystem.prototype.generateReport=function(){
  var r={};r.testFrames=this.frame;r.deathCount=this._deathCount;
  r.totalDamage=this._totalDamage;r.bossDamage=this._bossDmg;
  r.shotsFired=this._shotsFired;r.enemiesKilled=this._enemiesKilled;
  r.survivalTime=Math.floor(this.frame/60);
  r.issues=[];r.modifications={};
  if(this.eng._win){r.status='通过';this._report=r;return r;}
  if(this._deathCount>=3){r.issues.push('死亡过快');r.modifications.player_hp=true;}
  if(this._deathCount>=2&&this.frame<800){r.issues.push('难度过高');r.modifications.enemy_spawn_slower=true;}
  if(this._bossDmg<50&&this.frame>2000){r.issues.push('Boss打不动');r.modifications.boss_hp_lower=true;}
  if(this._totalDamage>12&&this.frame<1500){r.issues.push('受伤过多');r.modifications.enemy_dmg_lower=true;}
  r.status=r.issues.length===0?'通过':'未通过';
  this._report=r;return r;
};

A.DSLFixer={fix:function(raw,report){
  if(!report||!report.modifications)return raw;
  var r=JSON.parse(JSON.stringify(raw));
  if(report.modifications.player_hp){if(r.player)r.player.hp=(r.player.hp||8)+2;if(r.player.hp>16)r.player.hp=16;}
  if(report.modifications.enemy_spawn_slower){if(r.enemies&&r.enemies[0])r.enemies[0].spawn_rate=(r.enemies[0].spawn_rate||40)+20;}
  if(report.modifications.enemy_dmg_lower){if(r.skills){var hs=false;for(var i=0;i<r.skills.length;i++)if(r.skills[i].name==='shield')hs=true;if(!hs)r.skills.push({name:'shield',cooldown:60});}}
  if(report.modifications.boss_hp_lower){if(r.levels)for(var j=0;j<r.levels.length;j++){var b=r.levels[j].boss;if(b&&b.hp&&b.hp>150)b.hp=Math.floor(b.hp*0.5);}}
  return r;
}};
})();
