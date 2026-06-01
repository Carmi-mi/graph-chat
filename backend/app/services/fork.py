"""Fork business-logic service."""

import uuid

from app.core.exceptions import (
    ConversationNotFound,
    ForkDepthExceeded,
    ForkFromNonAssistant,
    ForkTextTooLong,
    ForkTextTooShort,
    MessageNotFound,
)
from app.models.conversation import Conversation
from app.models.message_relation import MessageRelation
from app.repositories.conversation import ConversationRepository
from app.repositories.message import MessageRepository

# Validation constants
MIN_FORK_TEXT_LENGTH = 1
MAX_FORK_TEXT_LENGTH = 2000
MAX_FORK_DEPTH = 4


class ForkService:
    """Create a new conversation branch (fork) from an existing message."""

    def __init__(
        self,
        conversation_repository: ConversationRepository,
        message_repository: MessageRepository,
    ) -> None:
        self.conversation_repo = conversation_repository
        self.message_repo = message_repository

    async def fork(
        self,
        message_id: uuid.UUID,
        selected_text: str,
        suggestion: str | None = None,
    ) -> Conversation:
        """Fork a new child conversation from an assistant message.

        Rules:
        - The source message must exist and belong to role='assistant'.
        - selected_text length is validated.
        - The new conversation is a child of the source message's conversation.
        """
        # Validate selected_text length
        text_len = len(selected_text.strip())
        if text_len < MIN_FORK_TEXT_LENGTH:
            raise ForkTextTooShort(
                message=f"Selected text must be at least {MIN_FORK_TEXT_LENGTH} character(s)"
            )
        if text_len > MAX_FORK_TEXT_LENGTH:
            raise ForkTextTooLong(
                message=f"Selected text must be at most {MAX_FORK_TEXT_LENGTH} characters"
            )

        # Look up the source message
        source_msg = await self.message_repo.get(message_id)
        if source_msg is None:
            raise MessageNotFound(message=f"Message {message_id} not found")

        # Only assistant messages can be forked
        if source_msg.role != "assistant":
            raise ForkFromNonAssistant(
                message="Only assistant messages can be forked"
            )

        # Look up the parent conversation
        parent_conv = await self.conversation_repo.get(source_msg.conversation_id)
        if parent_conv is None:
            raise ConversationNotFound(
                message=f"Conversation {source_msg.conversation_id} not found"
            )

        # Check depth limit
        depth = await self._get_conversation_depth(parent_conv)
        if depth >= MAX_FORK_DEPTH:
            raise ForkDepthExceeded(
                message=f"分支层级已达上限（最多{MAX_FORK_DEPTH}层），无法继续创建子分支"
            )

        # Create the child conversation
        fork_name = f"Fork: {selected_text[:50]}"
        child = await self.conversation_repo.create(
            name=fork_name,
            parent_id=parent_conv.id,
            fork_from=parent_conv.id,
            fork_text=selected_text,
        )

        # Copy the source message into the new conversation as context
        context_content = selected_text
        if suggestion:
            context_content = f"{selected_text}\n\nSuggestion: {suggestion}"
        fork_root = await self.message_repo.create(
            conversation_id=child.id,
            role="assistant",
            content=context_content,
            node_type="fork_root",
        )

        # Create DAG edge: source message -> fork_root message
        relation = MessageRelation(
            parent_id=source_msg.id,
            child_id=fork_root.id,
            relation_type="fork",
        )
        self.conversation_repo.session.add(relation)

        return child

    async def _get_conversation_depth(self, conv: Conversation) -> int:
        """Calculate the depth of a conversation by traversing up to root.

        Root conversation has depth 0, its children have depth 1, etc.
        """
        depth = 0
        current = conv
        while current.parent_id is not None:
            depth += 1
            parent = await self.conversation_repo.get(current.parent_id)
            if parent is None:
                break
            current = parent
        return depth
