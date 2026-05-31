"""Merge record ORM model."""

import uuid

from sqlalchemy import ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MergeRecord(Base):
    __tablename__ = "merge_records"

    target_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("conversations.id"),
        nullable=False,
    )
    source_ids: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        doc="JSON-encoded list of UUID strings",
    )
    conclusion: Mapped[str] = mapped_column(Text, nullable=False)
    keep_option: Mapped[str] = mapped_column(String(50), default="keep", nullable=False)

    @property
    def source_id_list(self) -> list[uuid.UUID]:
        """Deserialize source_ids from JSON string to list of UUIDs."""
        import json

        return [uuid.UUID(s) for s in json.loads(self.source_ids)]

    @source_id_list.setter
    def source_id_list(self, value: list[uuid.UUID]) -> None:
        """Serialize list of UUIDs to JSON string."""
        import json

        self.source_ids = json.dumps([str(u) for u in value])

    def __repr__(self) -> str:
        return f"<MergeRecord(id={self.id}, target_id={self.target_id}, keep_option={self.keep_option!r})>"
