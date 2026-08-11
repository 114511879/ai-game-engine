from typing import Any

from pydantic import BaseModel, Field


class PlanRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    intent: dict[str, Any] | None = None


class RetrieveRequest(PlanRequest):
    top_k: int = Field(default=6, ge=1, le=20)
    web_search: bool | None = None


class KnowledgeDocument(BaseModel):
    id: str
    title: str
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class IndexRequest(BaseModel):
    documents: list[KnowledgeDocument]


class ExperienceRequest(BaseModel):
    conversation_id: str
    title: str
    request: str
    intent: dict[str, Any]
    game_dsl: dict[str, Any]
    notes: str = ""
