import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    rag_home: Path
    model_name: str
    embedding_provider: str
    vector_provider: str
    collection_name: str
    host: str
    port: int
    web_search_enabled: bool
    web_search_timeout: float
    web_search_max_results: int

    @classmethod
    def from_env(cls) -> "Settings":
        home = Path(os.getenv("AGE_RAG_HOME", r"E:\111\ai-game-engine-rag"))
        return cls(
            rag_home=home,
            model_name=os.getenv("AGE_EMBEDDING_MODEL", "BAAI/bge-small-zh-v1.5"),
            embedding_provider=os.getenv("AGE_EMBEDDING_PROVIDER", "bge"),
            vector_provider=os.getenv("AGE_VECTOR_PROVIDER", "chroma"),
            collection_name=os.getenv("AGE_CHROMA_COLLECTION", "game_design_knowledge"),
            host=os.getenv("AGE_RAG_HOST", "127.0.0.1"),
            port=int(os.getenv("AGE_RAG_PORT", "8765")),
            web_search_enabled=os.getenv("AGE_WEB_SEARCH_ENABLED", "1").lower() not in {"0", "false", "off"},
            web_search_timeout=float(os.getenv("AGE_WEB_SEARCH_TIMEOUT", "6")),
            web_search_max_results=int(os.getenv("AGE_WEB_SEARCH_MAX_RESULTS", "5")),
        )

    @property
    def model_dir(self) -> Path:
        return self.rag_home / "models"

    @property
    def chroma_dir(self) -> Path:
        return self.rag_home / "chroma"

    @property
    def package_dir(self) -> Path:
        return self.rag_home / "python-packages"

    @property
    def web_cache_dir(self) -> Path:
        return self.rag_home / "web-cache"
