import json
import threading
from pathlib import Path
from typing import Any

from .embedding import EmbeddingProvider
from .knowledge_loader import load_jsonl
from .query_planner import QueryPlanner
from .vector_store import VectorStore
from .web_search import WebSearchAgent


class RAGService:
    WEB_COVERAGE_THRESHOLD = 0.58

    def __init__(
        self,
        embedding: EmbeddingProvider,
        store: VectorStore,
        planner: QueryPlanner | None = None,
        web_search: WebSearchAgent | None = None,
    ):
        self.embedding = embedding
        self.store = store
        self.planner = planner or QueryPlanner()
        self.web_search = web_search
        self._embedding_lock = threading.Lock()

    def seed(self, path: Path) -> int:
        documents = load_jsonl(path)
        self.index(documents)
        return len(documents)

    def index(self, documents: list[dict[str, Any]]) -> int:
        if not documents:
            return 0
        with self._embedding_lock:
            vectors = self.embedding.embed([document["content"] for document in documents])
        self.store.upsert(documents, vectors)
        return len(documents)

    def retrieve(
        self,
        query: str,
        intent: dict[str, Any] | None = None,
        top_k: int = 6,
        web_search: bool | None = None,
    ) -> dict[str, Any]:
        plan = self.planner.plan(query, intent)
        result = self._retrieve_local(plan, top_k)
        initial_web_search_needed = result["web_search_needed"]
        should_search = web_search if web_search is not None else initial_web_search_needed
        web_result = {"used": False, "queries": [], "sources": [], "documents": []}
        if should_search and self.web_search:
            web_result = self.web_search.search(plan.rewritten_queries)
            if web_result["documents"]:
                self.index(web_result["documents"])
                result = self._retrieve_local(plan, top_k)
        documents = result["documents"]
        source_counts = {"local": 0, "web": 0}
        for document in documents:
            source = (document.get("metadata") or {}).get("source", "curated")
            source_counts["web" if source == "duckduckgo" else "local"] += 1
        return {
            "plan": plan.to_dict(),
            "documents": documents,
            "coverage": result["coverage"],
            "web_search_needed": initial_web_search_needed,
            "web_search_used": web_result["used"],
            "web_queries": web_result["queries"],
            "web_sources": web_result["sources"],
            "source_counts": source_counts,
            "context_text": result["context_text"],
            "knowledge_count": self.store.count(),
        }

    def _retrieve_local(self, plan, top_k: int) -> dict[str, Any]:
        with self._embedding_lock:
            query_vectors = self.embedding.embed(plan.rewritten_queries)
        best_by_id: dict[str, dict[str, Any]] = {}
        query_scores = []
        for rewritten, vector in zip(plan.rewritten_queries, query_vectors, strict=True):
            matches = self.store.query(vector, top_k)
            query_scores.append(max((match["score"] for match in matches), default=0.0))
            for match in matches:
                match = {**match, "matched_query": rewritten}
                current = best_by_id.get(match["id"])
                if current is None or match["score"] > current["score"]:
                    best_by_id[match["id"]] = match

        documents = sorted(best_by_id.values(), key=lambda item: item["score"], reverse=True)[:top_k]
        coverage = sum(query_scores) / len(query_scores) if query_scores else 0.0
        web_search_needed = len(documents) < 3 or coverage < self.WEB_COVERAGE_THRESHOLD
        return {
            "documents": documents,
            "coverage": round(coverage, 4),
            "web_search_needed": web_search_needed,
            "context_text": self._context_text(documents, plan.limitations),
        }

    def index_experience(
        self,
        conversation_id: str,
        title: str,
        request: str,
        intent: dict[str, Any],
        game_dsl: dict[str, Any],
        notes: str = "",
    ) -> str:
        document_id = f"experience_{conversation_id}"
        dsl_text = json.dumps(
            {
                "meta": game_dsl.get("meta", {}),
                "world": game_dsl.get("world", {}),
                "rules": game_dsl.get("rules", {}),
                "levels": len(game_dsl.get("levels") or []),
                "events": len(game_dsl.get("events") or []),
                "systems": sorted(key for key in game_dsl if key in {"rpg", "strategy", "tower_defense", "card", "simulation", "sandbox", "racing"}),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
        content = "\n".join(
            [
                f"成功游戏：{title}",
                f"玩家需求：{request}",
                f"Intent DSL：{json.dumps(intent, ensure_ascii=False, sort_keys=True)}",
                f"最终游戏结构摘要：{dsl_text}",
                f"玩家备注：{notes}" if notes else "",
            ]
        ).strip()
        document = {
            "id": document_id,
            "title": title,
            "content": content,
            "metadata": {
                "type": "experience",
                "source": "confirmed_game",
                "conversation_id": conversation_id,
                "game_type": (game_dsl.get("meta") or {}).get("game_type", "unknown"),
            },
        }
        self.index([document])
        return document_id

    @staticmethod
    def _context_text(documents: list[dict[str, Any]], limitations: list[str]) -> str:
        sections = []
        for index, document in enumerate(documents, start=1):
            source_url = (document.get("metadata") or {}).get("url")
            source = f"\n来源：{source_url}" if source_url else ""
            sections.append(f"[{index}] {document['title']}\n{document['content']}{source}")
        if limitations:
            sections.append("引擎限制：\n- " + "\n- ".join(limitations))
        return "\n\n".join(sections)
