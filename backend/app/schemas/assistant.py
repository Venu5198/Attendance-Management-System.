"""Pydantic schemas for Natural Language Assistant queries and responses."""

from typing import Any

from pydantic import BaseModel, Field


class AssistantQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500, description="Natural language question or command")


class AssistantQueryResponse(BaseModel):
    query: str
    intent: str
    headline: str
    answer: str
    action_url: str | None = None
    data: Any | None = None
    suggestions: list[str] = []
