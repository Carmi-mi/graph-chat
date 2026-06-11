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
        self, conversation_id: UUID, role: str, content: str, *, skip_annotations: bool = False, skip_user_message: bool = False,
    ) -> tuple[Message | None, Message | None]:
        """Persist a message and optionally trigger an assistant auto-reply.

        1. Validate conversation exists.
        2. Persist the user message (unless skip_user_message).
        3. If role is 'user', generate and persist an assistant reply.
        4. Start annotation generation in background (non-blocking).
        5. Return (user_message | None, assistant_message | None).
        """
        if not content.strip():
            raise MessageEmptyContent(message="Message content must not be empty")

        conv = await self.conversation_repo.get(conversation_id)
        if conv is None:
            raise ConversationNotFound(message=f"Conversation {conversation_id} not found")

        # Persist the user message (skipped for merge)
        user_message = None
        if not skip_user_message:
            user_message = await self.message_repo.create(
                conversation_id=conversation_id,
                role=role,
                content=content,
            )

        assistant_msg = None
        # Auto-reply from assistant when the user sends a message
        if role == "user":
            # Pass content as context only when not stored in DB
            reply_context = content if skip_user_message else None
            assistant_content = await self._generate_reply(conversation_id, context=reply_context)
            assistant_msg = await self.message_repo.create(
                conversation_id=conversation_id,
                role="assistant",
                content=assistant_content,
            )

            # Generate annotations + update summary in background (non-blocking)
            if self._session_factory:
                # For fork branches, inherit parent's summary as the starting point
                summary_for_bg = conv.context_summary
                if not summary_for_bg and conv.parent_id:
                    parent_conv = await self.conversation_repo.get(conv.parent_id)
                    if parent_conv:
                        summary_for_bg = parent_conv.context_summary

                # Commit messages BEFORE spawning background task to release
                # SQLite write lock — otherwise the bg task's INSERT hits
                # "database is locked" because the main session is still committing.
                await self.message_repo.session.commit()
                if user_message:
                    await self.message_repo.session.refresh(user_message)
                await self.message_repo.session.refresh(assistant_msg)

                task = asyncio.create_task(
                    self._generate_annotations_bg(
                        assistant_msg.id, assistant_content,
                        "" if skip_user_message else content,
                        conversation_id,
                        summary_for_bg,
                        skip_annotations=skip_annotations,
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
        *,
        skip_annotations: bool = False,
    ) -> None:
        """Generate annotations and update summary in parallel."""
        LLM_TIMEOUT = 120  # seconds
        logger.info("bg task started for message %s", message_id)

        # Run sequentially — concurrent requests to the same LLM provider
        # can cause rate-limiting/queuing, making one call hang.
        try:
            sum_result = await asyncio.wait_for(
                self.llm.update_summary(old_summary, user_content, assistant_content),
                timeout=LLM_TIMEOUT,
            )
        except Exception as e:
            sum_result = e
            logger.warning("summary LLM failed: %s %s", type(e).__name__, e)

        ann_result = None
        if not skip_annotations:
            try:
                ann_result = await asyncio.wait_for(
                    self.llm.generate_annotations(assistant_content, old_summary),
                    timeout=LLM_TIMEOUT,
                )
            except Exception as e:
                ann_result = e
                logger.warning("annotation LLM failed: %s %s", type(e).__name__, e)

        logger.info("bg task done | ann_type=%s sum_type=%s", type(ann_result).__name__ if ann_result else "skipped", type(sum_result).__name__)

        # Persist annotations (if succeeded)
        if isinstance(ann_result, Exception):
            logger.warning("annotation LLM failed: %s %s", type(ann_result).__name__, ann_result)
        elif isinstance(ann_result, list):
            try:
                async with self._session_factory() as session:
                    repo = AnnotationRepository(session=session)
                    for ann in ann_result:
                        text = ann.get("text", "")
                        if not text:
                            continue
                        await repo.create(
                            message_id=message_id,
                            text=text,
                            start_offset=ann.get("startOffset"),
                            end_offset=ann.get("endOffset"),
                            suggestions=ann.get("suggestions", []),
                        )
                    await session.commit()
            except Exception:
                logger.warning("annotation persist failed", exc_info=True)

        # Persist summary (if succeeded)
        if isinstance(sum_result, Exception):
            logger.warning("summary LLM failed: %s", sum_result)
        elif isinstance(sum_result, str) and sum_result:
            try:
                async with self._session_factory() as session:
                    conv_repo = ConversationRepository(session=session)
                    conv = await conv_repo.get(conversation_id)
                    if conv:
                        conv.context_summary = sum_result
                        await session.commit()
                        logger.info("summary persisted for conv %s: %s", conversation_id, sum_result[:80])
                    else:
                        logger.warning("summary persist skipped: conv %s not found", conversation_id)
            except Exception:
                logger.warning("summary persist failed", exc_info=True)
        else:
            logger.info("summary skipped: type=%s empty=%s", type(sum_result).__name__, not sum_result)

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
                    start_offset=ann.get("startOffset"),
                    end_offset=ann.get("endOffset"),
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

    async def _generate_reply(self, conversation_id: UUID, context: str | None = None) -> str:
        """Build chat history and ask the LLM for a reply."""
        messages = await self.message_repo.get_by_conversation(conversation_id)
        chat_history: list[dict] = []

        # If this is a forked branch, prepend parent context
        fork_context = await self._get_fork_context(conversation_id)
        if fork_context:
            chat_history.append({"role": "system", "content": fork_context})

        # Inject context (e.g. merge conclusions) without storing in DB
        if context:
            chat_history.append({"role": "user", "content": context})

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
