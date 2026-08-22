# AI Game Engine

AI驱动的游戏开发平台 — 用自然语言描述，AI自动生成、测试、优化游戏。

## 架构

```
AI Game Engine
│
├── 🧠 AI Game Director        ← 大脑：设计→观察→判断→修改→再测试
│   ├── ai/director/           意图分析 + 蓝图生成 + 节奏控制 + 优化器
│   ├── ai/generator/          AI生成器（DeepSeek API）
│   └── ai/tester/             AI试玩 + Bug检测
│
├── 🎮 Core Engine
│   ├── core/engine/           游戏引擎核心（Engine, GameState, GameStandard）
│   ├── core/runtime/          运行时系统（渲染、碰撞、物理、输入、实体）
│   └── core/dsl/              DSL层（绑定、规则、技能、Boss、地图、资产）
│
├── 🎯 Plugins
│   ├── plugins/runner/        跑酷游戏
│   ├── plugins/shooter/       射击游戏
│   ├── plugins/rpg/           地牢 + 平台 + RPG
│   ├── plugins/story/         文字冒险（三国志140+人物·122事件）
│   ├── plugins/strategy/      三线策略
│   ├── plugins/tower_defense/ 波次塔防
│   ├── plugins/card/          回合卡牌
│   ├── plugins/simulation/    模拟经营
│   ├── plugins/sandbox/       方块沙盒
│   └── plugins/racing/        车道竞速
│
├── 📁 assets/                 游戏资产目录
├── 📄 docs/                   开发文档
└── 📄 CHANGELOG.md            更新日志
```

## 快速开始

1. 用浏览器打开 `AI-ENGINE启动.html`
2. 在输入框中描述你想玩的游戏，例如：
   - `生成一个3关暗黑地牢亡灵Boss`
   - `制作一个快节奏魔法跑酷游戏`
   - `三国文字冒险`
3. 选择模式：
   - **✨ AI生成**：AI生成后直接运行
   - **🔬 生成+测试**：AI生成 + 3轮Bug修复优化
   - **🧠 AI导演**：意图分析 → 蓝图 → 生成 → 测试 → 评估 → 优化闭环
   - **🧬 进化**：生成合格基线后，显式运行受控遗传优化并安全晋升最佳版本
   - **🤖 AI试玩**：对当前游戏手动运行AI测试

## AI 游戏顾问与本地设计检索

自然语言需求会先经过多轮顾问澄清，整理为 Intent DSL，再由本地 RAG 检索设计知识、引擎能力和限制，最后交给生成器。生成成功的游戏可以保存为成功范例，按会话 ID 写入经验库，供后续相似需求检索。

当本地知识覆盖度低于阈值时，RAG 会自动调用免费的 DuckDuckGo Lite 搜索，抓取网页正文、清理脚本和提示注入，带来源 URL 写入网页缓存与 Chroma。前端会显示联网原因、本地/联网命中数量和网页来源。搜索失败会自动退回本地结果。

游戏预设与 AI 生成严格隔离：点击“预设”才会加载内置三国等示例内容；自然语言生成会优先使用本次 Intent DSL 和 AI 返回的 events，缺少 events 时使用对应主题的原创兜底，不会读取其他预设的剧情。

生成游戏默认采用长流程下限：文字冒险至少 30 个事件节点，地牢至少 6 个区域，跑酷 180 秒，平台 150 秒，射击 40 个目标，RPG 30 个敌人，塔防 10 波，卡牌 120 点敌方生命，模拟经营 180 人口，沙盒 40 个方块，竞速 8 圈。AI 提供更长的配置时会保留，不会被这些下限缩短。

RAG 的依赖、BGE 模型、Chroma 数据和缓存统一放在 `E:\111\ai-game-engine-rag`，不会下载到项目目录或系统盘。首次安装（需要联网）执行：

```powershell
cd C:\Users\administered0\Desktop\ai-game-engine-master
.\server\install_rag.ps1
```

启动本地检索服务：

```powershell
.\server\run_rag.ps1
```

服务地址：`http://127.0.0.1:8765`，健康检查：`http://127.0.0.1:8765/health`。前端静态服务保持在 `http://127.0.0.1:4173/`。如果 RAG 服务未启动，前端会显示离线提示并继续使用 Intent DSL 生成，不会阻塞游戏生成。

联网开关和限制可以通过环境变量调整：`AGE_WEB_SEARCH_ENABLED=0` 关闭联网，`AGE_WEB_SEARCH_TIMEOUT=6` 设置单次请求秒数，`AGE_WEB_SEARCH_MAX_RESULTS=5` 设置最多来源数。网页缓存位于 `E:\111\ai-game-engine-rag\web-cache`。

## 游戏类型

| 类型 | 说明 |
|------|------|
| 🏃 跑酷 | 横版跑酷，躲避障碍 |
| 🔫 射击 | 平台射击，消灭敌人 |
| 📦 平台 | 平台跳跃，收集道具 |
| 👑 地牢 | 多关地牢探索，Boss战 |
| 📖 文字冒险 | 三国志全史，140+人物，122事件，历史改写 |
| ⚔️ RPG | 战斗、经验升级、装备强化和药水 |
| 🗺️ 策略 | 调配军费，部署部队，占领三条战线 |
| 🏰 塔防 | 建造升级防御塔，抵御多轮敌人 |
| 🃏 卡牌 | 抽牌、能量、格挡和回合战斗 |
| 🏙️ 模拟经营 | 管理人口、食物、金币和建筑 |
| 🧱 沙盒 | 切换材料，自由放置和拆除方块 |
| 🏎️ 竞速 | 加速、换道、躲避障碍并完成圈数 |

## 技能系统

| 按键 | 技能 | 说明 |
|------|------|------|
| Q / J | 火球 | 远程攻击 |
| R | 闪现 | 快速移动 |
| E | 护盾 | 防御 |

## AI Game Director 2.0 V1

```
用户输入 → Intent Parser → Intent DSL → ContextRouter / RAG
                                            ↓
                        动态专家Agent并行设计（策划/关卡/战斗等）
                                            ↓
                         Pre-QA → 规则引擎 → Director综合
                                            ↓
                            Game Blueprint → Game DSL
                                            ↓
                           FinalQA → Engine → Simulation
                                            ↓
                          EvaluationResult → SimulationMemory
```

Director 模式只消费已确认的 Intent DSL。专家使用 ContextRouter 分配的只读 RAG 上下文，并统一输出 Agent Proposal；硬约束由确定性规则引擎执行，非法 DSL 不会进入 Engine。RAG 或单个专家离线时使用本地降级提案，模拟结果按游戏版本和玩家画像独立保存。

V1 不训练强化学习模型，也不运行遗传算法；它只提供后续优化器可以消费的 EvaluationResult 和 SimulationMemory 协议。

## FitnessCalculator V2

Director 模式在 FinalQA 和有界模拟之后计算统一的 `FitnessResult 2.0`：

```text
EvaluationResult + QAResult + RuntimeMetrics + SimulationMemory Trend
                         + GameBlueprint Metadata（可选）
                                      ↓
                              FitnessCalculator
                                      ↓
              base_fitness - qa_penalty - runtime_penalty
                                      ↓
                         final_fitness（0 到 1）
```

默认配置 `default_v2` 的权重为：`fun_proxy 30%`、`playability 20%`、`balance 20%`、`novelty 10%`、`stability 20%`。权重由 `fitness/WeightProfile.js` 管理，未来可以增加 soulslike、roguelike 等类型配置而不改核心算法。

`fun_proxy` 是根据参与度、完成体验、行为丰富度、节奏和挫败信号计算的行为代理，不代表真实玩家的主观趣味评分。QA 与运行错误只通过独立 penalty 扣减最终 Fitness，不会篡改 `fun_proxy`。缺少 Blueprint Metadata 时，`novelty` 使用中性值 `0.5`、置信度 `0.3`；评分结果同时输出各维度和总体置信度。

V2 的 `final_fitness` 可供版本排序，并预留为未来遗传算法选择信号和强化学习 Reward 来源。V2 本身不执行遗传算法或强化学习训练。

## Genetic Evolution V3

V3 增加默认关闭的遗传优化层。普通生成和普通 Director 不会启动 GA；只有点击 **🧬 进化** 或显式调用 `director.runEvolution(..., {enabled: true})` 才会产生候选评估成本。

优化器只能修改 Game DSL 的 `optimization.variables` 白名单路径，`immutable` 对祖先和后代路径都具有更高优先级。旧 DSL 由 `OptimizationSchemaBuilder` 按游戏类型和引擎能力选择固定安全模板，不扫描或猜测任意数值字段。所有随机决策使用 UTF-8 FNV-1a 32-bit 与 Mulberry32 派生 seed；相同 baseline、配置、seed 和确定性 evaluator 会产生相同候选序列。

默认 `default_ga_v3` 配置为 6 个候选、2 个精英、3 代（`g0`、`g1`、`g2`），Tournament Selection 大小为 3，Uniform Crossover 概率为 0.7。Candidate 依次通过 deterministic FinalQA、Simulation 和 FitnessCalculator V2，唯一优化目标是 `final_fitness`。共享 Engine/canvas 下候选严格顺序评估，不并发运行。

实验 Candidate 只进入 `EvolutionMemory`（`age_evolution_memory_v3`）；只有 `EvolutionPromoter` 成功提交的 Winner 才进入正式 `SimulationMemory` 和版本历史。Promotion 复用 Winner 已有的 EvaluationResult/FitnessResult，不重新模拟，并以 `current_version` 更新作为事务提交点。停止进化会通过 AbortSignal 阻止新候选，清理当前评估、恢复 baseline、保存已有实验轨迹且不执行 Promotion。

V3 不包含强化学习训练，也不替代 Director 现有的 DSL 正确性修补循环。

## Reinforcement PlayTest Agent V4

V4 增加默认关闭的 Bug Hunter PlayTest Agent。只有在 **🧬 进化** 面板中明确勾选 Bug Hunter PlayTest，或通过 `playtest.enabled: true` 显式调用时，才会增加 Discovery 和 Replay 成本。普通生成、普通 Director 和未启用 V4 的 V3 Evolution 保持零次 V4 调用。

V4 使用离散 Core State + Game-Type Adapter、确定性的 Macro Actions、Seeded Tabular Q-Learning，以及 `Event Ledger → Replay Confirmation → Delayed Relabeling` 奖励链。Discovery Episode 最多 40 个 Macro transition、1200 个 simulation tick 和 120 秒安全超时；每个 Run 最多 18 个 Discovery Episode、24 次 Replay attempt。确定性 Replay 使用 1/1，非确定性或未知环境使用 2/3，并按 `first_seen_transition → bug_fingerprint → candidate_id` 确定顺序。

V4 与 V3 的评价语义严格隔离：V3 `SimulationAgent → FitnessCalculator V2 → final_fitness` 仍是唯一 GA 排序依据；V4 Finding 不写入 `EvaluationResult.bugs`，PlayTestReward 不改变 `FitnessResult 2.0`。V4 实验数据进入 EvolutionMemory、ReplayBuffer 和 TrainingMemory，不直接进入正式 SimulationMemory。

训练在 Run 安全关闭后离线执行，使用分层 Replay（`confirmed / negative_evidence / exploration`）和不可变 Dataset Snapshot。新 Policy 必须通过 Fixed Holdout、Hard Gates、Bounded Non-Regression 和 Lexicographic Improvement 才能由唯一的 `PolicyPromoter` 激活；失败、取消和 rollback 都不会覆盖现有 `current_active`。

V4 的正式协议和模块边界见：[V4 Reinforcement PlayTest Agent Design](docs/superpowers/specs/2026-08-22-ai-game-director-v4-reinforcement-playtest-agent-design.md)。

## 技术栈

- 前端：Canvas 2D + Vanilla JS
- AI：DeepSeek Chat API
- 架构：IIFE模块 + window.AGE 命名空间
- DSL：统一JSON格式驱动所有游戏类型

## 作者

benwei
