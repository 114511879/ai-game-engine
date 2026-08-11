import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server.embedding import HashEmbeddingProvider
from server.query_planner import QueryPlanner
from server.rag_service import RAGService
from server.vector_store import InMemoryVectorStore


def run() -> None:
    planner = QueryPlanner()
    plan = planner.plan("我想做一个类似黑魂但是有魔法和开放世界的游戏")
    assert "黑魂" in plan.references
    assert "souls_like" in plan.core_experience
    assert "magic" in plan.systems
    assert "open_world" in plan.world
    assert plan.limitations
    assert len(plan.rewritten_queries) >= 3
    assert "rpg" in plan.engine_capabilities["game_types"]

    service = RAGService(HashEmbeddingProvider(), InMemoryVectorStore(), planner)
    seed_path = ROOT / "server" / "knowledge" / "0806_game_design_seed_v1.jsonl"
    seeded = service.seed(seed_path)
    assert seeded >= 15
    result = service.retrieve(plan.raw_query, {"game_type": "action_rpg", "combat": {"style": "souls_like"}}, top_k=8)
    assert result["knowledge_count"] == seeded
    assert result["documents"]
    titles = " ".join(document["title"] for document in result["documents"])
    assert any(keyword in titles for keyword in ("魂系", "开放世界", "魔法", "Boss")), titles
    assert "引擎限制" in result["context_text"]

    document_id = service.index_experience(
        "conv_test",
        "魔法魂系原型",
        plan.raw_query,
        {"game_type": "action_rpg", "combat": {"style": "souls_like"}},
        {"meta": {"game_type": "dungeon"}, "skills": [{"name": "fireball"}]},
        "玩家确认战斗节奏合适",
    )
    assert document_id == "experience_conv_test"
    assert service.store.count() == seeded + 1
    experience = service.retrieve("成功的魔法魂系游戏", top_k=10)
    assert any(document["id"] == document_id for document in experience["documents"])
    print("rag pipeline tests passed")


if __name__ == "__main__":
    run()
