/**
 * agent.js v1.0 — AI试玩Agent（视觉感知 + 探索模式 + 目标导向）
 *
 * 升级点:
 *   - 视觉感知: 读取游戏画面/UI/地图，类似人玩游戏
 *   - 探索模式: 主动尝试卡地图边缘、连续点击、快速切换、极端操作
 *   - 目标: "寻找异常"而非"完成游戏"
 *   - 记录所有操作，支持Bug复现
 */
(function(){var A=window.AGE;

A.AITestAgent = function(engine) {
  this.eng = engine;
  this.frame = 0;
  this.maxFrames = 3600;       // 最多60秒
  this._active = false;
  this._done = false;
  this._mode = 'explore';      // 'explore' | 'focused' | 'stress'
  this._modeTimer = 0;
  this._actionLog = [];        // 记录所有操作，用于Bug复现
  this._actionTimer = 0;
  this._currentAction = null;

  // 视觉感知缓存
  this._perception = {
    playerX: 0, playerY: 0, playerHP: 0,
    enemiesNear: [], enemiesOnScreen: [],
    bossExists: false, bossHP: 0, bossPhase: 0,
    projectilesNear: [],
    groundY: 330,
    gameWidth: 800, gameHeight: 400,
    obstacles: [],
    powerupsNear: [],
    edgeDistance: 0  // 距离地图边缘
  };

  // 探索策略
  this._exploreState = {
    phase: 0,           // 当前探索阶段
    edgeTests: 0,       // 边缘测试次数
    spamTests: 0,       // 连续点击测试次数
    comboSwitch: 0,     // 技能切换测试次数
    jumpSpam: 0,        // 连续跳跃测试
    directionSpam: 0,   // 方向快速切换
    pauseCount: 0       // 暂停/恢复测试
  };

  // 聚焦测试参数
  this._focusTarget = null;  // 当前聚焦测试目标
  this._focusParam = null;
};

A.AITestAgent.prototype.start = function(mode) {
  this.frame = 0;
  this._active = true;
  this._done = false;
  this._mode = mode || 'explore';
  this._modeTimer = 0;
  this._actionLog = [];
  this._actionTimer = 0;
  this._currentAction = null;
  this._exploreState = {
    phase: 0, edgeTests: 0, spamTests: 0,
    comboSwitch: 0, jumpSpam: 0, directionSpam: 0, pauseCount: 0
  };
  this._focusTarget = null;
  this._focusParam = null;
};

A.AITestAgent.prototype.stop = function() {
  this._active = false;
  this._done = true;
};

// ══════════════════════════════════════════
// 视觉感知 —— 读取游戏状态，类似人眼看画面
// ══════════════════════════════════════════
A.AITestAgent.prototype._perceive = function() {
  var e = this.eng, p = e.player;
  var P = this._perception;

  P.playerX = p.x;
  P.playerY = p.y;
  P.playerHP = p.hp;
  P.groundY = e.groundY || 330;
  P.gameWidth = e.canvas ? e.canvas.width : 800;
  P.gameHeight = e.canvas ? e.canvas.height : 400;
  P.edgeDistance = P.gameWidth - p.x - p.w;

  // 感知敌人
  P.enemiesNear = [];
  P.enemiesOnScreen = [];
  var ems = e.enemyMgr ? e.enemyMgr.enemies.filter(function(x){return x.hp>0;}) : [];
  for (var i = 0; i < ems.length; i++) {
    var en = ems[i];
    P.enemiesOnScreen.push({x: en.x, y: en.y, w: en.w, h: en.h, hp: en.hp, type: en.type||'normal'});
    if (en.x > p.x && en.x - p.x < 300) {
      P.enemiesNear.push({x: en.x, y: en.y, w: en.w, h: en.h, hp: en.hp, type: en.type||'normal', dist: en.x - p.x});
    }
  }

  // 感知Boss
  P.bossExists = !!(e.bossSystem && e.bossSystem.hp > 0);
  if (P.bossExists) {
    P.bossHP = e.bossSystem.hp;
    P.bossPhase = e.bossSystem.phaseManager ? e.bossSystem.phaseManager.currentPhase : 0;
  }

  // 感知弹幕
  P.projectilesNear = [];
  if (e._projectiles) {
    for (var j = 0; j < e._projectiles.length; j++) {
      var pr = e._projectiles[j];
      if (pr.hp > 0 && pr.x > p.x - 50 && pr.x < p.x + p.w + 50) {
        P.projectilesNear.push({x: pr.x, y: pr.y, w: pr.w, h: pr.h, fromBoss: pr.fromBoss});
      }
    }
  }

  // 感知道具
  P.powerupsNear = [];
  if (e.powerupMgr) {
    for (var k = 0; k < e.powerupMgr.powerups.length; k++) {
      var pu = e.powerupMgr.powerups[k];
      if (pu.hp !== 0 && pu.x > p.x - 50 && pu.x < p.x + 200) {
        P.powerupsNear.push({x: pu.x, y: pu.y, type: pu.type});
      }
    }
  }

  return P;
};

// ══════════════════════════════════════════
// 主更新循环
// ══════════════════════════════════════════
A.AITestAgent.prototype.update = function() {
  if (!this._active || this._done) return;
  this.frame++;
  var e = this.eng, p = e.player;

  // 视觉感知
  this._perceive();

  // 检查终止条件
  if (p.hp <= 0 || e.gameOver || e._win) {
    this._done = true;
    return;
  }
  if (this.frame >= this.maxFrames) {
    this._done = true;
    return;
  }

  // 每2帧执行一次操作
  this._actionTimer++;
  if (this._actionTimer < 2) return;
  this._actionTimer = 0;

  this._modeTimer++;

  // 根据模式执行不同策略
  switch (this._mode) {
    case 'explore':
      this._tickExplore();
      break;
    case 'focused':
      this._tickFocused();
      break;
    case 'stress':
      this._tickStress();
      break;
  }
};

// ══════════════════════════════════════════
// 探索模式 —— 主动寻找异常
// ══════════════════════════════════════════
A.AITestAgent.prototype._tickExplore = function() {
  var P = this._perception;
  var phase = this._exploreState.phase;

  // 每60帧切换探索阶段
  if (this._modeTimer % 60 === 0) {
    this._exploreState.phase = (this._exploreState.phase + 1) % 8;
  }

  switch (this._exploreState.phase) {
    case 0: // 边缘测试 —— 卡地图边缘
      this._act('edgeTest');
      break;
    case 1: // 连续跳跃 —— 测试碰撞检测
      this._act('jumpSpam');
      break;
    case 2: // 快速方向切换 —— 测试输入处理
      this._act('directionSpam');
      break;
    case 3: // 技能组合 —— 测试技能冷却/状态
      this._act('skillCombo');
      break;
    case 4: // 正常战斗（基准）
      this._act('normal');
      break;
    case 5: // 极端操作 —— 同时按多个键
      this._act('extreme');
      break;
    case 6: // 站立不动 —— 测试默认行为
      this._act('idle');
      break;
    case 7: // 后退攻击 —— 测试边界
      this._act('retreat');
      break;
  }
};

// ══════════════════════════════════════════
// 行为执行
// ══════════════════════════════════════════
A.AITestAgent.prototype._act = function(type) {
  var e = this.eng, p = e.player;
  var P = this._perception;
  var action = {frame: this.frame, type: type, keys: [], skills: []};

  switch (type) {
    case 'edgeTest':
      // 疯狂向右冲，测试地图边缘
      this._pressKey('arrowright');
      if (P.edgeDistance < 30 || this._modeTimer % 10 === 0) {
        this._doJump();
      }
      // 如果卡在边缘，尝试向左
      if (this._modeTimer % 40 > 20 && P.playerX > P.gameWidth - 50) {
        this._pressKey('arrowleft');
      }
      action.keys = ['arrowright', 'jump'];
      this._exploreState.edgeTests++;
      break;

    case 'jumpSpam':
      // 连续跳跃100次
      this._doJump();
      if (this._modeTimer % 3 === 0) this._pressKey('arrowright');
      else if (this._modeTimer % 3 === 1) this._pressKey('arrowleft');
      action.keys = ['jump'];
      this._exploreState.jumpSpam++;
      break;

    case 'directionSpam':
      // 快速切换方向
      var t = this._modeTimer % 6;
      if (t < 2) this._pressKey('arrowright');
      else if (t < 4) this._pressKey('arrowleft');
      else this._doJump();
      action.keys = ['direction_switch'];
      this._exploreState.directionSpam++;
      break;

    case 'skillCombo':
      // 快速使用各种技能
      var sk = this._modeTimer % 8;
      if (sk < 2) { this._tryUse('fireball'); action.skills.push('fireball'); }
      else if (sk < 4) { this._tryUse('dash'); action.skills.push('dash'); }
      else if (sk < 6) { this._tryUse('shield'); action.skills.push('shield'); }
      if (sk % 2 === 0) this._pressKey('arrowright');
      else this._pressKey('arrowleft');
      if (this._modeTimer % 5 === 0) this._doJump();
      this._exploreState.comboSwitch++;
      break;

    case 'normal':
      // 正常战斗
      if (P.enemiesNear.length > 0 || P.bossExists) {
        this._tryUse('fireball');
        if (P.bossExists) this._tryUse('shield');
        var near = P.enemiesNear[0];
        if (near && near.dist < 80) {
          this._pressKey('arrowleft');
          if (near.dist < 50) this._doJump();
        } else {
          this._pressKey('arrowright');
        }
      } else {
        this._pressKey('arrowright');
        if (this._modeTimer % 20 === 0) this._doJump();
      }
      action.keys = ['fireball', 'move'];
      break;

    case 'extreme':
      // 同时按多个键 + 快速操作
      this._pressKey('arrowright');
      this._pressKey('arrowleft');
      this._doJump();
      this._tryUse('fireball');
      this._tryUse('dash');
      action.keys = ['multi_key', 'fireball', 'dash', 'jump'];
      break;

    case 'idle':
      // 完全不动，测试默认行为/被动死亡
      action.keys = ['idle'];
      this._exploreState.pauseCount++;
      break;

    case 'retreat':
      // 后退+攻击
      this._pressKey('arrowleft');
      this._tryUse('fireball');
      if (this._modeTimer % 8 === 0) this._doJump();
      action.keys = ['arrowleft', 'fireball', 'jump'];
      break;
  }

  this._actionLog.push(action);
  this._currentAction = action;
};

// ══════════════════════════════════════════
// 聚焦模式 —— 针对特定场景测试
// ══════════════════════════════════════════
A.AITestAgent.prototype._tickFocused = function() {
  var P = this._perception;
  var ft = this._focusTarget;

  switch (ft) {
    case 'boss_360':
      // 测试Boss背后攻击
      this._pressKey('arrowright');
      this._tryUse('fireball');
      if (this._modeTimer % 20 === 0) this._doJump();
      break;
    case 'wall_clip':
      // 测试穿墙
      this._pressKey('arrowright');
      if (this._modeTimer % 3 === 0) this._doJump();
      break;
    case 'edge_fall':
      // 测试掉落
      this._pressKey('arrowright');
      if (this._modeTimer % 5 === 0) this._doJump();
      break;
    default:
      this._act('normal');
  }
};

// ══════════════════════════════════════════
// 压力模式 —— 高强度操作
// ══════════════════════════════════════════
A.AITestAgent.prototype._tickStress = function() {
  // 每帧高频操作，测试系统稳定性
  this._doJump();
  this._tryUse('fireball');
  this._tryUse('dash');
  this._tryUse('shield');
  if (this._modeTimer % 2 === 0) this._pressKey('arrowright');
  else this._pressKey('arrowleft');
};

// ══════════════════════════════════════════
// 辅助方法
// ══════════════════════════════════════════
A.AITestAgent.prototype._tryUse = function(name) {
  if (this.eng.skillSystem) {
    return this.eng.skillSystem.use(name, this.eng);
  }
  return false;
};

A.AITestAgent.prototype._pressKey = function(k) {
  if (this.eng.plugin && this.eng.plugin.onAllKeys) {
    this.eng.plugin.onAllKeys(this.eng, k);
  }
};

A.AITestAgent.prototype._doJump = function() {
  var e = this.eng;
  e.startCharge();
  // 模拟短暂的蓄力后释放
  setTimeout(function() {
    e.releaseJump();
  }, 50);
};

// ══════════════════════════════════════════
// 生成测试报告
// ══════════════════════════════════════════
A.AITestAgent.prototype.generateReport = function() {
  return {
    agentVersion: '1.0',
    mode: this._mode,
    totalFrames: this.frame,
    survivalTime: Math.floor(this.frame / 60),
    totalActions: this._actionLog.length,
    actionLog: this._actionLog.slice(-50), // 最近50条操作
    exploreStats: this._exploreState,
    endState: {
      playerHP: this._perception.playerHP,
      playerX: this._perception.playerX,
      playerY: this._perception.playerY,
      gameOver: this.eng.gameOver,
      win: this.eng._win
    }
  };
};

})();