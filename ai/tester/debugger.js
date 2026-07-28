/**
 * debugger.js v1.0 — Bug分析Agent
 *
 * 职责: 接收异常检测结果，生成结构化Bug报告
 * 输出格式:
 *   {
 *     type: "physics_bug",
 *     title: "玩家穿过地图",
 *     steps: ["向右移动", "连续跳跃", "撞击墙角"],
 *     reason: "collision检测遗漏",
 *     file: "player.js",
 *     suggestion: "增加边界检测"
 *   }
 */
(function(){var A=window.AGE;

A.BugAnalyzer = function() {
  this._reports = [];
  this._analysisHistory = [];
};

// ══════════════════════════════════════════
// 分析异常 → 生成Bug报告
// ══════════════════════════════════════════
A.BugAnalyzer.prototype.analyze = function(anomalyReport, observerReport, agentReport) {
  this._reports = [];
  var anomalies = anomalyReport ? anomalyReport.anomalies || [] : [];

  for (var i = 0; i < anomalies.length; i++) {
    var anom = anomalies[i];
    var report = this._analyzeAnomaly(anom, observerReport, agentReport);
    if (report) this._reports.push(report);
  }

  // 如果没有异常，也检查observer数据中的潜在问题
  this._deepAnalyze(observerReport, agentReport);

  return this._reports;
};

// ══════════════════════════════════════════
// 对单个异常做深度分析
// ══════════════════════════════════════════
A.BugAnalyzer.prototype._analyzeAnomaly = function(anom, obs, agent) {
  var report = {
    type: this._mapType(anom.type),
    severity: this._mapSeverity(anom.type),
    title: anom.title,
    frame: anom.frame,
    detail: (anom.data || {}).detail || '',
    steps: [],
    reason: '',
    file: this._mapFile(anom.type),
    suggestion: ''
  };

  // 根据异常类型生成修复步骤和建议
  switch (anom.type) {
    case 'physics_fall_out':
      report.steps = ['向右移动至地图边缘', '连续跳跃', '撞击边界'];
      report.reason = '地图边界碰撞检测遗漏或无边界限制';
      report.suggestion = '在碰撞检测中增加Y轴下边界检查: if(player.y > maxY) player.y = maxY;';
      break;

    case 'physics_through_ground':
      report.steps = ['跳跃', '落在平台边缘', '角色穿过地面'];
      report.reason = '地面碰撞检测仅检测上表面，未检测穿透';
      report.suggestion = '增加地面穿透检测: if(player.y > groundY) { player.y = groundY; player.isJumping = false; }';
      break;

    case 'physics_nan':
      report.steps = ['游戏中角色坐标异常'];
      report.reason = '坐标计算中出现NaN，可能由于除零或无效运算';
      report.suggestion = '在坐标更新后增加NaN检查: if(isNaN(x)) x = 0; if(isNaN(y)) y = 0;';
      break;

    case 'state_dead_but_running':
      report.steps = ['玩家HP降至0', '游戏未触发GameOver', '玩家可继续操作'];
      report.reason = 'HP检查逻辑中遗漏了gameOver触发条件';
      report.suggestion = '在HP<=0时立即调用_triggerGameOver()，确保状态一致';
      break;

    case 'state_gameover_with_hp':
      report.steps = ['游戏结束', '但玩家HP显示仍有剩余'];
      report.reason = 'gameOver标志设置时机错误，在HP归零前触发';
      report.suggestion = '确保gameOver只在HP<=0时设置，或在gameOver时同步设置HP=0';
      break;

    case 'logic_boss_skill_spam':
      report.steps = ['进入Boss战', 'Boss连续释放技能', '技能冷却未生效'];
      report.reason = 'Boss技能冷却计算错误或冷却变量未正确初始化';
      report.suggestion = '检查Boss技能冷却逻辑: 确保每次释放后重置cooldown计时器';
      break;

    case 'logic_spawn_too_fast':
      report.steps = ['游戏进行中', '敌人大量生成', '帧率下降'];
      report.reason = 'spawn间隔计算错误或spawn_rate配置过低';
      report.suggestion = '增加spawn_rate值或增加spawn间隔的下限检查';
      break;

    case 'logic_level_jump':
      report.steps = ['完成当前关卡', '直接跳到后续关卡', '跳过中间关卡'];
      report.reason = '关卡切换逻辑中索引计算错误';
      report.suggestion = '检查LevelManager中关卡切换逻辑，确保每次只递增1';
      break;

    case 'unexpected_invincible':
      report.steps = ['玩家被敌人包围', '连续受到攻击', 'HP未减少'];
      report.reason = '碰撞检测或伤害计算可能存在逻辑错误';
      report.suggestion = '检查碰撞检测函数和伤害计算逻辑，确保敌人在碰撞时造成伤害';
      break;

    default:
      report.steps = ['未知异常'];
      report.reason = '未分类的异常，需要人工分析';
      report.suggestion = '建议人工审查相关代码';
  }

  return report;
};

// ══════════════════════════════════════════
// 深度分析 —— 即使没有异常，也检查潜在问题
// ══════════════════════════════════════════
A.BugAnalyzer.prototype._deepAnalyze = function(obs, agent) {
  if (!obs && !agent) return;

  // 从observer数据中检查
  if (obs && obs.behavior) {
    var b = obs.behavior;

    // 技能使用率过高
    if (b.dashCount > 200) {
      this._reports.push({
        type: 'performance_concern',
        severity: 'low',
        title: '技能使用频率异常',
        detail: 'Dash使用' + b.dashCount + '次，可能影响游戏平衡',
        steps: ['频繁使用Dash技能'],
        reason: '技能冷却时间可能过短',
        file: 'core/dsl/SkillSystem.js',
        suggestion: '增加Dash技能冷却时间或限制使用次数'
      });
    }

    // 长期空闲
    if (b.idleFrames > 1800 && obs.totalFrames > 2400) {
      this._reports.push({
        type: 'design_concern',
        severity: 'low',
        title: '玩家长期空闲',
        detail: '空闲帧数=' + b.idleFrames + ' 总帧数=' + obs.totalFrames,
        steps: ['长时间不操作'],
        reason: '游戏可能缺乏足够的挑战或引导',
        file: 'core/dsl/DSLBinder.js',
        suggestion: '增加敌人spawn频率或添加引导提示'
      });
    }
  }

  // 从agent数据中检查
  if (agent && agent.endState) {
    // 测试完成但未触发任何结束条件
    if (!agent.endState.gameOver && !agent.endState.win && agent.totalFrames >= agent.maxFrames) {
      this._reports.push({
        type: 'design_concern',
        severity: 'medium',
        title: '游戏无明确结束条件',
        detail: '测试运行' + agent.totalFrames + '帧后自然结束，无gameOver或win',
        steps: ['运行游戏至最大帧数'],
        reason: '游戏缺少胜利条件或失败条件',
        file: 'core/dsl/Rules.js',
        suggestion: '添加明确的胜利/失败条件'
      });
    }
  }
};

// ══════════════════════════════════════════
// 类型映射
// ══════════════════════════════════════════
A.BugAnalyzer.prototype._mapType = function(type) {
  if (type.indexOf('physics') === 0) return 'physics_bug';
  if (type.indexOf('state') === 0) return 'state_bug';
  if (type.indexOf('logic') === 0) return 'logic_bug';
  if (type.indexOf('unexpected') === 0) return 'unexpected_bug';
  return 'unknown_bug';
};

A.BugAnalyzer.prototype._mapSeverity = function(type) {
  if (type.indexOf('physics') === 0) return 'high';
  if (type.indexOf('state') === 0) return 'critical';
  if (type.indexOf('logic') === 0) return 'medium';
  if (type.indexOf('unexpected') === 0) return 'medium';
  return 'low';
};

A.BugAnalyzer.prototype._mapFile = function(type) {
  var map = {
    'physics_fall_out': 'core/runtime/Collision.js',
    'physics_through_ground': 'core/runtime/Physics.js',
    'physics_nan': 'core/runtime/Player.js',
    'state_dead_but_running': 'core/engine/Engine.js',
    'state_gameover_with_hp': 'core/engine/Engine.js',
    'logic_boss_skill_spam': 'core/dsl/BossSystem.js',
    'logic_spawn_too_fast': 'core/runtime/Spawner.js',
    'logic_level_jump': 'core/dsl/LevelManager.js',
    'unexpected_invincible': 'core/runtime/Collision.js'
  };
  return map[type] || 'core/engine/Engine.js';
};

// ══════════════════════════════════════════
// 生成完整Bug分析报告
// ══════════════════════════════════════════
A.BugAnalyzer.prototype.generateReport = function() {
  return {
    analyzerVersion: '1.0',
    totalBugs: this._reports.length,
    severity: {
      critical: this._reports.filter(function(r){return r.severity==='critical';}).length,
      high: this._reports.filter(function(r){return r.severity==='high';}).length,
      medium: this._reports.filter(function(r){return r.severity==='medium';}).length,
      low: this._reports.filter(function(r){return r.severity==='low';}).length
    },
    reports: this._reports,
    summary: this._reports.length === 0
      ? '未发现Bug'
      : '发现' + this._reports.length + '个Bug待修复'
  };
};

})();