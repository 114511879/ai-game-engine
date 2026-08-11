# AI Game Engine 更新日志

## AI Game Director 2.0 V2 - FitnessCalculator

日期: 2026-08-11

新增:
- `FitnessResult 2.0` 统一评分协议，所有维度与最终评分归一化到 0 到 1
- 配置化 `default_v2` 权重，可扩展类型专属 Weight Profile
- `fun_proxy`、可玩性、平衡性、新颖度和稳定性五维确定性评分
- QA 与 Runtime 独立惩罚层，以及各维度和总体置信度
- 可选 GameBlueprint Metadata 提取，用于提供可验证的新颖度证据
- SimulationMemory 保存版本 Fitness，并输出相对上一版本的 improvement delta

修改:
- Director 在 FinalQA、Engine 加载和 Simulation 后计算 V2 Fitness
- Director UI 优先显示归一化 Fitness 百分比，同时保留旧评分兼容字段

说明:
- `fun_proxy` 仅代表可观测行为参与度代理，不是玩家主观趣味评分
- V2 不执行遗传算法或强化学习训练，只提供版本排序和未来 Reward 接口

---

## v10.0 — 全新聊天式 UI + 本地记忆系统

日期: 2026-08-02

新增:
- 聊天式交互界面：侧边栏 + 聊天区 + 输入工具栏，采用 AI 网页统一风格
  - 侧边栏：品牌标识、新对话按钮、历史对话列表、清空记录
  - 聊天区：欢迎页（含6个建议芯片）、消息气泡（用户/AI 头像区分）
  - 底部输入栏：5种游戏预设快捷按钮 + 导演/测试模式 + 发送按钮
  - 响应式布局：移动端侧边栏可隐藏
- localStorage 记忆系统
  - 对话历史持久化（age_conversations_v10）
  - 游戏 DSL 独立存储（age_game_{convId}），供新标签页读取
  - 支持历史对话回溯：点击侧边栏即可恢复完整对话+游戏卡片
- game.html 独立游戏页面（新标签页打开）
  - 从 URL 参数读取对话 ID，从 localStorage 加载游戏数据
  - 完整引擎初始化：插件注册、输入绑定、游戏循环
  - 返回对话页按钮、重新开始按钮、游戏结束自动提示重开
  - 错误页面：游戏数据不存在时友好提示
- 快捷键支持：Ctrl+Shift+K 新建对话，Enter 发送，Shift+Enter 换行

修改:
- index.html 从单页游戏容器重构为聊天式布局（侧边栏 + 主区域）
- styles.css 从深色游戏主题改为 AI 网页统一风格（白色主题 + 紫色强调色）
- main.js 从命令式按钮重写为 ChatUI + Memory 架构
  - 引擎初始化保留（隐藏 canvas 供导演/测试模式后台使用）
  - 新增 Memory 模块管理 localStorage 读写
  - 新增 ChatUI 模块管理聊天交互全流程
  - 三种生成模式保留：普通生成、生成+测试（3轮优化）、AI 导演

修复:
- 游戏卡片打开新标签页被浏览器弹窗拦截器阻止
  - 从 window.open() 改为 <a target="_blank"> 标准链接
- 已有对话更新时产生重复记录
  - 新对话用 Memory.add，已有对话用 Memory.update

作者: kuangchenjue

---

## v9.3 — AI自主发现问题系统

日期: 2026-07-28

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
