"""Agent router -- thin HTTP layer for AI-powered features."""

from uuid import UUID

from fastapi import APIRouter, Depends

from app.dependencies import get_agent_engine, get_merge_service
from app.schemas.agent import (
    AutoExploreRequest,
    AutoExploreResponse,
    BranchStatus,
    ExploreStatusResponse,
    MergeRequest,
    MergeResponse,
    SuggestResponse,
)
from app.services.agent_engine import AgentEngine
from app.services.merge import MergeService

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/suggest", response_model=SuggestResponse)
async def suggest_forks(
    conversation_id: UUID,
    engine: AgentEngine = Depends(get_agent_engine),
) -> SuggestResponse:
    """Get fork suggestions for a conversation."""
    suggestions = await engine.suggest_forks(conversation_id)
    return SuggestResponse(suggestions=suggestions, count=len(suggestions))


@router.post("/auto-explore", response_model=AutoExploreResponse, status_code=202)
async def start_auto_explore(
    body: AutoExploreRequest,
    engine: AgentEngine = Depends(get_agent_engine),
) -> AutoExploreResponse:
    """Start an auto-explore background task."""
    task_id = await engine.start_auto_explore(
        branch_id=body.branch_id,
        max_depth=body.max_depth,
        parallel=body.parallel,
    )
    return AutoExploreResponse(taskId=task_id)


@router.get("/status/{conversation_id}", response_model=ExploreStatusResponse)
async def get_explore_status(
    conversation_id: UUID,
    engine: AgentEngine = Depends(get_agent_engine),
) -> ExploreStatusResponse:
    """Get the status of all auto-explore branches for a conversation."""
    branches = engine.get_explore_status()
    return ExploreStatusResponse(
        branches=[
            BranchStatus(
                conversationId=b.conversation_id,
                name=b.name,
                status=b.status,
                progress=b.progress,
                maxDepth=b.max_depth,
            )
            for b in branches
            if b.conversation_id == conversation_id
        ]
    )


@router.post("/merge", response_model=MergeResponse)
async def merge_branches(
    body: MergeRequest,
    service: MergeService = Depends(get_merge_service),
) -> MergeResponse:
    """Merge conclusions from multiple branches."""
    result = await service.merge(
        target_id=body.target_id,
        source_ids=body.source_ids,
        keep_option=body.keep_option,
    )
    return MergeResponse(
        conclusion=result["conclusion"],
        mergeRecordId=result["merge_record_id"],
    )
