import re
from dataclasses import asdict, dataclass, field
from typing import Any


ENGINE_CAPABILITIES = {
    "game_types": [
        "runner", "shooter", "platformer", "dungeon", "story", "rpg",
        "strategy", "tower_defense", "card", "simulation", "sandbox", "racing",
    ],
    "systems": [
        "boss_phases", "skills", "equipment", "level_progression", "map_rooms",
        "card_turns", "tower_waves", "resource_management", "block_building",
    ],
    "rendering": "Canvas 2D",
}

REFERENCE_GAMES = {
    "黑魂": ["souls_like", "boss_pattern_learning", "stamina", "death_penalty"],
    "黑暗之魂": ["souls_like", "boss_pattern_learning", "stamina", "death_penalty"],
    "艾尔登法环": ["souls_like", "open_world", "hidden_dungeons", "build_variety"],
    "原神": ["open_world", "element_reaction", "character_team"],
    "塞尔达": ["open_world", "systemic_exploration", "environment_puzzle"],
}

SYSTEM_PATTERNS = {
    "magic": r"魔法|法术|元素|火球|冰霜|雷电",
    "boss": r"boss|首领|魔王|头目",
    "equipment": r"武器|装备|护甲|掉落",
    "skill_tree": r"技能树|天赋|成长路线",
    "death_penalty": r"死亡惩罚|掉魂|复活点",
    "stamina": r"体力|耐力|精力条",
}

WORLD_PATTERNS = {
    "open_world": r"开放世界|无缝世界|自由探索",
    "nonlinear": r"非线性|多路线|自由路线",
    "hidden_areas": r"隐藏区域|隐藏地图|秘密区域|隐藏地牢",
    "procedural_map": r"随机地图|程序生成|地图生成",
}


@dataclass
class SearchIntent:
    raw_query: str
    references: list[str] = field(default_factory=list)
    core_experience: list[str] = field(default_factory=list)
    systems: list[str] = field(default_factory=list)
    world: list[str] = field(default_factory=list)
    engine_capabilities: dict[str, Any] = field(default_factory=dict)
    limitations: list[str] = field(default_factory=list)
    rewritten_queries: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class QueryPlanner:
    def plan(self, query: str, intent: dict[str, Any] | None = None) -> SearchIntent:
        text = (query or "").strip()
        result = SearchIntent(raw_query=text, engine_capabilities=ENGINE_CAPABILITIES.copy())

        for game, traits in REFERENCE_GAMES.items():
            if game.lower() in text.lower():
                result.references.append(game)
                result.core_experience.extend(traits)

        for name, pattern in SYSTEM_PATTERNS.items():
            if re.search(pattern, text, re.IGNORECASE):
                result.systems.append(name)
        for name, pattern in WORLD_PATTERNS.items():
            if re.search(pattern, text, re.IGNORECASE):
                result.world.append(name)

        if re.search(r"高难|魂系|黑魂|受苦", text, re.IGNORECASE):
            result.core_experience.extend(["high_difficulty", "pattern_learning"])
        if re.search(r"探索|开放世界|隐藏", text, re.IGNORECASE):
            result.core_experience.append("exploration_reward")

        if intent:
            game_type = intent.get("game_type")
            combat = intent.get("combat") or {}
            theme = intent.get("theme") or {}
            if game_type:
                result.core_experience.append(str(game_type))
            if combat.get("style"):
                result.core_experience.append(str(combat["style"]))
            if theme.get("world"):
                result.world.append(str(theme["world"]))

        if re.search(r"3d|第三人称3d|无缝开放世界|多人在线|mmo", text, re.IGNORECASE):
            result.limitations.append("当前 Canvas 2D 引擎不能直接实现大型 3D 或 MMO；需要降级为 2D 分区开放地图。")
        if "open_world" in result.world:
            result.limitations.append("当前引擎支持房间和分区地图，不支持真正无缝的大型 3D 开放世界。")

        result.references = self._unique(result.references)
        result.core_experience = self._unique(result.core_experience)
        result.systems = self._unique(result.systems)
        result.world = self._unique(result.world)
        result.rewritten_queries = self._rewrite(result)
        return result

    def _rewrite(self, intent: SearchIntent) -> list[str]:
        queries = []
        if intent.references:
            queries.append(" ".join(intent.references + intent.core_experience[:4]) + " 核心机制拆解")
        if intent.systems:
            queries.append(" ".join(intent.systems) + " 游戏系统组合与平衡")
        if intent.world:
            queries.append(" ".join(intent.world) + " 地图结构 探索奖励 隐藏区域")
        if intent.core_experience:
            queries.append(" ".join(intent.core_experience[:6]) + " 玩家体验 失败反馈")
        queries.append(intent.raw_query + " 游戏设计机制")
        return self._unique([query.strip() for query in queries if query.strip()])[:6]

    @staticmethod
    def _unique(items: list[str]) -> list[str]:
        seen = set()
        output = []
        for item in items:
            if item and item not in seen:
                seen.add(item)
                output.append(item)
        return output
