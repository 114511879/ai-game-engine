import hashlib
import math
import re
from abc import ABC, abstractmethod
from pathlib import Path


class EmbeddingProvider(ABC):
    @abstractmethod
    def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError


class HashEmbeddingProvider(EmbeddingProvider):
    """Deterministic offline embedding used by tests and emergency fallback."""

    def __init__(self, dimensions: int = 384):
        self.dimensions = dimensions

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]

    def _embed_one(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        normalized = re.sub(r"\s+", " ", (text or "").lower())
        tokens = re.findall(r"[a-z0-9_]+|[\u4e00-\u9fff]", normalized)
        tokens += [normalized[index:index + 2] for index in range(max(0, len(normalized) - 1))]
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimensions
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[index] += sign
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [value / norm for value in vector]


class SentenceTransformerEmbeddingProvider(EmbeddingProvider):
    def __init__(self, model_name: str, cache_dir: Path):
        from sentence_transformers import SentenceTransformer

        cache_dir.mkdir(parents=True, exist_ok=True)
        self.model = SentenceTransformer(model_name, cache_folder=str(cache_dir), device="cpu")

    def embed(self, texts: list[str]) -> list[list[float]]:
        vectors = self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return [vector.tolist() for vector in vectors]
