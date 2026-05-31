"""Annotation ORM model."""

import uuid

from sqlalchemy import JSON, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Annotation(Base):
    __tablename__ = "annotations"

    message_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("messages.id"),
        nullable=False,
    )
    text: Mapped[str] = mapped_column(String(255), nullable=False)
    start_offset: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_offset: Mapped[int | None] = mapped_column(Integer, nullable=True)
    suggestions: Mapped[list | None] = mapped_column(JSON, default=list, nullable=True)

    # Relationships
    message = relationship(
        "Message",
        back_populates="annotations",
        foreign_keys=[message_id],
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Annotation(id={self.id}, text={self.text!r}, message_id={self.message_id})>"
