"""Message business-logic service."""

import asyncio
from collections.abc import AsyncGenerator
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.exceptions import ConversationNotFound, MessageEmptyContent, MessageNotFound
from app.models.message import Message
from app.repositories.annotation import AnnotationRepository
from app.repositories.conversation import ConversationRepository
from app.repositories.message import MessageRepository
from app.services.llm import ILLMProvider


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

            # Start annotation generation in background (non-blocking)
            if self._session_factory:
                asyncio.create_task(
                    self._generate_annotations_bg(assistant_msg.id, assistant_content)
                )

        return user_message, assistant_msg

    async def _generate_annotations_bg(self, message_id: UUID, content: str) -> None:
        """Generate annotations in a background task with its own session."""
        try:
            raw_annotations = await self.llm.generate_annotations(content)
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
        except Exception:
            pass

    async def _generate_annotations(self, message_id: UUID, content: str) -> None:
        """Generate and persist annotations for an assistant message."""
        try:
            raw_annotations = await self.llm.generate_annotations(content)
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
        chat_history = [{"role": m.role, "content": m.content} for m in messages]
        return await self.llm.complete(chat_history)
