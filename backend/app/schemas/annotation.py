"""Pydantic schemas for Annotation API contract."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AnnotationSuggestion(BaseModel):
    """A single suggestion within an annotation."""

    text: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)


class CreateAnnotationRequest(BaseModel):
    """Request body for creating an annotation."""

    message_id: UUID = Field(..., alias="messageId")
    text: str = Field(..., min_length=1, max_length=255)
    start_offset: int = Field(..., alias="startOffset", ge=0)
    end_offset: int = Field(..., alias="endOffset", ge=0)
    suggestions: list[AnnotationSuggestion] = Field(default_factory=list)


class AnnotationResponse(BaseModel):
    """Single annotation response."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    message_id: UUID = Field(..., alias="messageId")
    text: str
    start_offset: int | None = Field(None, alias="startOffset")
    end_offset: int | None = Field(None, alias="endOffset")
    suggestions: list[dict] = Field(default_factory=list)
    created_at: datetime = Field(..., alias="createdAt")
