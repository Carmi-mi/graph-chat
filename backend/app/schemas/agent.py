"""Pydantic schemas for Agent API contract."""

from uuid import UUID

from pydantic import BaseModel, Field


class SuggestResponse(BaseModel):
    """Response containing fork suggestions."""

    suggestions: list[dict]
    count: int


class AutoExploreRequest(BaseModel):
    """Request body for auto-explore mode."""

    branch_id: UUID = Field(..., alias="branchId")
    max_depth: int = Field(3, alias="maxDepth", ge=1, le=10)
    parallel: int = Field(2, ge=1, le=5)


class AutoExploreResponse(BaseModel):
    """Response after starting auto-explore."""

    task_id: UUID = Field(..., alias="taskId")


class BranchStatus(BaseModel):
    """Status of a single branch in auto-explore."""

    conversation_id: UUID = Field(..., alias="conversationId")
    name: str
    status: str
    progress: int
    max_depth: int = Field(..., alias="maxDepth")


class ExploreStatusResponse(BaseModel):
    """Response containing status of all exploring branches."""

    branches: list[BranchStatus]


class MergeRequest(BaseModel):
    """Request body for merging branches."""

    target_id: UUID = Field(..., alias="targetId")
    source_ids: list[UUID] = Field(..., alias="sourceIds", min_length=1)
    keep_option: str = Field("keep", alias="keepOption", pattern="^(keep|archive|delete)$")


class MergeResponse(BaseModel):
    """Response after merging branches."""

    conclusion: str
    merge_record_id: UUID = Field(..., alias="mergeRecordId")
    message_id: UUID = Field(..., alias="messageId")
