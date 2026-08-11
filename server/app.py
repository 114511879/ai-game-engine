from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings
from .embedding import HashEmbeddingProvider, SentenceTransformerEmbeddingProvider
from .query_planner import QueryPlanner
from .rag_service import RAGService
from .schemas import ExperienceRequest, IndexRequest, PlanRequest, RetrieveRequest
from .vector_store import ChromaVectorStore, InMemoryVectorStore
from .web_search import WebSearchAgent


def build_service(settings: Settings) -> tuple[RAGService, dict[str, str]]:
    runtime = {}
    if settings.embedding_provider == "bge":
        try:
            embedding = SentenceTransformerEmbeddingProvider(settings.model_name, settings.model_dir)
            runtime["embedding"] = settings.model_name
        except Exception as exc:
            embedding = HashEmbeddingProvider()
            runtime["embedding"] = f"hash-fallback ({type(exc).__name__})"
    else:
        embedding = HashEmbeddingProvider()
        runtime["embedding"] = "hash"

    if settings.vector_provider == "chroma":
        try:
            store = ChromaVectorStore(settings.chroma_dir, settings.collection_name)
            runtime["vector_store"] = "chroma"
        except Exception as exc:
            store = InMemoryVectorStore()
            runtime["vector_store"] = f"memory-fallback ({type(exc).__name__})"
    else:
        store = InMemoryVectorStore()
        runtime["vector_store"] = "memory"

    web_search = WebSearchAgent(
        settings.web_cache_dir,
        enabled=settings.web_search_enabled,
        timeout=settings.web_search_timeout,
        max_results=settings.web_search_max_results,
    )
    runtime["web_search"] = "duckduckgo-lite" if settings.web_search_enabled else "disabled"
    service = RAGService(embedding, store, QueryPlanner(), web_search)
    seed_path = Path(__file__).parent / "knowledge" / "0806_game_design_seed_v1.jsonl"
    if service.store.count() == 0:
        service.seed(seed_path)
    return service, runtime


settings = Settings.from_env()
service, runtime = build_service(settings)
app = FastAPI(title="AI Game Engine RAG", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:4173", "http://localhost:4173", "null"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "runtime": runtime, "knowledge_count": service.store.count(), "rag_home": str(settings.rag_home)}


@app.post("/api/search/plan")
def plan(request: PlanRequest) -> dict:
    return service.planner.plan(request.query, request.intent).to_dict()


@app.post("/api/rag/retrieve")
def retrieve(request: RetrieveRequest) -> dict:
    return service.retrieve(request.query, request.intent, request.top_k, request.web_search)


@app.post("/api/knowledge/index")
def index(request: IndexRequest) -> dict:
    try:
        count = service.index([document.model_dump() for document in request.documents])
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"indexed": count, "knowledge_count": service.store.count()}


@app.post("/api/experience")
def experience(request: ExperienceRequest) -> dict:
    document_id = service.index_experience(
        request.conversation_id,
        request.title,
        request.request,
        request.intent,
        request.game_dsl,
        request.notes,
    )
    return {"indexed": True, "document_id": document_id, "knowledge_count": service.store.count()}


@app.get("/api/knowledge/stats")
def stats() -> dict:
    return {"knowledge_count": service.store.count(), "runtime": runtime}
