"""Pydantic schemas for Message API contract."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MessageCreate(BaseModel):
    """Request body for creating a message."""

    conversation_id: UUID = Field(..., alias="conversationId")
    role: str = Field(..., examples=["user", "assistant"])
    content: str = Field(..., min_length=1)


class MessageResponse(BaseModel):
    """Single message response."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    conversation_id: UUID = Field(..., alias="conversationId")
    role: str
    content: str
    node_type: str = Field("normal", alias="nodeType")
    annotations: list["AnnotationResponse"] = Field(default_factory=list)
    created_at: datetime = Field(..., alias="createdAt")


class MessageListResponse(BaseModel):
    """Paginated list of messages."""

    items: list[MessageResponse]
    total: int


class ForkRequest(BaseModel):
    """Request body for forking a conversation from a message."""

    selected_text: str = Field(..., alias="selectedText", min_length=1, max_length=2000)
    suggestion: str | None = Field(None)


# Avoid circular imports
from app.schemas.annotation import AnnotationResponse  # noqa: E402

MessageResponse.model_rebuild()
