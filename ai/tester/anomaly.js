/**
 * anomaly.js v1.0 — 异常检测系统
 *
 * 检测三类异常:
 *   1. 物理异常: 玩家掉出地图、穿过地面、坐标NaN
 *   2. 状态异常: 死亡但游戏还在运行、HP=0但GameState=PLAYING
 *   3. 逻辑异常: Boss技能CD异常、spawn率异常、关卡跳跃异常
 *
 * 不告诉AI"这里会有bug"，而是让系统自动监控发现异常
 */
(function(){var A=window.AGE;

A.AnomalyDetector = function(engine) {
  this.eng = engine;
  this._active = false;
  this._anomalies = [];

  // 物理异常参数
  this._physicsBounds = {
    minY: -50,      // 允许的最小Y坐标（上方）
    maxY: 500,      // 允许的最大Y坐标（下方掉出）
    minX: -20,      // 允许的最小X
    maxX: 850       // 允许的最大X
  };

  // 状态异常参数
  this._stateHistory = [];  // [{frame, hp, gameOver, win}]

  // 逻辑异常参数
  this._bossSkillIntervals = {};  // {skillName: [intervals]}
  this._spawnIntervals = [];      // 敌人spawn间隔
  this._lastSpawnFrame = 0;
  this._lastLevelIndex = 0;
  this._levelJumpDetected = false;

  // 未知事件探索
  this._unexpectedEvents = [];    // 意料之外的状态
};

A.AnomalyDetector.prototype.start = function() {
  this._active = true;
  this._anomalies = [];
  this._stateHistory = [];
  this._bossSkillIntervals = {};
  this._spawnIntervals = [];
  this._lastSpawnFrame = 0;
  this._lastLevelIndex = 0;
  this._levelJumpDetected = false;
  this._unexpectedEvents = [];
};

A.AnomalyDetector.prototype.stop = function() {
  this._active = false;
};

// ══════════════════════════════════════════
// 每帧检测
// ══════════════════════════════════════════
A.AnomalyDetector.prototype.update = function() {
  if (!this._active) return;
  var e = this.eng, p = e.player;
  if (!p) return;

  this._detectPhysicsAnomalies(p);
  this._detectStateAnomalies(e, p);
  this._detectLogicAnomalies(e, p);
  this._detectUnexpectedEvents(e, p);
};

// ══════════════════════════════════════════
// 1. 物理异常检测
// ══════════════════════════════════════════
A.AnomalyDetector.prototype._detectPhysicsAnomalies = function(p) {
  var B = this._physicsBounds;

  // 1a. 掉出地图（Y坐标异常）
  if (p.y > B.maxY) {
    this._addAnomaly('physics_fall_out', '玩家掉出地图', {
      playerY: p.y,
      playerX: p.x,
      maxY: B.maxY,
      detail: '玩家Y坐标=' + p.y + ' 超过最大边界=' + B.maxY + '，说明掉出地图'
    });
  }

  // 1b. 穿过地面上方（Y坐标异常为负）
  if (p.y < B.minY && p.y < -100) {
    this._addAnomaly('physics_float_up', '玩家浮出屏幕', {
      playerY: p.y,
      minY: B.minY,
      detail: '玩家Y坐标=' + p.y + ' 低于最小边界=' + B.minY
    });
  }

  // 1c. 坐标NaN
  if (isNaN(p.x) || isNaN(p.y)) {
    this._addAnomaly('physics_nan', '玩家坐标变为NaN', {
      playerX: p.x,
      playerY: p.y,
      detail: '玩家坐标异常: x=' + p.x + ' y=' + p.y
    });
  }

  // 1d. 玩家穿过地面（在地面下方但未死亡）
  if (p.y > (this.eng.groundY || 330) + 20 && p.hp > 0 && !this.eng.gameOver) {
    this._addAnomaly('physics_through_ground', '玩家穿过地面', {
      playerY: p.y,
      groundY: this.eng.groundY,
      detail: '玩家Y=' + p.y + ' 地面Y=' + (this.eng.groundY || 330) + '，穿过地面但未死亡'
    });
  }

  // 1e. 玩家移出屏幕左边界
  if (p.x < B.minX && p.hp > 0) {
    this._addAnomaly('physics_out_left', '玩家移出左边界', {
      playerX: p.x,
      minX: B.minX,
      detail: '玩家X=' + p.x + ' 小于最小X=' + B.minX
    });
  }
};

// ══════════════════════════════════════════
// 2. 状态异常检测
// ══════════════════════════════════════════
A.AnomalyDetector.prototype._detectStateAnomalies = function(e, p) {
  // 2a. HP=0但游戏仍在运行（之前遇到的bug）
  if (p.hp <= 0 && !e.gameOver && !e._win) {
    this._addAnomaly('state_dead_but_running', '玩家HP=0但游戏仍在运行', {
      hp: p.hp,
      gameOver: e.gameOver,
      win: e._win,
      detail: 'HP=' + p.hp + ' 但gameOver=' + e.gameOver + ' win=' + e._win
    });
  }

  // 2b. 游戏结束但HP>0
  if (e.gameOver && p.hp > 0) {
    this._addAnomaly('state_gameover_with_hp', '游戏结束但玩家仍有HP', {
      hp: p.hp,
      detail: 'gameOver=true 但 HP=' + p.hp
    });
  }

  // 2c. 游戏结束但GameState不是GAMEOVER
  if (e.gameOver && A.getGameState && A.getGameState() !== A.STATE.GAMEOVER) {
    this._addAnomaly('state_gameover_mismatch', 'gameOver与GameState不匹配', {
      gameOver: e.gameOver,
      gameState: A.getGameState ? A.getGameState() : 'unknown',
      detail: 'engine.gameOver=true 但 GameState≠GAMEOVER'
    });
  }

  // 2d. 胜利但GameState不是WIN
  if (e._win && A.getGameState && A.getGameState() !== A.STATE.WIN) {
    this._addAnomaly('state_win_mismatch', '胜利与GameState不匹配', {
      win: e._win,
      gameState: A.getGameState ? A.getGameState() : 'unknown',
      detail: 'engine._win=true 但 GameState≠WIN'
    });
  }

  // 2e. 记录状态历史用于趋势分析
  this._stateHistory.push({
    frame: e.frame,
    hp: p.hp,
    gameOver: e.gameOver,
    win: e._win
  });
  if (this._stateHistory.length > 300) this._stateHistory.shift();
};

// ══════════════════════════════════════════
// 3. 逻辑异常检测
// ══════════════════════════════════════════
A.AnomalyDetector.prototype._detectLogicAnomalies = function(e, p) {
  // 3a. Boss技能CD异常（技能频率过高）
  this._detectBossCooldownViolation(e);

  // 3b. 敌人spawn率异常
  this._detectSpawnAnomaly(e);

  // 3c. 关卡跳跃异常
  this._detectLevelJump(e);

  // 3d. 技能系统异常
  this._detectSkillAnomaly(e);
};

// Boss技能CD异常检测
A.AnomalyDetector.prototype._detectBossCooldownViolation = function(e) {
  if (!e._projectiles || !e.bossSystem || e.bossSystem.hp <= 0) return;

  var bossProjs = [];
  for (var i = 0; i < e._projectiles.length; i++) {
    if (e._projectiles[i].fromBoss && e._projectiles[i].hp > 0) {
      bossProjs.push(e._projectiles[i]);
    }
  }

  if (bossProjs.length > 20) {
    this._addAnomaly('logic_boss_skill_spam', 'Boss技能过度释放', {
      projectileCount: bossProjs.length,
      threshold: 20,
      bossHP: e.bossSystem.hp,
      detail: 'Boss弹幕数量=' + bossProjs.length + ' 超过阈值=20，可能CD失效'
    });
  }
};

// 敌人spawn率异常
A.AnomalyDetector.prototype._detectSpawnAnomaly = function(e) {
  var spawned = e._enemiesSpawned || 0;
  if (spawned > 0 && this._lastSpawnFrame === 0) {
    this._lastSpawnFrame = e.frame;
  }
  if (spawned > (this._lastSpawnFrame > 0 ? 0 : 0)) {
    var interval = e.frame - this._lastSpawnFrame;
    if (interval > 0 && interval < 5) {
      this._spawnIntervals.push(interval);
      if (this._spawnIntervals.length > 10) {
        var avg = this._spawnIntervals.reduce(function(a,b){return a+b;}, 0) / this._spawnIntervals.length;
        if (avg < 8) {
          this._addAnomaly('logic_spawn_too_fast', '敌人spawn过快', {
            avgInterval: Math.round(avg),
            detail: '敌人平均spawn间隔=' + Math.round(avg) + '帧，过于频繁'
          });
        }
      }
    }
    this._lastSpawnFrame = e.frame;
  }
};

// 关卡跳跃异常
A.AnomalyDetector.prototype._detectLevelJump = function(e) {
  if (!e.levelMgr) return;
  var idx = e.levelMgr.getLevelIndex ? e.levelMgr.getLevelIndex() : 0;
  if (this._lastLevelIndex > 0 && idx - this._lastLevelIndex > 1) {
    this._addAnomaly('logic_level_jump', '关卡跳跃', {
      from: this._lastLevelIndex,
      to: idx,
      detail: '关卡从' + this._lastLevelIndex + '跳到' + idx + '，跳过了' + (idx - this._lastLevelIndex - 1) + '关'
    });
  }
  this._lastLevelIndex = idx;
};

// 技能系统异常
A.AnomalyDetector.prototype._detectSkillAnomaly = function(e) {
  if (!e.skillSystem || !e.skillSystem._skills) return;
  for (var i = 0; i < e.skillSystem._skills.length; i++) {
    var sk = e.skillSystem._skills[i];
    if (sk._cooldownRemaining < 0) {
      this._addAnomaly('logic_skill_cooldown_negative', '技能冷却为负值', {
        skill: sk.name,
        cooldownRemaining: sk._cooldownRemaining,
        detail: '技能[' + sk.name + ']冷却剩余=' + sk._cooldownRemaining + '（负数异常）'
      });
    }
  }
};

// ══════════════════════════════════════════
// 4. 未知事件探索 —— 主动发现意外情况
// ══════════════════════════════════════════
A.AnomalyDetector.prototype._detectUnexpectedEvents = function(e, p) {
  // 4a. 玩家无敌（HP长期不变但一直受击）
  if (this._stateHistory.length > 20) {
    var recent = this._stateHistory.slice(-20);
    var allSameHP = true;
    var firstHP = recent[0].hp;
    for (var i = 1; i < recent.length; i++) {
      if (recent[i].hp !== firstHP) { allSameHP = false; break; }
    }
    if (allSameHP && firstHP > 0 && e.enemyMgr) {
      var ems = e.enemyMgr.enemies.filter(function(x){return x.hp>0;});
      if (ems.length > 3) {
        this._addAnomaly('unexpected_invincible', '玩家可能无敌', {
          hp: firstHP,
          enemiesOnScreen: ems.length,
          detail: '玩家HP=' + firstHP + ' 20帧不变，但屏幕上有' + ems.length + '个敌人'
        });
      }
    }
  }

  // 4b. Boss无法被攻击
  if (e.bossSystem && e.bossSystem.hp > 0 && this._stateHistory.length > 60) {
    var recent60 = this._stateHistory.slice(-60);
    var bossHPUnchanged = true;
    var firstBossHP = recent60[0].bossHP;
    for (var j = 1; j < recent60.length; j++) {
      if (recent60[j].bossHP !== firstBossHP) { bossHPUnchanged = false; break; }
    }
    // 这个检查需要从observer获取数据，暂时跳过
  }
};

// ══════════════════════════════════════════
// 添加异常（去重）
// ══════════════════════════════════════════
A.AnomalyDetector.prototype._addAnomaly = function(type, title, data) {
  // 去重：同类型异常每30帧最多记录一次
  for (var i = this._anomalies.length - 1; i >= 0; i--) {
    if (this._anomalies[i].type === type) {
      var lastFrame = this._anomalies[i].frame || 0;
      if (this.eng.frame - lastFrame < 30) return;
      break;
    }
  }

  this._anomalies.push({
    type: type,
    title: title,
    frame: this.eng.frame,
    data: data,
    timestamp: new Date().toISOString()
  });
};

// ══════════════════════════════════════════
// 获取异常列表
// ══════════════════════════════════════════
A.AnomalyDetector.prototype.getAnomalies = function() {
  return this._anomalies.slice();
};

// ══════════════════════════════════════════
// 生成异常报告
// ══════════════════════════════════════════
A.AnomalyDetector.prototype.generateReport = function() {
  var categories = {
    physics: 0,
    state: 0,
    logic: 0,
    unexpected: 0
  };
  for (var i = 0; i < this._anomalies.length; i++) {
    var t = this._anomalies[i].type;
    if (t.indexOf('physics') === 0) categories.physics++;
    else if (t.indexOf('state') === 0) categories.state++;
    else if (t.indexOf('logic') === 0) categories.logic++;
    else categories.unexpected++;
  }

  return {
    detectorVersion: '1.0',
    totalAnomalies: this._anomalies.length,
    categories: categories,
    anomalies: this._anomalies,
    summary: this._anomalies.length === 0
      ? '未发现异常'
      : '发现' + this._anomalies.length + '个异常: 物理=' + categories.physics + ' 状态=' + categories.state + ' 逻辑=' + categories.logic + ' 未知=' + categories.unexpected
  };
};

})();