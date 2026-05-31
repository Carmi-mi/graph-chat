"""Message repository."""

from uuid import UUID

from sqlalchemy import select

from app.models.message import Message
from app.repositories.base import BaseRepository


class MessageRepository(BaseRepository[Message]):
    """Repository for Message CRUD and conversation-scoped queries."""

    model = Message

    async def get_by_conversation(
        self, conversation_id: UUID, skip: int = 0, limit: int = 500
    ) -> list[Message]:
        """Retrieve all messages for a given conversation, ordered by creation time."""
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
            .offset(skip)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count_by_conversation(self, conversation_id: UUID) -> int:
        """Count messages in a conversation."""
        from sqlalchemy import func

        stmt = select(func.count()).select_from(Message).where(
            Message.conversation_id == conversation_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one()
