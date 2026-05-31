"""Message relation ORM model (parent-child relationships between messages)."""

import uuid

from sqlalchemy import ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MessageRelation(Base):
    __tablename__ = "message_relations"

    parent_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("messages.id"),
        nullable=False,
    )
    child_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("messages.id"),
        nullable=False,
    )
    relation_type: Mapped[str] = mapped_column(String(50), default="normal", nullable=False)

    def __repr__(self) -> str:
        return f"<MessageRelation(parent={self.parent_id}, child={self.child_id}, type={self.relation_type!r})>"
