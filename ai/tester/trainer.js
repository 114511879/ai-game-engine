/**
 * trainer.js v1.0 — 强化学习系统
 *
 * 让AI试玩可以通过奖励/惩罚机制学习如何更有效地发现Bug
 *
 * 奖励机制:
 *   发现bug: +100
 *   正常操作: 0
 *   死亡: -10
 *   发现新类型异常: +200 （探索奖励）
 *
 * 学习策略:
 *   - 记录哪些操作组合导致了bug发现
 *   - 在后续测试中增加这些操作组合的频率
 *   - 减少无效操作（如长时间不操作）
 */
(function(){var A=window.AGE;

A.RLTrainer = function() {
  this._episodes = [];         // 训练片段
  this._currentEpisode = null;
  this._totalReward = 0;
  this._strategy = {};         // 策略表 {actionType: {count, bugFound, weight}}
  this._actionTypes = [
    'edgeTest', 'jumpSpam', 'directionSpam', 'skillCombo',
    'normal', 'extreme', 'idle', 'retreat'
  ];

  // 初始化策略权重
  for (var i = 0; i < this._actionTypes.length; i++) {
    this._strategy[this._actionTypes[i]] = {
      count: 0,
      bugFound: 0,
      weight: 1.0   // 初始权重相同
    };
  }
};

// ══════════════════════════════════════════
// 开始一个训练片段
// ══════════════════════════════════════════
A.RLTrainer.prototype.startEpisode = function() {
  this._currentEpisode = {
    actions: [],
    rewards: [],
    bugFound: 0,
    newBugTypes: [],
    totalReward: 0,
    startTime: Date.now()
  };
};

// ══════════════════════════════════════════
// 记录操作
// ══════════════════════════════════════════
A.RLTrainer.prototype.recordAction = function(actionType, result) {
  if (!this._currentEpisode) return;

  this._currentEpisode.actions.push({
    type: actionType,
    time: Date.now(),
    result: result || 'normal'
  });

  // 更新策略
  if (this._strategy[actionType]) {
    this._strategy[actionType].count++;
  }
};

// ══════════════════════════════════════════
// 给予奖励
// ══════════════════════════════════════════
A.RLTrainer.prototype.reward = function(amount, reason) {
  if (!this._currentEpisode) return;
  this._currentEpisode.totalReward += amount;
  this._totalReward += amount;
  this._currentEpisode.rewards.push({amount: amount, reason: reason});
};

// ══════════════════════════════════════════
// 记录Bug发现
// ══════════════════════════════════════════
A.RLTrainer.prototype.recordBugFound = function(bugType, actionType) {
  if (!this._currentEpisode) return;

  this._currentEpisode.bugFound++;

  // 检查是否是新类型Bug
  var isNew = true;
  for (var i = 0; i < this._episodes.length; i++) {
    var ep = this._episodes[i];
    if (ep.newBugTypes && ep.newBugTypes.indexOf(bugType) >= 0) {
      isNew = false;
      break;
    }
  }
  if (isNew) {
    this._currentEpisode.newBugTypes.push(bugType);
    this.reward(200, '发现新类型Bug: ' + bugType);
  } else {
    this.reward(100, '发现Bug: ' + bugType);
  }

  // 更新策略: 给发现bug的操作类型增加权重
  if (actionType && this._strategy[actionType]) {
    this._strategy[actionType].bugFound++;
    this._strategy[actionType].weight = 1.0 + (this._strategy[actionType].bugFound / Math.max(1, this._strategy[actionType].count)) * 2.0;
  }
};

// ══════════════════════════════════════════
// 结束训练片段
// ══════════════════════════════════════════
A.RLTrainer.prototype.endEpisode = function(success) {
  if (!this._currentEpisode) return null;

  this._currentEpisode.endTime = Date.now();
  this._currentEpisode.duration = this._currentEpisode.endTime - this._currentEpisode.startTime;
  this._currentEpisode.success = success;

  // 死亡惩罚
  if (!success) {
    this.reward(-10, '测试失败');
  }

  this._episodes.push(this._currentEpisode);
  var ep = this._currentEpisode;
  this._currentEpisode = null;

  return ep;
};

// ══════════════════════════════════════════
// 选择下一个操作（基于策略权重）
// ══════════════════════════════════════════
A.RLTrainer.prototype.selectAction = function() {
  var totalWeight = 0;
  for (var i = 0; i < this._actionTypes.length; i++) {
    totalWeight += this._strategy[this._actionTypes[i]].weight;
  }

  var rand = Math.random() * totalWeight;
  var cumulative = 0;

  for (var j = 0; j < this._actionTypes.length; j++) {
    cumulative += this._strategy[this._actionTypes[j]].weight;
    if (rand <= cumulative) {
      return this._actionTypes[j];
    }
  }

  return this._actionTypes[0];
};

// ══════════════════════════════════════════
// 获取策略建议
// ══════════════════════════════════════════
A.RLTrainer.prototype.getStrategyAdvice = function() {
  var sorted = [];
  for (var k in this._strategy) {
    if (this._strategy.hasOwnProperty(k)) {
      sorted.push({
        action: k,
        weight: this._strategy[k].weight,
        bugFound: this._strategy[k].bugFound,
        totalCount: this._strategy[k].count,
        bugRate: this._strategy[k].count > 0
          ? (this._strategy[k].bugFound / this._strategy[k].count * 100).toFixed(1) + '%'
          : '0%'
      });
    }
  }
  sorted.sort(function(a, b) { return b.weight - a.weight; });

  return {
    totalEpisodes: this._episodes.length,
    totalReward: this._totalReward,
    strategy: sorted,
    recommendation: sorted.length > 0
      ? '建议优先使用 [' + sorted[0].action + '] 操作，Bug发现率最高'
      : '暂无足够数据'
  };
};

// ══════════════════════════════════════════
// 生成训练报告
// ══════════════════════════════════════════
A.RLTrainer.prototype.generateReport = function() {
  var totalBugs = 0;
  for (var i = 0; i < this._episodes.length; i++) {
    totalBugs += this._episodes[i].bugFound || 0;
  }

  return {
    trainerVersion: '1.0',
    totalEpisodes: this._episodes.length,
    totalReward: this._totalReward,
    totalBugsFound: totalBugs,
    averageBugsPerEpisode: this._episodes.length > 0
      ? (totalBugs / this._episodes.length).toFixed(1)
      : '0',
    strategy: this.getStrategyAdvice(),
    summary: '训练完成: ' + this._episodes.length + '次测试, 发现' + totalBugs + '个Bug, 总奖励' + this._totalReward
  };
};

// ══════════════════════════════════════════
// 重置训练
// ══════════════════════════════════════════
A.RLTrainer.prototype.reset = function() {
  this._episodes = [];
  this._currentEpisode = null;
  this._totalReward = 0;
  for (var i = 0; i < this._actionTypes.length; i++) {
    this._strategy[this._actionTypes[i]] = {
      count: 0,
      bugFound: 0,
      weight: 1.0
    };
  }
};

})();