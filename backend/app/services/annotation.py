"""Annotation business-logic service."""

import uuid

from app.core.exceptions import AnnotationNotFound, MessageNotFound
from app.models.annotation import Annotation
from app.repositories.annotation import AnnotationRepository
from app.repositories.message import MessageRepository


class AnnotationService:
    """Create, retrieve, and delete annotations on messages."""

    def __init__(
        self,
        annotation_repository: AnnotationRepository,
        message_repository: MessageRepository,
    ) -> None:
        self.annotation_repo = annotation_repository
        self.message_repo = message_repository

    async def create(
        self,
        message_id: uuid.UUID,
        text: str,
        start_offset: int,
        end_offset: int,
        suggestions: list[dict] | None = None,
    ) -> Annotation:
        """Create an annotation on a message.

        Validates that the target message exists before creating.
        """
        msg = await self.message_repo.get(message_id)
        if msg is None:
            raise MessageNotFound(message=f"Message {message_id} not found")

        return await self.annotation_repo.create(
            message_id=message_id,
            text=text,
            start_offset=start_offset,
            end_offset=end_offset,
            suggestions=suggestions or [],
        )

    async def get_by_message(self, message_id: uuid.UUID) -> list[Annotation]:
        """Get all annotations for a message."""
        return await self.annotation_repo.get_by_message(message_id)

    async def get(self, annotation_id: uuid.UUID) -> Annotation:
        """Get a single annotation by ID."""
        ann = await self.annotation_repo.get(annotation_id)
        if ann is None:
            raise AnnotationNotFound(message=f"Annotation {annotation_id} not found")
        return ann

    async def delete(self, annotation_id: uuid.UUID) -> bool:
        """Delete an annotation by ID."""
        await self.get(annotation_id)  # ensure it exists
        return await self.annotation_repo.delete(annotation_id)
