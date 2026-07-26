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
│   ├── plugins/rpg/           地牢 + 平台游戏
│   └── plugins/story/         文字冒险（三国志140+人物·122事件）
│
├── 📁 assets/                 游戏资产目录
├── 📄 docs/                   开发文档
└── 📄 CHANGELOG.md            更新日志
```

## 快速开始

1. 用浏览器打开 `index.html`
2. 在输入框中描述你想玩的游戏，例如：
   - `生成一个3关暗黑地牢亡灵Boss`
   - `制作一个快节奏魔法跑酷游戏`
   - `三国文字冒险`
3. 选择模式：
   - **✨ AI生成**：AI生成后直接运行
   - **🔬 生成+测试**：AI生成 + 3轮Bug修复优化
   - **🧠 AI导演**：意图分析 → 蓝图 → 生成 → 测试 → 评估 → 优化闭环
   - **🤖 AI试玩**：对当前游戏手动运行AI测试

## 游戏类型

| 类型 | 说明 |
|------|------|
| 🏃 跑酷 | 横版跑酷，躲避障碍 |
| 🔫 射击 | 平台射击，消灭敌人 |
| 📦 平台 | 平台跳跃，收集道具 |
| 👑 地牢 | 多关地牢探索，Boss战 |
| 📖 文字冒险 | 三国志全史，140+人物，122事件，历史改写 |

## 技能系统

| 按键 | 技能 | 说明 |
|------|------|------|
| Q / J | 火球 | 远程攻击 |
| R | 闪现 | 快速移动 |
| E | 护盾 | 防御 |

## AI Game Director 工作流程

```
用户输入 → 意图分析 → 游戏蓝图 → AI生成 → 引擎加载
                                              ↓
                                          AI试玩测试
                                              ↓
                                          Bug检测修复
                                              ↓
                                         导演评估优化
                                              ↓
                                     （最多3轮迭代）
                                              ↓
                                         加载最优版本
```

## 技术栈

- 前端：Canvas 2D + Vanilla JS
- AI：DeepSeek Chat API
- 架构：IIFE模块 + window.AGE 命名空间
- DSL：统一JSON格式驱动所有游戏类型

## 作者

benwei