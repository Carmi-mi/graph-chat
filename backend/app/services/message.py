"""Message business-logic service."""

import asyncio
import logging
import os
from collections.abc import AsyncGenerator
from uuid import UUID

logger = logging.getLogger(__name__)

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.exceptions import ConversationNotFound, MessageEmptyContent, MessageNotFound
from app.models.message import Message
from app.models.message_relation import MessageRelation
from app.repositories.annotation import AnnotationRepository
from app.repositories.conversation import ConversationRepository
from app.repositories.message import MessageRepository
from app.services.llm import ILLMProvider

# Store background tasks to prevent garbage collection
_background_tasks: set[asyncio.Task] = set()


class MessageService:
    """Send, retrieve, and manage messages within conversations."""

    def __init__(
        self,
        message_repository: MessageRepository,
        conversation_repository: ConversationRepository,
        llm_provider: ILLMProvider,
        annotation_repository: AnnotationRepository | None = None,
        session_factory: async_sessionmaker | None = None,
    ) -> None:
        self.message_repo = message_repository
        self.conversation_repo = conversation_repository
        self.llm = llm_provider
        self.annotation_repo = annotation_repository
        self._session_factory = session_factory

    async def send_message(
        self, conversation_id: UUID, role: str, content: str
    ) -> tuple[Message, Message | None]:
        """Persist a user message and optionally trigger an assistant auto-reply.

        1. Validate conversation exists.
        2. Persist the user message.
        3. If role is 'user', generate and persist an assistant reply.
        4. Start annotation generation in background (non-blocking).
        5. Return (user_message, assistant_message | None).
        """
        if not content.strip():
            raise MessageEmptyContent(message="Message content must not be empty")

        conv = await self.conversation_repo.get(conversation_id)
        if conv is None:
            raise ConversationNotFound(message=f"Conversation {conversation_id} not found")

        # Persist the user message
        user_message = await self.message_repo.create(
            conversation_id=conversation_id,
            role=role,
            content=content,
        )

        assistant_msg = None
        # Auto-reply from assistant when the user sends a message
        if role == "user":
            assistant_content = await self._generate_reply(conversation_id)
            assistant_msg = await self.message_repo.create(
                conversation_id=conversation_id,
                role="assistant",
                content=assistant_content,
            )

            # Generate annotations + update summary in background (non-blocking)
            if self._session_factory:
                task = asyncio.create_task(
                    self._generate_annotations_bg(
                        assistant_msg.id, assistant_content,
                        content,  # user message
                        conversation_id,
                        conv.context_summary,
                    )
                )
                _background_tasks.add(task)
                task.add_done_callback(_background_tasks.discard)

        return user_message, assistant_msg

    async def _generate_annotations_bg(
        self,
        message_id: UUID,
        assistant_content: str,
        user_content: str,
        conversation_id: UUID,
        old_summary: str | None,
    ) -> None:
        """Generate annotations using summary, then update summary."""
        try:
            # 1. Generate annotations (old summary + assistant reply)
            raw_annotations = await self.llm.generate_annotations(assistant_content, old_summary)
            async with self._session_factory() as session:
                repo = AnnotationRepository(session=session)
                for ann in raw_annotations:
                    text = ann.get("text", "")
                    if not text:
                        continue
                    await repo.create(
                        message_id=message_id,
                        text=text,
                        start_offset=ann.get("startOffset", 0),
                        end_offset=ann.get("endOffset", len(text)),
                        suggestions=ann.get("suggestions", []),
                    )
                await session.commit()

            # 2. Update summary (old summary + latest exchange)
            new_summary = await self.llm.update_summary(old_summary, user_content, assistant_content)
            if new_summary:
                async with self._session_factory() as session:
                    conv_repo = ConversationRepository(session=session)
                    conv = await conv_repo.get(conversation_id)
                    if conv:
                        conv.context_summary = new_summary
                        await session.commit()
        except Exception:
            pass

    async def _generate_annotations(self, message_id: UUID, content: str, summary: str | None = None) -> None:
        """Generate and persist annotations for an assistant message."""
        try:
            raw_annotations = await self.llm.generate_annotations(content, summary)
            for ann in raw_annotations:
                text = ann.get("text", "")
                if not text:
                    continue
                await self.annotation_repo.create(
                    message_id=message_id,
                    text=text,
                    start_offset=ann.get("startOffset", 0),
                    end_offset=ann.get("endOffset", len(text)),
                    suggestions=ann.get("suggestions", []),
                )
        except Exception:
            # Annotation generation is non-critical; don't break message flow
            pass

    async def get_messages(self, conversation_id: UUID) -> list[Message]:
        """Get all messages for a conversation."""
        return await self.message_repo.get_by_conversation(conversation_id)

    async def get_message(self, message_id: UUID) -> Message:
        """Get a single message by ID."""
        msg = await self.message_repo.get(message_id)
        if msg is None:
            raise MessageNotFound(message=f"Message {message_id} not found")
        return msg

    async def _generate_reply(self, conversation_id: UUID) -> str:
        """Build chat history and ask the LLM for a reply."""
        messages = await self.message_repo.get_by_conversation(conversation_id)
        chat_history: list[dict] = []

        # If this is a forked branch, prepend parent context
        fork_context = await self._get_fork_context(conversation_id)
        if fork_context:
            chat_history.append({"role": "system", "content": fork_context})

        chat_history.extend({"role": m.role, "content": m.content} for m in messages)
        return await self.llm.complete(chat_history)

    async def _get_fork_context(self, conversation_id: UUID) -> str | None:
        """If this conversation is a fork, return parent context for the LLM prompt.

        Returns a system message containing:
        - Parent conversation's context_summary (background of prior discussion)
        - Full text of the source assistant message (the one user forked from)
        """
        conv = await self.conversation_repo.get(conversation_id)
        if conv is None or conv.parent_id is None:
            return None

        # Find the fork relation: source message (parent) -> fork_root message (this conv)
        stmt = (
            select(MessageRelation)
            .join(Message, MessageRelation.child_id == Message.id)
            .where(
                Message.conversation_id == conversation_id,
                MessageRelation.relation_type == "fork",
            )
            .limit(1)
        )
        result = await self.message_repo.session.execute(stmt)
        relation = result.scalar_one_or_none()
        if relation is None:
            return None

        # Get the source message content
        source_msg = await self.message_repo.get(relation.parent_id)
        if source_msg is None:
            return None

        # Get parent conversation's context_summary
        parent_conv = await self.conversation_repo.get(conv.parent_id)
        summary = parent_conv.context_summary if parent_conv else None

        # Build context message
        parts = []
        if summary:
            parts.append(f"以下是之前对话的背景摘要：\n{summary}")
            logger.info("Fork context | summary=%s", summary[:100])
        parts.append(f"以下是用户展开分支所依据的原始回复：\n{source_msg.content}")
        logger.info("Fork context | source_msg=%s", source_msg.content[:100])
        return "\n\n".join(parts)
