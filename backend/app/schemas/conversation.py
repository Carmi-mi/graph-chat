"""Pydantic schemas for Conversation API contract."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ConversationCreate(BaseModel):
    """Request body for creating a conversation."""

    name: str = Field(..., min_length=1, max_length=255, examples=["My Chat"])


class ConversationUpdate(BaseModel):
    """Request body for updating a conversation."""

    name: str | None = Field(None, min_length=1, max_length=255)
    status: str | None = Field(None, examples=["active", "archived"])


class ConversationResponse(BaseModel):
    """Single conversation response."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    name: str
    parent_id: UUID | None = Field(None, alias="parentId")
    status: str
    fork_from: UUID | None = Field(None, alias="forkFrom")
    fork_text: str | None = Field(None, alias="forkText")
    auto_exploring: bool = Field(False, alias="autoExploring")
    context_summary: str | None = Field(None, alias="contextSummary")
    created_at: datetime = Field(..., alias="createdAt")
    updated_at: datetime = Field(..., alias="updatedAt")


class ConversationWithTree(ConversationResponse):
    """Conversation with nested messages and child conversations."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    messages: list["MessageResponse"] = Field(default_factory=list)
    children: list["ConversationWithTree"] = Field(default_factory=list)


class ConversationListResponse(BaseModel):
    """Paginated list of conversations."""

    items: list[ConversationResponse]
    total: int


# Avoid circular imports: use a forward reference and rebuild later
from app.schemas.message import MessageResponse  # noqa: E402

ConversationWithTree.model_rebuild()
