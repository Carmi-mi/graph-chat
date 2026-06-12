"""Merge service: combine conclusions from multiple branches."""

import json
import uuid

from app.core.exceptions import ConversationNotFound
from app.models.merge_record import MergeRecord
from app.repositories.conversation import ConversationRepository
from app.repositories.message import MessageRepository
from app.services.message import MessageService


class MergeService:
    """Merge conclusions from multiple conversation branches."""

    def __init__(
        self,
        conversation_repository: ConversationRepository,
        message_repository: MessageRepository,
        message_service: MessageService,
    ) -> None:
        self.conversation_repo = conversation_repository
        self.message_repo = message_repository
        self.message_service = message_service

    async def merge(
        self,
        target_id: uuid.UUID,
        source_ids: list[uuid.UUID],
        keep_option: str = "keep",
    ) -> dict:
        """Merge conclusions from source branches into the target conversation.

        1. Validate all conversations exist.
        2. Collect context_summary + last assistant message from each source.
        3. Delegate to MessageService.send_message (LLM synthesizes in reply).
        4. Persist merge record, apply keep_option.
        """
        # Validate target
        target = await self.conversation_repo.get(target_id)
        if target is None:
            raise ConversationNotFound(message=f"Target conversation {target_id} not found")

        # Validate and collect conclusions from sources
        sources: dict[uuid.UUID, object] = {}
        for sid in source_ids:
            source = await self.conversation_repo.get(sid)
            if source is None:
                raise ConversationNotFound(message=f"Source conversation {sid} not found")
            sources[sid] = source

        source_set = set(source_ids)
        conclusions: list[str] = []
        for sid in source_ids:
            source = sources[sid]
            messages = await self.message_repo.get_by_conversation(sid)
            assistant_msgs = [m for m in messages if m.role == "assistant"]
            parts: list[str] = []
            if source.parent_id and source.parent_id in source_set:
                parent_src = sources[source.parent_id]
                parts.append(f"(forked from: {parent_src.name})")
            if source.context_summary:
                parts.append(f"Summary: {source.context_summary}")
            if assistant_msgs:
                parts.append(f"Last response: {assistant_msgs[-1].content}")
            if parts:
                conclusions.append("\n".join(parts))

        if not conclusions:
            merge_content = "No conclusions to merge."
        else:
            branch_text = "\n\n".join(
                f"Branch {i + 1}:\n{c}" for i, c in enumerate(conclusions)
            )
            merge_content = (
                "以下是多个探索分支的结论，请综合分析后给出一份完整的合并结论：\n\n"
                + branch_text
            )

        # Delegate to MessageService — LLM synthesizes in _generate_reply
        _, assistant_msg = await self.message_service.send_message(
            conversation_id=target_id,
            role="user",
            content=merge_content,
            skip_annotations=True,
            skip_user_message=True,
        )

        # Persist the merge record
        record = MergeRecord(
            target_id=target_id,
            source_ids=json.dumps([str(sid) for sid in source_ids]),
            conclusion=assistant_msg.content,
            keep_option=keep_option,
        )
        self.conversation_repo.session.add(record)
        await self.conversation_repo.session.flush()
        await self.conversation_repo.session.refresh(record)

        # Apply keep_option to source branches
        if keep_option == "delete":
            for sid in source_ids:
                await self.conversation_repo.delete(sid)

        return {
            "assistant_message": assistant_msg,
        }
