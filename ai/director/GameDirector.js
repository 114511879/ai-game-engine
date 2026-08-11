/**
 * GameDirector.js v1.0 — AI Game Director（AI游戏导演系统）
 *
 * 职责: 设计 → 观察 → 判断 → 修改 → 再测试，形成闭环
 * 位置: 所有生成系统的"大脑"，位于 AI Generator / PlayTest / DSLBinder 之上
 *
 * 工作流程:
 *   用户需求 → 意图分析 → 游戏蓝图 → 调用各系统 → 生成 → AI试玩 → 分析数据 → 优化 → 重新生成
 */
(function(){var A=window.AGE;

// ══════════════════════════════════════════
// 一、玩家画像 & 意图分析
// ══════════════════════════════════════════
var INTENT_PATTERNS = {
  genre: [
    {re: /快节奏|高速|fast.?pace|竞速|跑酷/, val:'runner'},
    {re: /射击|枪|子弹|弹幕|shoot|gun|bullet/, val:'shooter'},
    {re: /地牢|dungeon|魔王|boss|暗黑|亡灵|dark|necromancer/, val:'dungeon'},
    {re: /平台|跳跃|jump|platform|浮空/, val:'platformer'},
    {re: /故事|剧情|小说|对话|选择|历史|三国|西游|唐朝|战国|古代/, val:'story'},
    {re: /rpg|角色扮演|装备|经验|等级|升级/, val:'rpg'},
    {re: /塔防|tower.?defense/, val:'tower_defense'},
    {re: /沙盒|sandbox|开放世界/, val:'sandbox'}
  ],
  pace: [
    {re: /快节奏|高速|快速|fast|rapid|speed/, val:'fast'},
    {re: /慢|悠闲|relax|slow|chill/, val:'slow'},
    {re: /中等|normal|普通|适中/, val:'medium'}
  ],
  difficulty: [
    {re: /简单|轻松|easy|beginner|新手|入门/, val:'easy'},
    {re: /困难|hard|地狱|hell|高难度|极限/, val:'hard'},
    {re: /中等|medium|normal|普通|适中/, val:'medium'}
  ],
  emotion: [
    {re: /刺激|紧张|exciting|thrilling|惊险/, val:'exciting'},
    {re: /恐怖|horror|scary|害怕|吓人/, val:'horror'},
    {re: /放松|休闲|relax|chill|casual/, val:'relaxing'},
    {re: /史诗|epic|宏大|震撼/, val:'epic'},
    {re: /搞笑|funny|幽默|欢乐/, val:'funny'},
    {re: /黑暗|dark|阴暗|压抑/, val:'dark'}
  ],
  playerType: [
    {re: /休闲|casual|轻松|简单|随便/, val:'casual'},
    {re: /硬核|hardcore|高难度|极限|挑战/, val:'hardcore'},
    {re: /剧情|故事|小说|沉浸|体验/, val:'story_lover'},
    {re: /探索|explore|冒险|发现/, val:'explorer'}
  ]
};

function _matchPatterns(text, patterns) {
  text = (text || '').toLowerCase();
  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i].re.test(text)) return patterns[i].val;
  }
  return null;
}

// ══════════════════════════════════════════
// 二、AI Game Director 核心类
// ══════════════════════════════════════════
A.GameDirector = function(options) {
  options = options || {};
  this.history = [];           // 历史设计记录
  this.blueprint = null;       // 当前游戏蓝图
  this.iteration = 0;          // 当前迭代轮次
  this.maxIterations = 3;      // 最大优化轮次
  this.intent = null;          // 玩家意图分析
  this.bestDSL = null;         // 最优DSL
  this.bestScore = -1;         // 最优评分
  this._statusCallback = null; // 状态回调
  this._directorAgent = options.directorAgent || null;
  this._finalQA = options.finalQA || null;
  this._simulationAgent = options.simulationAgent || null;
  this._simulationMemory = options.simulationMemory || null;
  this._fitnessCalculator = options.fitnessCalculator || null;
  this._runtimeMetrics = options.runtimeMetrics || null;
  this.evaluation = null;
  this.fitness = null;
};

// ══════════════════════════════════════════
// 2.1 意图分析 —— 解析用户输入，输出玩家画像
// ══════════════════════════════════════════
A.GameDirector.prototype.analyzeIntent = function(userPrompt) {
  var up = (userPrompt || '').toLowerCase();

  var genre = _matchPatterns(up, INTENT_PATTERNS.genre) || 'runner';
  var pace = _matchPatterns(up, INTENT_PATTERNS.pace) || 'medium';
  var difficulty = _matchPatterns(up, INTENT_PATTERNS.difficulty) || 'medium';
  var emotion = _matchPatterns(up, INTENT_PATTERNS.emotion) || 'exciting';
  var playerType = _matchPatterns(up, INTENT_PATTERNS.playerType) || 'casual';

  // 暗黑主题自动推断
  if (/暗黑|dark|亡灵|魔王|恐怖/.test(up)) {
    emotion = 'dark';
    if (genre === 'runner') genre = 'dungeon';
  }

  // 快节奏自动调整
  if (pace === 'fast') {
    if (genre === 'runner' || genre === 'shooter') difficulty = 'medium';
  }

  this.intent = {
    genre: genre,
    playerType: playerType,
    pace: pace,
    difficulty: difficulty,
    emotion: emotion,
    raw: userPrompt
  };

  this._log('意图分析: 类型=' + genre + ' 节奏=' + pace + ' 难度=' + difficulty + ' 情感=' + emotion + ' 玩家=' + playerType);
  return this.intent;
};

A.GameDirector.prototype.analyzeIntentDSL = function(intentDSL) {
  var src=intentDSL||{}, raw=src.raw_request||'';
  var type=src.game_type||'runner';
  var genreMap={action_rpg:'dungeon',horror:'dungeon',puzzle:'platformer'};
  var genre=genreMap[type]||type;
  var difficulty=(src.combat&&src.combat.difficulty)||'medium';
  if(difficulty==='normal')difficulty='medium';
  var style=(src.combat&&src.combat.style)||'';
  var pace=(style==='combo'||style==='power_fantasy')?'fast':'medium';
  var world=(src.theme&&src.theme.world)||'';
  var emotion=(src.emotion&&src.emotion.target)||(/horror/.test(world)?'horror':/dark/.test(world)?'dark':'exciting');
  var playerType=(src.progression&&src.progression.growth)?'explorer':difficulty==='hard'?'hardcore':'casual';
  this.intent={genre:genre,playerType:playerType,pace:pace,difficulty:difficulty,emotion:emotion,raw:raw,intentDSL:src};
  this._log('Intent DSL: 类型='+genre+' 节奏='+pace+' 难度='+difficulty+' 情感='+emotion);
  return this.intent;
};

// ══════════════════════════════════════════
// 2.2 游戏蓝图 —— 根据意图生成完整设计文档
// ══════════════════════════════════════════
A.GameDirector.prototype.createBlueprint = function(intent) {
  var it = intent || this.intent;
  if (!it) return null;

  // 基础参数
  var bp = {
    meta: {
      game_type: it.genre,
      title: '',
      director_version: '1.0'
    },
    player: {
      hp: it.difficulty === 'easy' ? 12 : it.difficulty === 'hard' ? 5 : 8,
      speed: it.pace === 'fast' ? 4 : 3,
      jump_power: -12,
      size: 28
    },
    rules: {
      win_condition: it.genre === 'dungeon' ? 'boss_kill' : it.genre === 'shooter' ? 'kill_count' : 'survive_time',
      win_value: it.genre === 'dungeon' ? 1 : 60
    },
    world: {
      gravity: 1.0,
      scroll_speed: it.pace === 'fast' ? 6 : 3,
      ground_y: 330,
      theme: it.emotion === 'dark' ? 'dark' : it.emotion === 'horror' ? 'dark' : it.genre === 'dungeon' ? 'dark' : 'forest'
    },
    experience: {
      target_emotion: it.emotion,
      pace: it.pace,
      difficulty: it.difficulty,
      reward_frequency: it.playerType === 'casual' ? 'high' : 'medium'
    },
    pacing: this._generatePacing(it)
  };

  // 各类型专属参数
  switch (it.genre) {
    case 'dungeon':
      bp.player.hp = Math.max(bp.player.hp, 6);
      bp.levels = [
        {id: 1, name: '暗影之门', difficulty: 1, map: {type: 'dungeon', rooms: [{type: 'normal'}, {type: 'enemy'}]}},
        {id: 2, name: '亡者大厅', difficulty: 2, map: {type: 'dungeon', rooms: [{type: 'enemy'}, {type: 'treasure'}]}},
        {id: 3, name: 'Boss祭坛', difficulty: 3, map: {type: 'dungeon', rooms: [{type: 'boss'}]}}
      ];
      bp.boss = {
        name: it.emotion === 'dark' ? '亡灵之王' : '最终Boss',
        hp: it.difficulty === 'hard' ? 600 : it.difficulty === 'easy' ? 250 : 400,
        phase: 3,
        theme: it.emotion === 'dark' ? 'dark' : 'magic'
      };
      bp.skills = [
        {name: 'fireball', type: 'attack', cooldown: it.pace === 'fast' ? 20 : 30, damage: it.difficulty === 'hard' ? 20 : 25, speed: 10},
        {name: 'dash', type: 'movement', cooldown: it.pace === 'fast' ? 30 : 45, distance: 90},
        {name: 'shield', type: 'defense', cooldown: it.difficulty === 'hard' ? 60 : 80}
      ];
      break;
    case 'shooter':
      bp.player.hp = 5;
      bp.skills = [
        {name: 'fireball', type: 'attack', cooldown: it.pace === 'fast' ? 15 : 25, damage: 1, speed: 10}
      ];
      break;
    case 'runner':
      bp.player.hp = 3;
      bp.skills = [
        {name: 'dash', type: 'movement', cooldown: 40, distance: 80}
      ];
      break;
    case 'story':
      bp.player.hp = 10;
      bp.rules.win_condition = 'story_complete';
      bp.rules.win_value = 0;
      break;
    case 'rpg':
      bp.rules.win_condition='quest_complete';bp.rules.win_value=8;
      bp.rpg={target_kills:8,enemy_hp:18,enemy_damage:2};
      break;
    case 'strategy':
      bp.rules.win_condition='conquest';bp.rules.win_value=3;
      bp.strategy={starting_gold:30,lane_strength:6};
      break;
    case 'tower_defense':
      bp.rules.win_condition='defend_waves';bp.rules.win_value=5;
      bp.tower_defense={waves:5,slots:6,starting_gold:45};
      break;
    case 'card':
      bp.rules.win_condition='enemy_defeated';bp.rules.win_value=1;
      bp.card={enemy_hp:42,hand_size:5,energy:3};
      break;
    case 'simulation':
      bp.rules.win_condition='population_goal';bp.rules.win_value=80;
      bp.simulation={target_population:80,starting_gold:65};
      break;
    case 'sandbox':
      bp.rules.win_condition='build_goal';bp.rules.win_value=12;
      bp.sandbox={width:16,height:8,target_blocks:12};
      break;
    case 'racing':
      bp.rules.win_condition='finish_laps';bp.rules.win_value=3;
      bp.racing={laps:3,lap_distance:900,time_limit:60};
      break;
  }

  this.blueprint = bp;
  this._log('蓝图生成: ' + JSON.stringify({
    genre: bp.meta.game_type,
    hp: bp.player.hp,
    pace: bp.experience.pace,
    difficulty: bp.experience.difficulty
  }));

  return bp;
};

// ══════════════════════════════════════════
// 2.3 节奏控制 —— 生成关卡时间线
// ══════════════════════════════════════════
A.GameDirector.prototype._generatePacing = function(intent) {
  var it = intent || this.intent;
  var pac = it.pace, diff = it.difficulty;

  // 快节奏 → 紧凑时间线
  if (pac === 'fast') {
    return {
      level_flow: [
        {time: 0, event: 'tutorial', desc: '教学引导'},
        {time: 15, event: 'first_enemy', desc: '第一个敌人'},
        {time: 45, event: 'enemy_wave', desc: '敌人波次'},
        {time: 90, event: 'skill_reward', desc: '技能奖励'},
        {time: 150, event: 'boss_intro', desc: 'Boss登场'},
        {time: 160, event: 'boss', desc: 'Boss战'}
      ],
      enemy_spawn_interval: 30,
      reward_interval: 90,
      boss_time: 150
    };
  }

  // 慢节奏 → 宽松时间线
  if (pac === 'slow') {
    return {
      level_flow: [
        {time: 0, event: 'tutorial', desc: '教学引导'},
        {time: 30, event: 'exploration', desc: '探索阶段'},
        {time: 90, event: 'first_enemy', desc: '第一个敌人'},
        {time: 180, event: 'enemy_wave', desc: '敌人波次'},
        {time: 300, event: 'skill_reward', desc: '技能奖励'},
        {time: 420, event: 'boss_intro', desc: 'Boss登场'},
        {time: 450, event: 'boss', desc: 'Boss战'}
      ],
      enemy_spawn_interval: 60,
      reward_interval: 180,
      boss_time: 450
    };
  }

  // 默认中等节奏
  return {
    level_flow: [
      {time: 0, event: 'tutorial', desc: '教学引导'},
      {time: 20, event: 'first_enemy', desc: '第一个敌人'},
      {time: 60, event: 'enemy_wave', desc: '敌人波次'},
      {time: 120, event: 'skill_reward', desc: '技能奖励'},
      {time: 240, event: 'boss_intro', desc: 'Boss登场'},
      {time: 260, event: 'boss', desc: 'Boss战'}
    ],
    enemy_spawn_interval: 45,
    reward_interval: 120,
    boss_time: 260
  };
};

// ══════════════════════════════════════════
// 2.4 蓝图 → DSL 转换（注入导演参数）
// ══════════════════════════════════════════
A.GameDirector.prototype.blueprintToDSL = function(bp) {
  if (!bp) return null;
  var dsl = JSON.parse(JSON.stringify(bp));

  // 注入导演参数
  dsl.director = {
    goal: 'make_fun_game',
    player_type: this.intent ? this.intent.playerType : 'casual',
    experience: bp.experience || {},
    optimization: {
      focus: 'fun',
      avoid: 'frustration'
    },
    pacing: bp.pacing || {}
  };

  // 注入到 meta 中供 AI 参考
  dsl.meta = dsl.meta || {};
  dsl.meta.director_intent = this.intent ? JSON.stringify({
    genre: this.intent.genre,
    pace: this.intent.pace,
    difficulty: this.intent.difficulty,
    emotion: this.intent.emotion
  }) : '';

  return dsl;
};

// ══════════════════════════════════════════
// 三、优化器 —— 分析测试数据，生成修改建议
// ══════════════════════════════════════════
A.GameDirector.prototype.evaluatePlaytest = function(report) {
  if (!report) return {problems: [], score: 0, summary: '无数据'};

  var problems = [];
  var score = 0;

  // 基础评分
  score += (report.bossDamage || 0);           // Boss伤害
  score += (report.enemiesKilled || 0) * 5;    // 杀敌数
  score -= (report.deathCount || 0) * 30;       // 死亡惩罚
  score -= (report.totalDamage || 0) * 2;       // 受伤惩罚
  score += (report.survivalTime || 0);          // 生存时间奖励

  // === 问题检测 ===

  // 1. 死亡过快 (生存<30秒 且 死亡≥2次)
  if (report.survivalTime < 30 && report.deathCount >= 2) {
    problems.push({
      type: 'too_hard',
      severity: 'high',
      detail: '玩家平均生存' + report.survivalTime + '秒，死亡' + report.deathCount + '次',
      fix: {player_hp: '+30%', enemy_damage: '-20%', enemy_spawn_rate: '+15%'}
    });
    score -= 40;
  }

  // 2. 太简单 (生存>180秒 且 0死亡 且 Boss伤害<50)
  if (report.survivalTime > 180 && report.deathCount === 0 && report.bossDamage < 50) {
    problems.push({
      type: 'too_easy',
      severity: 'medium',
      detail: '游戏过于简单，无挑战性',
      fix: {enemy_spawn_rate: '-20%', boss_hp: '+30%', enemy_count: '+1'}
    });
    score -= 20;
  }

  // 3. 技能未使用 (shotsFired < 5 且 生存>60秒)
  if (report.shotsFired < 5 && report.survivalTime > 60) {
    problems.push({
      type: 'skills_unused',
      severity: 'medium',
      detail: '技能使用率过低(' + report.shotsFired + '次)',
      fix: {skill_cooldown: '-50%', skill_damage: '+30%'}
    });
    score -= 15;
  }

  // 4. Boss打不动 (Boss伤害<30 且 生存>120秒)
  if (report.bossDamage < 30 && report.survivalTime > 120 && report.deathCount < 2) {
    problems.push({
      type: 'boss_too_tanky',
      severity: 'medium',
      detail: 'Boss战伤害仅' + report.bossDamage + '，玩家打不动',
      fix: {boss_hp: '-30%', player_damage: '+20%'}
    });
    score -= 15;
  }

  // 5. 受伤过多 (totalDamage > 15 且 生存<90秒)
  if (report.totalDamage > 15 && report.survivalTime < 90) {
    problems.push({
      type: 'too_much_damage',
      severity: 'high',
      detail: '玩家受伤' + report.totalDamage + '点，生存仅' + report.survivalTime + '秒',
      fix: {enemy_damage: '-30%', player_hp: '+20%', shield_cooldown: '-30%'}
    });
    score -= 25;
  }

  // 6. 玩家空闲 (敌人数<3 且 生存>60秒)
  if (report.enemiesKilled < 3 && report.survivalTime > 60) {
    problems.push({
      type: 'player_idle',
      severity: 'low',
      detail: '杀敌数过少(' + report.enemiesKilled + ')，玩家可能无聊',
      fix: {enemy_spawn_rate: '-25%', event_frequency: '+30%'}
    });
    score -= 10;
  }

  // 7. Boss秒杀 (Boss伤害>200 且 生存<60秒)
  if (report.bossDamage > 200 && report.survivalTime < 60) {
    problems.push({
      type: 'boss_too_weak',
      severity: 'low',
      detail: 'Boss被快速击杀',
      fix: {boss_hp: '+50%', boss_phase: '+1'}
    });
    score -= 10;
  }

  return {
    problems: problems,
    score: score,
    summary: problems.length === 0 ? '游戏体验良好' : '发现' + problems.length + '个优化点',
    status: problems.length === 0 ? '通过' : '需优化'
  };
};

// ══════════════════════════════════════════
// 3.1 生成优化方案 → 修改 DSL
// ══════════════════════════════════════════
A.GameDirector.prototype.generateOptimizations = function(problems) {
  if (!problems || problems.length === 0) return {};

  var changes = {};
  for (var i = 0; i < problems.length; i++) {
    var p = problems[i];
    var fix = p.fix || {};

    // 合并所有修改（后面的覆盖前面的）
    for (var key in fix) {
      if (fix.hasOwnProperty(key)) {
        changes[key] = fix[key];
      }
    }
  }

  this._log('优化方案: ' + JSON.stringify(changes));
  return changes;
};

// ══════════════════════════════════════════
// 3.2 应用优化到 DSL
// ══════════════════════════════════════════
A.GameDirector.prototype.applyOptimizations = function(dsl, changes) {
  if (!dsl || !changes) return dsl;
  var r = JSON.parse(JSON.stringify(dsl));

  // 玩家HP调整
  if (changes.player_hp) {
    var pct = parseFloat(changes.player_hp) || 0;
    if (r.player) r.player.hp = Math.max(3, Math.min(16, Math.round((r.player.hp || 8) * (1 + pct / 100))));
  }

  // 敌人伤害调整
  if (changes.enemy_damage) {
    var edPct = parseFloat(changes.enemy_damage) || 0;
    if (r.entities && r.entities.enemies) {
      for (var i = 0; i < r.entities.enemies.length; i++) {
        if (r.entities.enemies[i].damage) {
          r.entities.enemies[i].damage = Math.max(1, Math.round(r.entities.enemies[i].damage * (1 + edPct / 100)));
        }
      }
    }
  }

  // 敌人spawn率调整
  if (changes.enemy_spawn_rate) {
    var srPct = parseFloat(changes.enemy_spawn_rate) || 0;
    if (r.entities && r.entities.enemies && r.entities.enemies[0]) {
      r.entities.enemies[0].spawn_rate = Math.max(20, Math.min(80, Math.round((r.entities.enemies[0].spawn_rate || 40) * (1 + srPct / 100))));
    }
  }

  // Boss HP调整
  if (changes.boss_hp) {
    var bhPct = parseFloat(changes.boss_hp) || 0;
    if (r.levels) {
      for (var j = 0; j < r.levels.length; j++) {
        if (r.levels[j].boss && r.levels[j].boss.hp) {
          r.levels[j].boss.hp = Math.max(100, Math.round(r.levels[j].boss.hp * (1 + bhPct / 100)));
        }
      }
    }
    if (r.entities && r.entities.boss && r.entities.boss.hp) {
      r.entities.boss.hp = Math.max(100, Math.round(r.entities.boss.hp * (1 + bhPct / 100)));
    }
  }

  // 技能冷却调整
  if (changes.skill_cooldown) {
    var scPct = parseFloat(changes.skill_cooldown) || 0;
    if (r.skills) {
      for (var k = 0; k < r.skills.length; k++) {
        if (r.skills[k].cooldown) {
          r.skills[k].cooldown = Math.max(10, Math.round(r.skills[k].cooldown * (1 + scPct / 100)));
        }
      }
    }
  }

  // 技能伤害调整
  if (changes.skill_damage) {
    var sdPct = parseFloat(changes.skill_damage) || 0;
    if (r.skills) {
      for (var m = 0; m < r.skills.length; m++) {
        if (r.skills[m].damage && r.skills[m].name === 'fireball') {
          r.skills[m].damage = Math.max(1, Math.round(r.skills[m].damage * (1 + sdPct / 100)));
        }
      }
    }
  }

  // 玩家伤害调整
  if (changes.player_damage) {
    var pdPct = parseFloat(changes.player_damage) || 0;
    if (r.skills) {
      for (var n = 0; n < r.skills.length; n++) {
        if (r.skills[n].damage && r.skills[n].name === 'fireball') {
          r.skills[n].damage = Math.max(1, Math.round(r.skills[n].damage * (1 + pdPct / 100)));
        }
      }
    }
  }

  // 护盾冷却调整
  if (changes.shield_cooldown) {
    var shPct = parseFloat(changes.shield_cooldown) || 0;
    if (r.skills) {
      for (var p = 0; p < r.skills.length; p++) {
        if (r.skills[p].name === 'shield' && r.skills[p].cooldown) {
          r.skills[p].cooldown = Math.max(20, Math.round(r.skills[p].cooldown * (1 + shPct / 100)));
        }
      }
    }
  }

  // Boss Phase调整
  if (changes.boss_phase) {
    var bpVal = parseInt(changes.boss_phase) || 0;
    if (r.levels) {
      for (var q = 0; q < r.levels.length; q++) {
        if (r.levels[q].boss && r.levels[q].boss.phase) {
          r.levels[q].boss.phase = Math.max(2, Math.min(5, r.levels[q].boss.phase + bpVal));
        }
      }
    }
  }

  return r;
};

// ══════════════════════════════════════════
// 四、完整导演循环 —— 设计→生成→测试→分析→优化→再生
// ══════════════════════════════════════════
A.GameDirector.prototype.runDirectorLoop = async function(userPrompt,intentDSL) {
  var self = this;
  this.iteration = 0;
  this.history = [];
  this.bestDSL = null;
  this.bestScore = -1;

  if (!intentDSL || intentDSL.schema_version !== '1.0') {
    return {success: false, error: 'AI导演需要已确认的Intent DSL'};
  }

  // 阶段1: DirectorAgent消费已确认的Intent DSL，不再解析原始输入。
  this._log('【阶段1】多Agent游戏设计...');
  var intent = this.analyzeIntentDSL(intentDSL);
  var directorAgent = this._directorAgent || new A.DirectorAgent({
    onStatus: function(stage, message) { self._status(message || stage); }
  });
  var design = await directorAgent.design(intentDSL, userPrompt);
  if (!design.success) {
    this._status(design.error || '多Agent设计失败', 'error');
    return design;
  }
  this.blueprint = design.blueprint;
  this._status('Game Blueprint完成 | 专家:' + design.blueprint.agent_trace.length);

  // 阶段2: 使用Intent和Blueprint生成初始DSL。
  this._log('【阶段2】AI生成游戏...');
  this._status('AI生成中...');
  var generationPrompt = A.IntentDSL.toGenerationPrompt(intentDSL, userPrompt)
    + '\n\n已确认的Game Blueprint:\n' + JSON.stringify(design.blueprint, null, 2);
  var raw = await A.callAI(generationPrompt);
  if (!raw) {
    var generationError = A.getAIErrorMessage ? A.getAIErrorMessage('AI生成失败') : 'AI生成失败';
    this._status(generationError, 'error');
    return {success: false, error: generationError};
  }

  // DSLBinder归一化后，FinalQA必须在Plugin选择和Engine加载之前准入。
  var dsl = A.DSLBinder.bind(raw, generationPrompt);
  dsl.intent = intentDSL;
  this._status('Final QA检查Game DSL...');
  var finalQA = this._finalQA || new A.FinalQA();
  var qa = await finalQA.admit(dsl, intentDSL, design.blueprint);
  if (!qa.admitted) {
    var repaired = await A.callAI(generationPrompt + '\n\n上次DSL未通过Final QA:\n' + JSON.stringify(qa));
    if (repaired) {
      dsl = A.DSLBinder.bind(repaired, generationPrompt);
      dsl.intent = intentDSL;
      qa = await finalQA.admit(dsl, intentDSL, design.blueprint);
    }
  }
  if (!qa.admitted) {
    this._status('Game DSL未通过Final QA', 'error');
    return {success: false, error: '生成的Game DSL未通过Final QA', qa: qa, design: design};
  }

  var gt = ((dsl.meta || {}).game_type || 'runner');
  var plugin = A.PluginSelector.select(gt, A.PluginManager);

  dsl.director = {
    goal: 'make_fun_game',
    player_type: intent.playerType,
    blueprint: design.blueprint,
    constraints: design.constraints || {decisions: []},
    agent_trace: design.trace || []
  };

  this._status('AI生成完成[' + gt + '] | 开始优化循环...');

  // 阶段4: 优化循环
  var currentDSL = dsl;
  var allReports = [];
  var totalOptimizations = 0;

  for (var round = 0; round < this.maxIterations; round++) {
    this.iteration = round + 1;
    this._log('--- 优化轮次 ' + this.iteration + '/' + this.maxIterations + ' ---');

    // 4a. 加载游戏
    this._status('轮' + this.iteration + ': 加载游戏...');
    var eng = A._currentEngine;
    if (eng) {
      eng.playTester = null;
      eng.load(currentDSL, plugin);
      A.setGameState(A.STATE.RUNNING);
    }

    // 4b. AI试玩
    this._status('轮' + this.iteration + ': AI试玩中...');
    var tester = new A.PlayTestSystem(eng);
    if (eng) eng.playTester = tester;
    tester.start();

    // Bug检测
    var bugDet = new A.BugDetector(eng);
    bugDet.reset();

    // 等待测试完成
    await new Promise(function(resolve) {
      var check = function() {
        if (bugDet) try { bugDet.update(); } catch (x) {}
        if (!tester._active || tester._done || (eng && (eng.gameOver || eng._win)) || tester.frame >= tester.maxFrames) {
          tester.stop();
          if (eng) eng.playTester = null;
          resolve();
        } else {
          setTimeout(check, 80);
        }
      };
      check();
    });

    // 4c. 收集报告
    if (!tester._report) tester.generateReport();
    var report = tester._report;
    allReports.push(report);

    // 4d. Bug修复
    var fixes = bugDet.generateFixes();
    var bugMsg = '';
    if (fixes.length > 0) {
      bugMsg = ' Bug修复:' + fixes.length + '个';
      currentDSL = bugDet.applyToDSL(currentDSL, fixes);
      totalOptimizations += fixes.length;
    }

    // 4e. 导演评估
    var evaluation = this.evaluatePlaytest(report);
    this._log('评估: ' + evaluation.summary + ' | 评分:' + evaluation.score);

    // 4f. 记录最优
    if (evaluation.score > this.bestScore) {
      this.bestScore = evaluation.score;
      this.bestDSL = JSON.parse(JSON.stringify(currentDSL));
    }

    // 4g. 记录历史
    this.history.push({
      round: this.iteration,
      report: report,
      evaluation: evaluation,
      fixes: fixes.length,
      score: evaluation.score
    });

    this._status('轮' + this.iteration + ': ' + evaluation.summary + bugMsg + ' | 评分:' + evaluation.score);

    // 4h. 如果通过，退出循环
    if (evaluation.problems.length === 0 && fixes.length === 0) {
      this._log('游戏体验良好，退出优化循环');
      break;
    }

    // 4i. 生成优化方案
    if (evaluation.problems.length > 0) {
      var optimizations = this.generateOptimizations(evaluation.problems);
      if (Object.keys(optimizations).length > 0) {
        currentDSL = this.applyOptimizations(currentDSL, optimizations);
        totalOptimizations++;
      }
    }

    // 4j. 同时用DSLFixer再修一轮
    if (report.status !== '通过') {
      currentDSL = A.DSLFixer.fix(currentDSL, report);
    }
  }

  // 阶段5: 输出最终结果
  this._log('【阶段5】导演完成');

  var finalDSL = this.bestDSL || currentDSL;
  var finalScore = this.bestScore < 0 ? 0 : this.bestScore;

  // 加载最优版本
  if (A._currentEngine) {
    A._currentEngine.playTester = null;
    A._currentEngine.load(finalDSL, plugin);
    A.setGameState(A.STATE.RUNNING);
  }

  // FinalQA通过后运行有界画像模拟，计算V2 Fitness，并把版本关系写入独立记忆。
  var simulationEvaluation = null;
  var simulationRecord = null;
  var fitness = null;
  var simulationAgent = this._simulationAgent || (A.SimulationAgent ? new A.SimulationAgent() : null);
  var simulationMemory = this._simulationMemory || (A.SimulationMemory ? new A.SimulationMemory() : null);
  if (A._currentEngine && simulationAgent) {
    this._status('Simulation Agent模拟新手玩家...');
    try {
      simulationEvaluation = await simulationAgent.run(A._currentEngine, {
        persona: 'new_player',
        episodes: 1,
        maxFrames: 1200,
        simulation_id: 'sim_' + Date.now()
      });
    } catch (simulationError) {
      simulationEvaluation = A.AgentProtocols.evaluationResult({
        simulation_id: 'sim_' + Date.now(),
        persona: 'new_player',
        episodes: 0,
        status: 'incomplete',
        bugs: [{type: 'simulation_error', detail: simulationError.message || String(simulationError)}]
      });
    }

    var fitnessGameId = intentDSL.request_id || 'game';
    var fitnessPersona = simulationEvaluation.persona || 'new_player';
    var fitnessHistory = simulationMemory ? simulationMemory.history(fitnessGameId, fitnessPersona) : [];
    var previousRecord = fitnessHistory.length ? fitnessHistory[fitnessHistory.length - 1] : null;
    var priorFitness = previousRecord && previousRecord.fitness && typeof previousRecord.fitness.final_fitness === 'number' ?
      previousRecord.fitness.final_fitness : null;
    var fitnessVersionId = 'v' + Date.now();
    var trendInput = {points: fitnessHistory.length, previous_fitness: priorFitness};
    var runtimeInput = {};
    try {
      runtimeInput = typeof this._runtimeMetrics === 'function' ? this._runtimeMetrics(A._currentEngine, simulationEvaluation) :
        (this._runtimeMetrics || A._currentEngine.runtimeMetrics || {started: true, crashed: false});
    } catch (runtimeError) {
      runtimeInput = {};
    }
    var metadataInput = null;
    if (A.BlueprintMetadata && typeof A.BlueprintMetadata.fromBlueprint === 'function') {
      metadataInput = A.BlueprintMetadata.fromBlueprint(this.blueprint || design.blueprint, finalDSL, intentDSL, {
        game_id: fitnessGameId,
        version_id: fitnessVersionId
      });
    }
    var fitnessCalculator = this._fitnessCalculator || (A.FitnessCalculator ? new A.FitnessCalculator({
      profile: 'default_v2',
      game_id: fitnessGameId,
      version_id: fitnessVersionId,
      fitness_id: 'fitness-' + fitnessGameId + '-' + fitnessVersionId
    }) : null);
    if (fitnessCalculator && typeof fitnessCalculator.calculateFitness === 'function') {
      this._status('FitnessCalculator计算版本评分...');
      try {
        var fitnessQAInput = {
          admitted: qa.admitted,
          structural: qa.structural,
          findings: ((design.preqa && design.preqa.findings) || []).concat(qa.findings || [])
        };
        fitness = fitnessCalculator.calculateFitness(simulationEvaluation, fitnessQAInput, runtimeInput, trendInput, metadataInput);
      } catch (fitnessError) {
        fitness = null;
      }
    }
    if (!fitness && A.AgentProtocols && typeof A.AgentProtocols.fitnessResult === 'function') {
      fitness = A.AgentProtocols.fitnessResult({
        fitness_id: 'fitness-' + fitnessGameId + '-' + fitnessVersionId,
        game_id: fitnessGameId,
        version_id: fitnessVersionId,
        profile: 'default_v2',
        scores: {fun_proxy: 0.5, playability: 0.5, balance: 0.5, novelty: 0.5, stability: 0.5},
        weights: {fun_proxy: 0.3, playability: 0.2, balance: 0.2, novelty: 0.1, stability: 0.2},
        base_fitness: 0,
        final_fitness: 0,
        confidence: {overall: 0.1, fun_proxy: 0.1, playability: 0.1, balance: 0.1, novelty: 0.1, stability: 0.1},
        trend: trendInput,
        explanations: [{factor: 'fitness_calculation_incomplete', dimension: 'fitness', impact: 0, reason: 'FitnessCalculator unavailable or failed'}]
      });
    }
    if (simulationMemory) {
      try {
        simulationRecord = simulationMemory.append({
          run_id: simulationEvaluation.simulation_id,
          game_id: fitnessGameId,
          version_id: fitnessVersionId,
          parent_version: previousRecord ? previousRecord.version_id : null,
          persona: fitnessPersona,
          changes: totalOptimizations ? ['director_optimizations:' + totalOptimizations] : [],
          evaluation: simulationEvaluation.metrics,
          fitness: fitness,
          status: simulationEvaluation.status,
          created_at: Date.now()
        });
      } catch (memoryError) {}
    }
  }
  this.evaluation = simulationEvaluation;
  this.fitness = fitness;

  this._status('导演完成 | Fitness:' + (fitness ? fitness.final_fitness : 'n/a') + ' | 旧评分:' + finalScore + ' | 优化次数:' + totalOptimizations, 'success');

  return {
    success: true,
    dsl: finalDSL,
    plugin: plugin,
    gameType: gt,
    score: finalScore,
    history: this.history,
    totalOptimizations: totalOptimizations,
    blueprint: this.blueprint,
    design: design,
    qa: qa,
    evaluation: simulationEvaluation,
    fitness: fitness,
    simulationRecord: simulationRecord
  };
};

// ══════════════════════════════════════════
// 五、辅助方法
// ══════════════════════════════════════════
A.GameDirector.prototype._log = function(msg) {
  console.log('[Director] ' + msg);
};

A.GameDirector.prototype._status = function(msg, type) {
  if (this._statusCallback) {
    this._statusCallback(msg, type);
  }
  if (typeof A.setStatus === 'function') {
    A.setStatus(msg, type || '');
  }
};

A.GameDirector.prototype.getReport = function() {
  return {
    intent: this.intent,
    blueprint: this.blueprint,
    history: this.history,
    evaluation: this.evaluation,
    fitness: this.fitness,
    bestScore: this.bestScore,
    totalIterations: this.iteration
  };
};

})();
