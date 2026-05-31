"""Merge service: combine conclusions from multiple branches."""

import uuid

from app.core.exceptions import ConversationNotFound
from app.repositories.conversation import ConversationRepository
from app.repositories.message import MessageRepository
from app.services.llm import ILLMProvider


class MergeService:
    """Merge conclusions from multiple conversation branches."""

    def __init__(
        self,
        llm_provider: ILLMProvider,
        conversation_repository: ConversationRepository,
        message_repository: MessageRepository,
    ) -> None:
        self.llm = llm_provider
        self.conversation_repo = conversation_repository
        self.message_repo = message_repository

    async def merge(
        self,
        target_id: uuid.UUID,
        source_ids: list[uuid.UUID],
        keep_option: str = "keep",
    ) -> dict:
        """Merge conclusions from source branches into the target conversation.

        Steps:
        1. Validate all conversations exist.
        2. Collect the last assistant message from each source.
        3. Ask the LLM to synthesize a combined conclusion.
        4. Append the conclusion as a message in the target conversation.
        5. Optionally archive/delete source branches based on keep_option.

        Returns a dict with 'conclusion' and 'merge_record_id'.
        """
        # Validate target
        target = await self.conversation_repo.get(target_id)
        if target is None:
            raise ConversationNotFound(message=f"Target conversation {target_id} not found")

        # Validate and collect conclusions from sources
        conclusions: list[str] = []
        for sid in source_ids:
            source = await self.conversation_repo.get(sid)
            if source is None:
                raise ConversationNotFound(message=f"Source conversation {sid} not found")
            messages = await self.message_repo.get_by_conversation(sid)
            assistant_msgs = [m for m in messages if m.role == "assistant"]
            if assistant_msgs:
                conclusions.append(assistant_msgs[-1].content)

        if not conclusions:
            conclusion_text = "No conclusions to merge."
        else:
            conclusion_text = await self.llm.synthesize(conclusions)

        # Insert a system message into the target branch with the merge conclusion
        await self.message_repo.create(
            conversation_id=target_id,
            role="system",
            content=f"## Merged Conclusion\n\n{conclusion_text}",
            node_type="merge",
        )

        # Persist the merge record
        import json

        from app.models.merge_record import MergeRecord

        record = MergeRecord(
            target_id=target_id,
            source_ids=json.dumps([str(sid) for sid in source_ids]),
            conclusion=conclusion_text,
            keep_option=keep_option,
        )
        self.conversation_repo.session.add(record)
        await self.conversation_repo.session.flush()
        await self.conversation_repo.session.refresh(record)

        # Apply keep_option to source branches
        if keep_option == "archive":
            for sid in source_ids:
                await self.conversation_repo.update(sid, status="archived")
        elif keep_option == "delete":
            for sid in source_ids:
                await self.conversation_repo.delete(sid)

        return {
            "conclusion": conclusion_text,
            "merge_record_id": record.id,
        }
