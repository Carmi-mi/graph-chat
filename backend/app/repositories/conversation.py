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

    async def delete(self, id: UUID) -> bool:
        """Delete a conversation using ORM session to trigger cascade deletes.

        Uses session.delete() instead of bulk DELETE so that ORM-level
        cascade rules (messages, children, annotations) are fired.
        Also cleans up message_relations and merge_records that FK to
        messages/conversations being deleted.
        """
        from sqlalchemy import select
        from app.models.message import Message
        from app.models.message_relation import MessageRelation
        from app.models.merge_record import MergeRecord

        # Collect all message IDs in this conversation tree (recursive)
        msg_ids: set[UUID] = set()
        conv_ids: set[UUID] = {id}

        # BFS to find all descendant conversation IDs
        queue = [id]
        while queue:
            cid = queue.pop(0)
            stmt = select(Conversation.id).where(Conversation.parent_id == cid)
            result = await self.session.execute(stmt)
            child_ids = [row[0] for row in result.all()]
            conv_ids.update(child_ids)
            queue.extend(child_ids)

        # Collect all message IDs belonging to these conversations
        if conv_ids:
            stmt = select(Message.id).where(Message.conversation_id.in_(conv_ids))
            result = await self.session.execute(stmt)
            msg_ids = {row[0] for row in result.all()}

        # Delete message_relations referencing these messages
        if msg_ids:
            await self.session.execute(
                select(MessageRelation).where(
                    (MessageRelation.parent_id.in_(msg_ids))
                    | (MessageRelation.child_id.in_(msg_ids))
                )
            )
            from sqlalchemy import delete as sql_delete
            await self.session.execute(
                sql_delete(MessageRelation).where(
                    (MessageRelation.parent_id.in_(msg_ids))
                    | (MessageRelation.child_id.in_(msg_ids))
                )
            )

        # Delete merge_records targeting these conversations
        if conv_ids:
            from sqlalchemy import delete as sql_delete
            await self.session.execute(
                sql_delete(MergeRecord).where(MergeRecord.target_id.in_(conv_ids))
            )

        # Now use session.delete to trigger ORM cascades
        conv = await self.get(id)
        if conv is None:
            return False
        await self.session.delete(conv)
        await self.session.flush()
        return True

    async def list_by_parent(self, parent_id: UUID | None = None) -> list[Conversation]:
        """List conversations filtered by parent_id (None = root conversations)."""
        stmt = select(Conversation)
        if parent_id is None:
            stmt = stmt.where(Conversation.parent_id.is_(None))
        else:
            stmt = stmt.where(Conversation.parent_id == parent_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
