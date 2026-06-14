"""Message context summary ORM model.

Stores per-message conversation summaries up to a specific assistant message,
enabling accurate context when forking from historical messages.
"""

import uuid

from sqlalchemy import ForeignKey, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class MessageContextSummary(Base):
    __tablename__ = "message_context_summaries"

    message_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("messages.id"),
        nullable=False,
        unique=True,
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("conversations.id"),
        nullable=False,
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)

    # Relationships
    message = relationship(
        "Message",
        foreign_keys=[message_id],
        lazy="selectin",
    )
    conversation = relationship(
        "Conversation",
        foreign_keys=[conversation_id],
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<MessageContextSummary(message_id={self.message_id}, summary={self.summary[:50]!r}...)>"
