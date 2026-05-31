"""Conversation repository with tree-query capabilities."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.conversation import Conversation
from app.repositories.base import BaseRepository


class ConversationRepository(BaseRepository[Conversation]):
    """Repository for Conversation CRUD and tree queries."""

    model = Conversation

    async def get_with_tree(self, id: UUID) -> Conversation | None:
        """Load a conversation with its full message tree and nested children.

        Uses recursive eager loading so the caller receives a fully-populated
        object graph without additional lazy-load queries.
        """
        stmt = (
            select(Conversation)
            .where(Conversation.id == id)
            .options(
                selectinload(Conversation.messages),
                selectinload(Conversation.children).selectinload(Conversation.messages),
                selectinload(Conversation.children).selectinload(Conversation.children),
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_parent(self, parent_id: UUID | None = None) -> list[Conversation]:
        """List conversations filtered by parent_id (None = root conversations)."""
        stmt = select(Conversation)
        if parent_id is None:
            stmt = stmt.where(Conversation.parent_id.is_(None))
        else:
            stmt = stmt.where(Conversation.parent_id == parent_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
