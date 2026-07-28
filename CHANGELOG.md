# AI Game Engine 更新日志

## v9.3 — AI自主发现问题系统

日期: 2026-07-26

新增:
- AI试玩Agent（agent.js）：视觉感知 + 探索模式 + 目标导向
  - 视觉感知：读取游戏画面/UI/地图，类似人眼看画面
  - 探索模式：8种探索策略（边缘测试、连续跳跃、方向切换、技能组合、极端操作等）
  - 聚焦模式：针对特定场景测试（Boss背后攻击、穿墙、掉落）
  - 压力模式：高强度操作测试系统稳定性
  - 操作日志：记录所有操作，支持Bug复现
- 行为观察器 + 数据监控器（observer.js）
  - 时间序列数据：playerY/X/HP、enemyCount、bossHP、gameState
  - 行为统计：技能使用、跳跃、移动、空闲、攻击、受伤
  - Boss行为监控：技能时间戳、Phase变化、HP变化、冷却异常
  - 碰撞事件记录
- 异常检测系统（anomaly.js）
  - 物理异常：掉出地图、穿过地面、坐标NaN、浮出屏幕
  - 状态异常：HP=0但游戏运行、gameOver与GameState不匹配
  - 逻辑异常：Boss技能CD异常、spawn率异常、关卡跳跃、技能冷却负值
  - 未知事件探索：玩家无敌检测、Boss无法攻击检测
- Bug分析Agent（debugger.js）
  - 结构化Bug报告：type/severity/title/steps/reason/file/suggestion
  - 深度分析：即使无异常也检查潜在问题（技能频率、空闲、结束条件）
- 自动修复Agent（fixer.js）
  - DSL参数修复：HP、spawn_rate、cooldown等参数自动调整
  - 运行时注入修复：边界检查、状态同步
  - DSL快照管理：修复回滚机制
- 强化学习系统（trainer.js）
  - 奖励机制：发现bug +100、新类型bug +200、死亡 -10
  - 策略学习：记录哪些操作组合导致bug发现，动态调整权重
  - 行动选择：基于策略权重选择最优探索操作

修改:
- 无

修复:
- 无

作者: benwei

---

## v9.2 — AI Game Director

日期: 2026-07-26

新增:
- AI Game Director（AI游戏导演系统）：设计→观察→判断→修改→再测试闭环
  - 意图分析：自动识别游戏类型、节奏、难度、情感、玩家画像
  - 游戏蓝图生成：根据意图生成完整设计文档（HP/技能/关卡/节奏线）
  - 节奏控制系统：tutorial→wave→reward→boss 时间线
  - 优化器：分析PlayTest数据，自动检测7类问题并生成修改方案
  - 完整导演循环：最多3轮迭代优化
- 目录重构：core(engine/runtime/dsl) + plugins(runner/shooter/rpg/story) + ai(director/generator/tester)
- CHANGELOG.md / docs/开发日志.md / README.md

修改:
- 项目目录结构从 src/ 扁平化重构为分层架构
- main.js 移出 src/ 到项目根目录
- PlayTestSystem / BugDetector 从 core/ 迁移到 ai/tester/
- DungeonPlugin / PlatformPlugin 归入 plugins/rpg/

修复:
- 无

作者: benwei

---

## v9.1 — 三国志全史 + 历史改写

日期: 2026-07-23 ~ 2026-07-24

新增:
- 三国志140+人物，覆盖魏蜀吴全史
- 122个历史事件，覆盖大事件+日常细枝末节
- 历史改写机制：在落凤坡、麦城、华容道等关键节点可改写历史
- 31位新增人物：徐荣、华雄、颜良、文丑、张任、杨修、祢衡、左慈、孙尚香、蔡文姬等
- 20个新增事件：温酒斩华雄、辕门射戟、张任射凤雏、杨修之死·鸡肋等
- 背景权重系统：武将/谋士/行商/寒门4种出身影响后续内容
- 12种结局系统：关联背景+属性+声望+决策
- dec 决策追踪字段：记录关键历史改写选择

修改:
- 文字冒险游戏节奏放缓，增加日常插曲事件
- 历史事件基于《三国志》可考据内容

修复:
- 暗黑地牢Q键射不出子弹（技能按名查找替代数组索引）
- AI生成时dungeon类型检测遗漏
- 文字冒险循环bug（n值错误+条件失败未清按键状态）
- 事件47选项1循环到18（n值全部指向错误章节）
- 12事件选2投曹操跳刘备事件（两个选项n值重复指向15）
- 曹操线·进位魏王事件选项跳转错误（缺n值导致跳到刘备线）

作者: benwei

---

## v9.0 — Universal DSL 初始版

日期: 2026-07-22

新增:
- Universal DSL：统一JSON格式驱动12种游戏类型
- 5种游戏插件：Runner / Shooter / Platform / Dungeon / Story
- AI生成器：调用DeepSeek API生成游戏DSL
- DSLBinder：DSL验证+默认值注入+技能名规范化
- PluginSelector：自动选择对应游戏插件
- SkillSystem：Q/J=火球 R=闪现 E=护盾
- BossSystem：多阶段Boss战
- MapSystem：程序化地图生成
- AssetSystem：角色/武器/特效渲染
- PlayTestSystem：AI自动试玩
- BugDetector：运行时Bug检测+修复
- 生成+测试模式：3轮迭代优化

作者: benwei