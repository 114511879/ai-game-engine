/**
 * observer.js v1.0 — 行为观察器 + 数据监控器
 *
 * 职责:
 *   - 行为观察器: 监控玩家操作序列、技能使用频率、移动模式
 *   - 数据监控器: 收集物理坐标、血量变化、Boss行为、碰撞事件
 *   - 输出结构化数据供给 anomaly.js 进行异常检测
 */
(function(){var A=window.AGE;

A.GameObserver = function(engine) {
  this.eng = engine;
  this.frame = 0;
  this._active = false;

  // === 时间序列数据 ===
  this.timeSeries = {
    playerY: [],        // [{frame, value}]
    playerX: [],
    playerHP: [],
    enemyCount: [],
    bossHP: [],
    gameState: []       // RUNNING/GAMEOVER/WIN
  };

  // === 行为统计 ===
  this.behavior = {
    skillUsage: {},     // {skillName: count}
    jumpCount: 0,
    dashCount: 0,
    moveLeft: 0,
    moveRight: 0,
    idleFrames: 0,
    attackCount: 0,
    damageTaken: [],
    deathFrames: []
  };

  // === Boss行为监控 ===
  this.bossMonitor = {
    skillTimestamps: {},  // {skillName: [frame1, frame2, ...]}
    phaseChanges: [],     // [{frame, fromPhase, toPhase}]
    hpChanges: [],        // [{frame, hp}]
    cooldownViolations: 0,
    lastSkillFrame: {}
  };

  // === 碰撞事件 ===
  this.collisionEvents = [];
  this._lastPlayerY = 0;
  this._lastPlayerHP = 0;
  this._lastBossHP = 0;
  this._lastEnemyCount = 0;
  this._lastGameState = '';
  this._sampleInterval = 3; // 每3帧采样一次
  this._sampleTimer = 0;
};

A.GameObserver.prototype.start = function() {
  this.frame = 0;
  this._active = true;
  this._sampleTimer = 0;
  this._resetData();
};

A.GameObserver.prototype.stop = function() {
  this._active = false;
};

A.GameObserver.prototype._resetData = function() {
  this.timeSeries = {
    playerY: [], playerX: [], playerHP: [],
    enemyCount: [], bossHP: [], gameState: []
  };
  this.behavior = {
    skillUsage: {}, jumpCount: 0, dashCount: 0,
    moveLeft: 0, moveRight: 0, idleFrames: 0,
    attackCount: 0, damageTaken: [], deathFrames: []
  };
  this.bossMonitor = {
    skillTimestamps: {}, phaseChanges: [],
    hpChanges: [], cooldownViolations: 0, lastSkillFrame: {}
  };
  this.collisionEvents = [];
  this._lastPlayerY = 0;
  this._lastPlayerHP = 0;
  this._lastBossHP = 0;
  this._lastEnemyCount = 0;
  this._lastGameState = '';
};

// ══════════════════════════════════════════
// 每帧更新 —— 采集所有数据
// ══════════════════════════════════════════
A.GameObserver.prototype.update = function() {
  if (!this._active) return;
  this.frame++;
  this._sampleTimer++;

  var e = this.eng, p = e.player;
  if (!p || !e) return;

  // === 采样时间序列数据 ===
  if (this._sampleTimer >= this._sampleInterval) {
    this._sampleTimer = 0;
    this._samplePlayerData(p);
    this._sampleGameData(e);
  }

  // === 实时监控 ===
  this._monitorHPChanges(p, e);
  this._monitorBossBehavior(e);
  this._monitorGameState(e);
  this._detectCollisionEvents(e, p);
};

// ══════════════════════════════════════════
// 采样玩家数据
// ══════════════════════════════════════════
A.GameObserver.prototype._samplePlayerData = function(p) {
  this.timeSeries.playerY.push({frame: this.frame, value: p.y});
  this.timeSeries.playerX.push({frame: this.frame, value: p.x});
  this.timeSeries.playerHP.push({frame: this.frame, value: p.hp});
};

// ══════════════════════════════════════════
// 采样游戏数据
// ══════════════════════════════════════════
A.GameObserver.prototype._sampleGameData = function(e) {
  var ems = e.enemyMgr ? e.enemyMgr.enemies.filter(function(x){return x.hp>0;}) : [];
  this.timeSeries.enemyCount.push({frame: this.frame, value: ems.length});

  var bhp = e.bossSystem && e.bossSystem.hp > 0 ? e.bossSystem.hp : 0;
  this.timeSeries.bossHP.push({frame: this.frame, value: bhp});

  var gs = e.gameOver ? 'GAMEOVER' : (e._win ? 'WIN' : 'RUNNING');
  this.timeSeries.gameState.push({frame: this.frame, value: gs});
};

// ══════════════════════════════════════════
// 监控血量变化
// ══════════════════════════════════════════
A.GameObserver.prototype._monitorHPChanges = function(p, e) {
  if (this._lastPlayerHP > 0 && p.hp < this._lastPlayerHP) {
    this.behavior.damageTaken.push({
      frame: this.frame,
      from: this._lastPlayerHP,
      to: p.hp,
      damage: this._lastPlayerHP - p.hp
    });
  }

  if (p.hp <= 0 && this._lastPlayerHP > 0) {
    this.behavior.deathFrames.push(this.frame);
  }

  this._lastPlayerHP = p.hp;
};

// ══════════════════════════════════════════
// 监控Boss行为
// ══════════════════════════════════════════
A.GameObserver.prototype._monitorBossBehavior = function(e) {
  var boss = e.bossSystem;
  if (!boss || boss.hp <= 0) {
    this._lastBossHP = 0;
    return;
  }

  // Boss HP变化
  if (boss.hp !== this._lastBossHP && this._lastBossHP > 0) {
    this.bossMonitor.hpChanges.push({
      frame: this.frame,
      from: this._lastBossHP,
      to: boss.hp
    });
  }

  // Boss Phase变化
  if (boss.phaseManager) {
    this._monitorBossPhase(boss);
  }

  // Boss技能频率监控
  this._monitorBossSkills(e, boss);

  this._lastBossHP = boss.hp;
};

A.GameObserver.prototype._monitorBossPhase = function(boss) {
  var pm = boss.phaseManager;
  if (pm._lastPhase !== undefined && pm.currentPhase !== pm._lastPhase) {
    this.bossMonitor.phaseChanges.push({
      frame: this.frame,
      fromPhase: pm._lastPhase,
      toPhase: pm.currentPhase
    });
  }
  pm._lastPhase = pm.currentPhase;
};

A.GameObserver.prototype._monitorBossSkills = function(e, boss) {
  // 监控Boss弹幕发射频率
  if (e._projectiles) {
    for (var i = 0; i < e._projectiles.length; i++) {
      var pr = e._projectiles[i];
      if (pr.fromBoss && pr.hp > 0) {
        var type = pr.type || 'unknown';
        if (!this.bossMonitor.skillTimestamps[type]) {
          this.bossMonitor.skillTimestamps[type] = [];
        }
        var ts = this.bossMonitor.skillTimestamps[type];
        var lastFrame = ts.length > 0 ? ts[ts.length - 1] : 0;
        if (this.frame - lastFrame > 5) {  // 避免同一弹幕重复记录
          ts.push(this.frame);
        }
      }
    }
  }
};

// ══════════════════════════════════════════
// 监控游戏状态（检测状态异常）
// ══════════════════════════════════════════
A.GameObserver.prototype._monitorGameState = function(e) {
  var currentState = e.gameOver ? 'GAMEOVER' : (e._win ? 'WIN' : 'RUNNING');
  if (currentState !== this._lastGameState && this._lastGameState !== '') {
    // 状态转换记录
    this.timeSeries.gameState.push({
      frame: this.frame,
      value: currentState,
      from: this._lastGameState
    });
  }
  this._lastGameState = currentState;
};

// ══════════════════════════════════════════
// 检测碰撞事件
// ══════════════════════════════════════════
A.GameObserver.prototype._detectCollisionEvents = function(e, p) {
  if (!e.enemyMgr) return;
  var ems = e.enemyMgr.enemies.filter(function(x){return x.hp>0;});
  for (var i = 0; i < ems.length; i++) {
    var en = ems[i];
    if (A.hit && A.hit(p, en)) {
      this.collisionEvents.push({
        frame: this.frame,
        type: 'enemy',
        enemyX: en.x,
        enemyY: en.y,
        playerX: p.x,
        playerY: p.y,
        playerHP: p.hp
      });
    }
  }
};

// ══════════════════════════════════════════
// 记录AI行为（由agent调用）
// ══════════════════════════════════════════
A.GameObserver.prototype.recordAction = function(action) {
  if (!action) return;
  if (action.keys) {
    for (var i = 0; i < action.keys.length; i++) {
      var k = action.keys[i];
      if (k === 'jump') this.behavior.jumpCount++;
      else if (k === 'arrowright') this.behavior.moveRight++;
      else if (k === 'arrowleft') this.behavior.moveLeft++;
      else if (k === 'idle') this.behavior.idleFrames++;
    }
  }
  if (action.skills) {
    for (var j = 0; j < action.skills.length; j++) {
      var sk = action.skills[j];
      this.behavior.skillUsage[sk] = (this.behavior.skillUsage[sk] || 0) + 1;
      if (sk === 'fireball') this.behavior.attackCount++;
      if (sk === 'dash') this.behavior.dashCount++;
    }
  }
};

// ══════════════════════════════════════════
// 生成观察报告
// ══════════════════════════════════════════
A.GameObserver.prototype.generateReport = function() {
  return {
    observerVersion: '1.0',
    totalFrames: this.frame,
    timeSeries: {
      playerY: this.timeSeries.playerY.slice(-200),
      playerHP: this.timeSeries.playerHP.slice(-200),
      enemyCount: this.timeSeries.enemyCount.slice(-200),
      bossHP: this.timeSeries.bossHP.slice(-200),
      gameState: this.timeSeries.gameState.slice(-50)
    },
    behavior: this.behavior,
    bossMonitor: this.bossMonitor,
    collisionEvents: this.collisionEvents.slice(-30),
    deathFrames: this.behavior.deathFrames,
    summary: {
      totalSkillUsage: this._sumSkillUsage(),
      totalJumps: this.behavior.jumpCount,
      totalDamageTaken: this.behavior.damageTaken.reduce(function(s, d){return s + d.damage;}, 0),
      deathCount: this.behavior.deathFrames.length,
      bossPhases: this.bossMonitor.phaseChanges.length
    }
  };
};

A.GameObserver.prototype._sumSkillUsage = function() {
  var sum = 0;
  for (var k in this.behavior.skillUsage) {
    if (this.behavior.skillUsage.hasOwnProperty(k)) {
      sum += this.behavior.skillUsage[k];
    }
  }
  return sum;
};

})();