"""Annotation repository."""

from uuid import UUID

from sqlalchemy import select

from app.models.annotation import Annotation
from app.repositories.base import BaseRepository


class AnnotationRepository(BaseRepository[Annotation]):
    """Repository for Annotation CRUD and message-scoped queries."""

    model = Annotation

    async def get_by_message(self, message_id: UUID) -> list[Annotation]:
        """Retrieve all annotations for a given message."""
        stmt = (
            select(Annotation)
            .where(Annotation.message_id == message_id)
            .order_by(Annotation.created_at)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def delete_by_message(self, message_id: UUID) -> int:
        """Delete all annotations for a message. Returns count deleted."""
        from sqlalchemy import delete as sa_delete

        result = await self.session.execute(
            sa_delete(Annotation).where(Annotation.message_id == message_id)
        )
        await self.session.flush()
        return result.rowcount
