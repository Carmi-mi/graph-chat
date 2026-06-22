"""Conversations router -- thin HTTP layer."""

from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.dependencies import get_conversation_service
from app.schemas.conversation import (
    ConversationCreate,
    ConversationListResponse,
    ConversationResponse,
    ConversationUpdate,
    ConversationWithTree,
)
from app.services.conversation import ConversationService

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("/", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreate,
    service: ConversationService = Depends(get_conversation_service),
) -> ConversationResponse:
    """Create a new root conversation."""
    return await service.create(name=body.name)


@router.get("/", response_model=ConversationListResponse)
async def list_conversations(
    skip: int = 0,
    limit: int = 100,
    service: ConversationService = Depends(get_conversation_service),
) -> ConversationListResponse:
    """List root conversations."""
    items = await service.list(skip=skip, limit=limit)
    return ConversationListResponse(items=items, total=len(items))


def _serialize_conversation(conv) -> dict:
    """Recursively serialize a conversation with its full tree."""
    return {
        "id": str(conv.id),
        "name": conv.name,
        "parentId": str(conv.parent_id) if conv.parent_id else None,
        "status": conv.status,
        "forkFrom": str(conv.fork_from) if conv.fork_from else None,
        "forkText": conv.fork_text,
        "autoExploring": conv.auto_exploring,
        "createdAt": conv.created_at.isoformat(),
        "updatedAt": conv.updated_at.isoformat(),
        "messages": [
            {
                "id": str(msg.id),
                "conversationId": str(msg.conversation_id),
                "role": msg.role,
                "content": msg.content,
                "nodeType": msg.node_type,
                "annotations": [
                    {
                        "id": str(a.id),
                        "messageId": str(a.message_id),
                        "text": a.text,
                        "startOffset": a.start_offset,
                        "endOffset": a.end_offset,
                        "suggestions": a.suggestions or [],
                        "createdAt": a.created_at.isoformat(),
                    }
                    for a in msg.annotations
                ],
                "annotationsGenerated": msg.annotations_generated,
                "createdAt": msg.created_at.isoformat(),
            }
            for msg in conv.messages
        ],
        "children": [_serialize_conversation(child) for child in conv.children],
    }


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: UUID,
    service: ConversationService = Depends(get_conversation_service),
) -> dict:
    """Get a single conversation by ID with full tree structure."""
    conv = await service.get_with_tree(conversation_id)
    return _serialize_conversation(conv)


@router.put("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: UUID,
    body: ConversationUpdate,
    service: ConversationService = Depends(get_conversation_service),
) -> ConversationResponse:
    """Update a conversation's name or status."""
    return await service.update(
        conversation_id,
        name=body.name,
        status=body.status,
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: UUID,
    service: ConversationService = Depends(get_conversation_service),
) -> None:
    """Delete a conversation."""
    await service.delete(conversation_id)
