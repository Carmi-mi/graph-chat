"""Messages router -- thin HTTP layer."""

from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.dependencies import get_fork_service, get_message_service
from app.schemas.message import (
    ForkRequest,
    MessageCreate,
    MessageListResponse,
    MessageResponse,
)
from app.services.fork import ForkService
from app.services.message import MessageService

router = APIRouter(prefix="/messages", tags=["messages"])


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_message(
    body: MessageCreate,
    service: MessageService = Depends(get_message_service),
) -> dict:
    """Send a new message to a conversation. Returns user message and assistant reply."""
    user_msg, assistant_msg = await service.send_message(
        conversation_id=body.conversation_id,
        role=body.role,
        content=body.content,
        skip_annotations=body.skip_annotations,
    )
    result = {
        "userMessage": MessageResponse.model_validate(user_msg).model_dump(by_alias=True),
    }
    if assistant_msg is not None:
        result["assistantMessage"] = MessageResponse.model_validate(assistant_msg).model_dump(by_alias=True)
    return result


@router.get("/{conversation_id}", response_model=MessageListResponse)
async def list_messages(
    conversation_id: UUID,
    service: MessageService = Depends(get_message_service),
) -> MessageListResponse:
    """Get all messages for a conversation."""
    items = await service.get_messages(conversation_id)
    return MessageListResponse(
        items=[MessageResponse.model_validate(m) for m in items],
        total=len(items),
    )


@router.post("/{message_id}/fork", status_code=status.HTTP_201_CREATED)
async def fork_from_message(
    message_id: UUID,
    body: ForkRequest,
    service: ForkService = Depends(get_fork_service),
) -> dict:
    """Fork a new child conversation from an assistant message."""
    child = await service.fork(
        message_id=message_id,
        selected_text=body.selected_text,
        suggestion=body.suggestion,
    )
    from app.schemas.conversation import ConversationResponse

    return ConversationResponse.model_validate(child).model_dump(by_alias=True)
