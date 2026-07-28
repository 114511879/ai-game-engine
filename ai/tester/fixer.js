/**
 * fixer.js v1.0 — 自动修复Agent
 *
 * 职责: 读取Bug报告，自动修改代码/DSL参数
 *
 * 修复策略:
 *   1. DSL参数修复: 调整HP、spawn_rate、cooldown等
 *   2. 引擎注入修复: 在运行时注入边界检查
 *   3. 回滚修复: 如果修复导致新问题，回退到上一个版本
 */
(function(){var A=window.AGE;

A.AutoFixer = function() {
  this._fixHistory = [];    // 修复历史 [{bug, fix, success}]
  this._dslSnapshots = [];  // DSL快照，用于回滚
  this._maxSnapshots = 5;
};

// ══════════════════════════════════════════
// 分析Bug报告 → 生成修复方案
// ══════════════════════════════════════════
A.AutoFixer.prototype.analyzeAndFix = function(bugReport, currentDSL, engine) {
  if (!bugReport || !bugReport.reports || bugReport.reports.length === 0) {
    return {dsl: currentDSL, fixes: [], success: true};
  }

  // 保存快照
  this._saveSnapshot(currentDSL);

  var fixedDSL = JSON.parse(JSON.stringify(currentDSL || {}));
  var appliedFixes = [];

  for (var i = 0; i < bugReport.reports.length; i++) {
    var bug = bugReport.reports[i];
    var fix = this._generateFix(bug, fixedDSL, engine);
    if (fix) {
      fixedDSL = this._applyFix(fixedDSL, fix, engine);
      appliedFixes.push(fix);
      this._fixHistory.push({
        bug: bug,
        fix: fix,
        success: null  // 待验证
      });
    }
  }

  return {
    dsl: fixedDSL,
    fixes: appliedFixes,
    success: appliedFixes.length > 0,
    totalFixes: appliedFixes.length
  };
};

// ══════════════════════════════════════════
// 生成修复方案
// ══════════════════════════════════════════
A.AutoFixer.prototype._generateFix = function(bug, dsl, engine) {
  var fix = {
    bugType: bug.type,
    bugTitle: bug.title,
    action: '',
    params: {},
    detail: ''
  };

  switch (bug.type) {
    case 'physics_bug':
      if (bug.title.indexOf('掉出地图') >= 0 || bug.title.indexOf('穿') >= 0) {
        fix.action = 'add_boundary_check';
        fix.params = {axis: 'y', min: 0, max: 330};
        fix.detail = '为玩家增加Y轴边界检测';
      } else if (bug.title.indexOf('NaN') >= 0) {
        fix.action = 'add_nan_check';
        fix.params = {};
        fix.detail = '为坐标计算增加NaN检查';
      }
      break;

    case 'state_bug':
      if (bug.title.indexOf('HP=0') >= 0 || bug.title.indexOf('死亡') >= 0) {
        fix.action = 'fix_gameover_trigger';
        fix.params = {};
        fix.detail = '修复HP<=0时的gameOver触发逻辑';
      } else if (bug.title.indexOf('GameState') >= 0) {
        fix.action = 'fix_state_mismatch';
        fix.params = {};
        fix.detail = '修复游戏状态不一致问题';
      }
      break;

    case 'logic_bug':
      if (bug.title.indexOf('技能') >= 0 && bug.title.indexOf('过度') >= 0) {
        fix.action = 'increase_boss_cooldown';
        fix.params = {multiplier: 1.5};
        fix.detail = '增加Boss技能冷却时间50%';
      } else if (bug.title.indexOf('spawn') >= 0) {
        fix.action = 'increase_spawn_interval';
        fix.params = {minInterval: 25};
        fix.detail = '增加敌人spawn最小间隔至25帧';
      } else if (bug.title.indexOf('关卡') >= 0) {
        fix.action = 'fix_level_progression';
        fix.params = {};
        fix.detail = '修复关卡切换逻辑';
      }
      break;

    case 'performance_concern':
      if (bug.title.indexOf('技能使用频率') >= 0) {
        fix.action = 'increase_skill_cooldown';
        fix.params = {skill: 'dash', multiplier: 2.0};
        fix.detail = '增加Dash技能冷却时间100%';
      }
      break;

    case 'design_concern':
      if (bug.title.indexOf('无明确结束') >= 0) {
        fix.action = 'add_win_condition';
        fix.params = {type: 'survive_time', value: 120};
        fix.detail = '添加生存时间胜利条件';
      } else if (bug.title.indexOf('空闲') >= 0) {
        fix.action = 'increase_challenge';
        fix.params = {spawnRate: -30, enemyCount: 2};
        fix.detail = '增加敌人数量和spawn频率';
      }
      break;
  }

  return fix.action ? fix : null;
};

// ══════════════════════════════════════════
// 应用修复到DSL
// ══════════════════════════════════════════
A.AutoFixer.prototype._applyFix = function(dsl, fix, engine) {
  var r = JSON.parse(JSON.stringify(dsl));

  switch (fix.action) {
    case 'add_boundary_check':
      // 注入边界检查到DSL world配置
      r.world = r.world || {};
      r.world._boundaryCheck = true;
      r.world._maxY = fix.params.max || 330;
      r.world._minY = fix.params.min || 0;
      break;

    case 'add_nan_check':
      r.world = r.world || {};
      r.world._nanCheck = true;
      break;

    case 'fix_gameover_trigger':
      r.player = r.player || {};
      r.player._autoGameOver = true;
      break;

    case 'fix_state_mismatch':
      r.world = r.world || {};
      r.world._stateSync = true;
      break;

    case 'increase_boss_cooldown':
      if (r.levels) {
        for (var i = 0; i < r.levels.length; i++) {
          var lv = r.levels[i];
          if (lv.boss && lv.boss.skills) {
            for (var j = 0; j < lv.boss.skills.length; j++) {
              var sk = lv.boss.skills[j];
              if (sk.cooldown) {
                sk.cooldown = Math.round(sk.cooldown * (fix.params.multiplier || 1.5));
              }
            }
          }
        }
      }
      break;

    case 'increase_spawn_interval':
      if (r.enemies && r.enemies[0]) {
        r.enemies[0].spawn_rate = Math.max(
          fix.params.minInterval || 25,
          (r.enemies[0].spawn_rate || 40)
        );
      }
      break;

    case 'fix_level_progression':
      r.world = r.world || {};
      r.world._levelGuard = true;
      break;

    case 'increase_skill_cooldown':
      if (r.skills) {
        for (var k = 0; k < r.skills.length; k++) {
          if (r.skills[k].name === (fix.params.skill || 'dash') && r.skills[k].cooldown) {
            r.skills[k].cooldown = Math.round(r.skills[k].cooldown * (fix.params.multiplier || 2.0));
          }
        }
      }
      break;

    case 'add_win_condition':
      r.rules = r.rules || {};
      r.rules.win_condition = fix.params.type || 'survive_time';
      r.rules.win_value = fix.params.value || 120;
      break;

    case 'increase_challenge':
      if (r.enemies && r.enemies[0]) {
        r.enemies[0].spawn_rate = Math.max(20, (r.enemies[0].spawn_rate || 40) + (fix.params.spawnRate || -30));
      }
      if (r.levels) {
        for (var m = 0; m < r.levels.length; m++) {
          if (r.levels[m].enemies) {
            r.levels[m].enemies.count = (r.levels[m].enemies.count || 3) + (fix.params.enemyCount || 2);
          }
        }
      }
      break;
  }

  return r;
};

// ══════════════════════════════════════════
// 运行时注入修复（不修改DSL，直接在引擎中应用）
// ══════════════════════════════════════════
A.AutoFixer.prototype.applyRuntimeFix = function(engine, bugReport) {
  if (!engine || !bugReport || !bugReport.reports) return;

  for (var i = 0; i < bugReport.reports.length; i++) {
    var bug = bugReport.reports[i];

    switch (bug.type) {
      case 'physics_bug':
        // 注入边界检查到引擎
        this._injectBoundaryCheck(engine);
        break;
      case 'state_bug':
        // 注入状态同步
        this._injectStateSync(engine);
        break;
    }
  }
};

A.AutoFixer.prototype._injectBoundaryCheck = function(engine) {
  var origUpdate = engine.update;
  var self = this;
  engine.update = function() {
    var p = engine.player;
    // 边界检查
    if (p.y > 500) { p.y = 330; p.hp = 0; engine._triggerGameOver(); }
    if (isNaN(p.x)) p.x = 50;
    if (isNaN(p.y)) p.y = 330;
    return origUpdate.call(engine);
  };
};

A.AutoFixer.prototype._injectStateSync = function(engine) {
  var origUpdate = engine.update;
  engine.update = function() {
    var p = engine.player;
    // 状态同步
    if (p.hp <= 0 && !engine.gameOver) {
      engine._triggerGameOver();
    }
    return origUpdate.call(engine);
  };
};

// ══════════════════════════════════════════
// DSL快照管理（回滚用）
// ══════════════════════════════════════════
A.AutoFixer.prototype._saveSnapshot = function(dsl) {
  this._dslSnapshots.push(JSON.parse(JSON.stringify(dsl)));
  if (this._dslSnapshots.length > this._maxSnapshots) {
    this._dslSnapshots.shift();
  }
};

A.AutoFixer.prototype.rollback = function() {
  if (this._dslSnapshots.length === 0) return null;
  return this._dslSnapshots.pop();
};

// ══════════════════════════════════════════
// 生成修复报告
// ══════════════════════════════════════════
A.AutoFixer.prototype.generateReport = function() {
  return {
    fixerVersion: '1.0',
    totalFixes: this._fixHistory.length,
    fixHistory: this._fixHistory,
    snapshotsAvailable: this._dslSnapshots.length,
    summary: this._fixHistory.length === 0
      ? '未应用任何修复'
      : '应用了' + this._fixHistory.length + '个修复'
  };
};

})();