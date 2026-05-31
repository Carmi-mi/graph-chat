"""Conversation ORM model."""

import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Conversation(Base):
    __tablename__ = "conversations"

    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("conversations.id"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False)
    fork_from: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("conversations.id"),
        nullable=True,
    )
    fork_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    auto_exploring: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    messages = relationship(
        "Message",
        back_populates="conversation",
        foreign_keys="Message.conversation_id",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    children = relationship(
        "Conversation",
        back_populates="parent",
        foreign_keys=[parent_id],
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    parent = relationship(
        "Conversation",
        back_populates="children",
        remote_side="Conversation.id",
        foreign_keys=[parent_id],
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Conversation(id={self.id}, name={self.name!r}, status={self.status!r})>"
