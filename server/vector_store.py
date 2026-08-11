import math
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any


class VectorStore(ABC):
    @abstractmethod
    def upsert(self, documents: list[dict[str, Any]], embeddings: list[list[float]]) -> None:
        raise NotImplementedError

    @abstractmethod
    def query(self, embedding: list[float], top_k: int) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def count(self) -> int:
        raise NotImplementedError


class InMemoryVectorStore(VectorStore):
    def __init__(self):
        self.items: dict[str, dict[str, Any]] = {}

    def upsert(self, documents: list[dict[str, Any]], embeddings: list[list[float]]) -> None:
        for document, embedding in zip(documents, embeddings, strict=True):
            self.items[document["id"]] = {**document, "embedding": embedding}

    def query(self, embedding: list[float], top_k: int) -> list[dict[str, Any]]:
        results = []
        for item in self.items.values():
            score = self._cosine(embedding, item["embedding"])
            results.append({key: value for key, value in item.items() if key != "embedding"} | {"score": score})
        results.sort(key=lambda item: item["score"], reverse=True)
        return results[:top_k]

    def count(self) -> int:
        return len(self.items)

    @staticmethod
    def _cosine(left: list[float], right: list[float]) -> float:
        dot = sum(a * b for a, b in zip(left, right, strict=False))
        left_norm = math.sqrt(sum(value * value for value in left)) or 1.0
        right_norm = math.sqrt(sum(value * value for value in right)) or 1.0
        return dot / (left_norm * right_norm)


class ChromaVectorStore(VectorStore):
    def __init__(self, path: Path, collection_name: str):
        import chromadb

        path.mkdir(parents=True, exist_ok=True)
        self.client = chromadb.PersistentClient(path=str(path))
        self.collection = self.client.get_or_create_collection(name=collection_name, metadata={"hnsw:space": "cosine"})

    def upsert(self, documents: list[dict[str, Any]], embeddings: list[list[float]]) -> None:
        self.collection.upsert(
            ids=[document["id"] for document in documents],
            documents=[document["content"] for document in documents],
            metadatas=[{"title": document["title"], **self._flat_metadata(document.get("metadata", {}))} for document in documents],
            embeddings=embeddings,
        )

    def query(self, embedding: list[float], top_k: int) -> list[dict[str, Any]]:
        raw = self.collection.query(query_embeddings=[embedding], n_results=top_k, include=["documents", "metadatas", "distances"])
        output = []
        for index, doc_id in enumerate((raw.get("ids") or [[]])[0]):
            metadata = ((raw.get("metadatas") or [[]])[0][index] or {})
            distance = (raw.get("distances") or [[1.0]])[0][index]
            output.append({
                "id": doc_id,
                "title": metadata.pop("title", doc_id),
                "content": (raw.get("documents") or [[""]])[0][index],
                "metadata": metadata,
                "score": 1.0 - float(distance),
            })
        return output

    def count(self) -> int:
        return self.collection.count()

    @staticmethod
    def _flat_metadata(metadata: dict[str, Any]) -> dict[str, str | int | float | bool]:
        output = {}
        for key, value in metadata.items():
            if isinstance(value, (str, int, float, bool)):
                output[key] = value
            elif isinstance(value, list):
                output[key] = ",".join(str(item) for item in value)
            else:
                output[key] = str(value)
        return output
