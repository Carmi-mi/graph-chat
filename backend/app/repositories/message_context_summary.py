"""Message context summary repository."""

from uuid import UUID

from sqlalchemy import select

from app.models.message_context_summary import MessageContextSummary
from app.repositories.base import BaseRepository


class MessageContextSummaryRepository(BaseRepository[MessageContextSummary]):
    """Repository for per-message conversation summaries."""

    model = MessageContextSummary

    async def get_by_message(self, message_id: UUID) -> MessageContextSummary | None:
        """Get the context summary for a specific message."""
        stmt = select(MessageContextSummary).where(
            MessageContextSummary.message_id == message_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_latest_by_conversation(self, conversation_id: UUID) -> MessageContextSummary | None:
        """Get the most recent context summary for a conversation."""
        stmt = (
            select(MessageContextSummary)
            .where(MessageContextSummary.conversation_id == conversation_id)
            .order_by(MessageContextSummary.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
