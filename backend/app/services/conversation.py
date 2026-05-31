"""Conversation business-logic service."""

from uuid import UUID

from app.core.exceptions import ConversationNotFound
from app.models.conversation import Conversation
from app.repositories.conversation import ConversationRepository


class ConversationService:
    """CRUD and tree-query operations for conversations."""

    def __init__(self, repository: ConversationRepository) -> None:
        self.repository = repository

    async def create(self, name: str) -> Conversation:
        """Create a new root conversation."""
        return await self.repository.create(name=name)

    async def get(self, id: UUID) -> Conversation:
        """Retrieve a single conversation or raise ConversationNotFound."""
        conv = await self.repository.get(id)
        if conv is None:
            raise ConversationNotFound(message=f"Conversation {id} not found")
        return conv

    async def get_with_tree(self, id: UUID) -> Conversation:
        """Retrieve a conversation with its full message/child tree."""
        conv = await self.repository.get_with_tree(id)
        if conv is None:
            raise ConversationNotFound(message=f"Conversation {id} not found")
        return conv

    async def list(self, skip: int = 0, limit: int = 100) -> list[Conversation]:
        """List root conversations (no parent)."""
        return await self.repository.list_by_parent(parent_id=None)

    async def update(self, id: UUID, *, name: str | None = None, status: str | None = None) -> Conversation:
        """Update conversation fields. Only non-None values are applied."""
        conv = await self.get(id)
        update_data: dict = {}
        if name is not None:
            update_data["name"] = name
        if status is not None:
            update_data["status"] = status
        if update_data:
            return await self.repository.update(id, **update_data)
        return conv

    async def delete(self, id: UUID) -> bool:
        """Delete a conversation by ID."""
        await self.get(id)  # ensure it exists
        return await self.repository.delete(id)
