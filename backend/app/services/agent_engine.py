"""Agent engine: fork suggestion and auto-explore background tasks."""

import asyncio
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from app.core.exceptions import ConversationNotFound
from app.repositories.annotation import AnnotationRepository
from app.repositories.conversation import ConversationRepository
from app.repositories.message import MessageRepository
from app.services.llm import ILLMProvider

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession


def _text_similarity(a: str, b: str) -> float:
    """Simple word-overlap similarity between two texts (0.0 to 1.0)."""
    if not a or not b:
        return 0.0
    words_a = set(a.lower().split())
    words_b = set(b.lower().split())
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / len(union)


@dataclass
class BranchTask:
    """Tracks the state of an auto-explore branch."""

    conversation_id: uuid.UUID
    name: str
    status: str = "running"
    progress: int = 0
    max_depth: int = 3


@dataclass
class AutoExploreState:
    """In-memory registry of active auto-explore tasks."""

    branches: dict[uuid.UUID, BranchTask] = field(default_factory=dict)


# Module-level singleton for tracking explore tasks across requests
_explore_state = AutoExploreState()


class AgentEngine:
    """Agent that suggests forks and runs auto-explore background tasks."""

    def __init__(
        self,
        llm_provider: ILLMProvider,
        conversation_repository: ConversationRepository,
        message_repository: MessageRepository,
        annotation_repository: "AnnotationRepository | None" = None,
        session_factory: "async_sessionmaker[AsyncSession] | None" = None,
    ) -> None:
        self.llm = llm_provider
        self.conversation_repo = conversation_repository
        self.message_repo = message_repository
        self.annotation_repo = annotation_repository
        self._session_factory = session_factory

    async def suggest_forks(
        self,
        conversation_id: uuid.UUID,
        conv_repo: ConversationRepository | None = None,
        msg_repo: MessageRepository | None = None,
        ann_repo: AnnotationRepository | None = None,
    ) -> list[dict]:
        """Analyze the latest assistant message and return fork suggestions.

        Returns a list of dicts with 'selectedText' and 'suggestion' keys.
        First tries to read existing annotations from DB; falls back to LLM.
        """
        conv_repo = conv_repo or self.conversation_repo
        msg_repo = msg_repo or self.message_repo
        ann_repo = ann_repo or self.annotation_repo

        conv = await conv_repo.get(conversation_id)
        if conv is None:
            raise ConversationNotFound(message=f"Conversation {conversation_id} not found")

        messages = await msg_repo.get_by_conversation(conversation_id)
        assistant_msgs = [m for m in messages if m.role == "assistant"]
        if not assistant_msgs:
            return []

        last_msg = assistant_msgs[-1]

        # Try reading existing annotations from DB
        if ann_repo:
            annotations = await ann_repo.get_by_message(last_msg.id)
            if annotations:
                suggestions = []
                for ann in annotations:
                    for s in (ann.suggestions or []):
                        suggestions.append({
                            "selectedText": ann.text,
                            "suggestion": s.get("text", ""),
                        })
                return suggestions

        # Fallback: generate annotations via LLM, then suggest forks
        raw_annotations = await self.llm.generate_annotations(last_msg.content)
        suggestions = await self.llm.suggest_forks(last_msg.content, raw_annotations)
        return suggestions

    async def start_auto_explore(
        self,
        branch_id: uuid.UUID,
        max_depth: int = 3,
        parallel: int = 2,
    ) -> uuid.UUID:
        """Start an auto-explore background task for a branch.

        Returns a task_id (UUID) that can be used to poll status.
        Persists exploration state to the database via auto_exploring flag.
        """
        conv = await self.conversation_repo.get(branch_id)
        if conv is None:
            raise ConversationNotFound(message=f"Conversation {branch_id} not found")

        # Persist exploring state to database
        await self.conversation_repo.update(branch_id, auto_exploring=True, status="exploring")

        task_id = uuid.uuid4()
        branch = BranchTask(
            conversation_id=branch_id,
            name=conv.name,
            max_depth=max_depth,
        )
        _explore_state.branches[task_id] = branch

        # Fire-and-forget background task
        asyncio.create_task(
            self._run_auto_explore(task_id, branch_id, max_depth, parallel)
        )
        return task_id

    def get_explore_status(self) -> list[BranchTask]:
        """Return the status of all auto-explore branches."""
        return list(_explore_state.branches.values())

    async def _run_auto_explore(
        self,
        task_id: uuid.UUID,
        conversation_id: uuid.UUID,
        max_depth: int,
        parallel: int,
    ) -> None:
        """Background coroutine that explores branches depth-first.

        Generates assistant replies in child branches and detects convergence:
        if two consecutive depth levels produce similar conclusions, stop early.
        Uses a new database session for each operation to avoid session state issues.
        """
        branch = _explore_state.branches.get(task_id)
        if branch is None:
            return

        CONVERGENCE_THRESHOLD = 0.7
        previous_conclusions: list[str] = []

        async def _get_new_repos():
            """Create new repository instances with a fresh session."""
            if self._session_factory is None:
                return self.conversation_repo, self.message_repo, self.annotation_repo, None
            session = self._session_factory()
            return (
                ConversationRepository(session=session),
                MessageRepository(session=session),
                AnnotationRepository(session=session),
                session,
            )

        async def _cleanup_session(session):
            """Commit and close a session."""
            if session is not None:
                try:
                    await session.commit()
                except Exception:
                    await session.rollback()
                finally:
                    await session.close()

        try:
            for depth in range(max_depth):
                branch.progress = depth + 1

                # Get suggestions for the current conversation using fresh repos
                conv_repo, msg_repo, ann_repo, session = await _get_new_repos()
                try:
                    suggestions = await self.suggest_forks(
                        conversation_id, conv_repo=conv_repo, msg_repo=msg_repo, ann_repo=ann_repo
                    )
                finally:
                    await _cleanup_session(session)

                if not suggestions:
                    break

                current_conclusions: list[str] = []

                # Limit to `parallel` number of forks
                for suggestion in suggestions[:parallel]:
                    selected_text = suggestion.get("selectedText", "")
                    suggestion_text = suggestion.get("suggestion", "")
                    if not selected_text:
                        continue

                    # Use fresh session for each iteration
                    conv_repo, msg_repo, ann_repo, session = await _get_new_repos()
                    try:
                        # Create a child conversation
                        child = await conv_repo.create(
                            name=f"Auto: {selected_text[:50]}",
                            parent_id=conversation_id,
                            fork_from=conversation_id,
                            fork_text=selected_text,
                        )
                        # Create user message in child
                        explore_content = (
                            f"请深入探索以下方向：\n\n"
                            f"探索主题：{suggestion_text}\n\n"
                            "## 探索要求\n"
                            "- 从多个角度分析这个主题\n"
                            "- 提供具体例子和实际案例\n"
                            "- 指出可能的限制和挑战\n"
                            "- 建议进一步探索的方向"
                            if suggestion_text
                            else f"请深入探索：{selected_text}"
                        )
                        await msg_repo.create(
                            conversation_id=child.id,
                            role="user",
                            content=explore_content,
                        )
                        # Generate assistant reply
                        chat_history = [
                            {"role": "user", "content": explore_content},
                        ]
                        reply = await self.llm.complete(chat_history)
                        await msg_repo.create(
                            conversation_id=child.id,
                            role="assistant",
                            content=reply,
                        )
                        current_conclusions.append(reply)
                    finally:
                        await _cleanup_session(session)

                # Convergence detection: compare with previous depth's conclusions
                if previous_conclusions and current_conclusions:
                    max_sim = 0.0
                    for prev in previous_conclusions:
                        for curr in current_conclusions:
                            sim = _text_similarity(prev, curr)
                            if sim > max_sim:
                                max_sim = sim
                    if max_sim >= CONVERGENCE_THRESHOLD:
                        branch.status = "completed"
                        conv_repo, _, _, session = await _get_new_repos()
                        try:
                            await conv_repo.update(conversation_id, auto_exploring=False, status="active")
                        finally:
                            await _cleanup_session(session)
                        return

                previous_conclusions = current_conclusions

                # Brief pause to avoid overwhelming the LLM
                await asyncio.sleep(0.1)

            branch.status = "completed"
            conv_repo, _, session = await _get_new_repos()
            try:
                await conv_repo.update(conversation_id, auto_exploring=False, status="active")
            finally:
                await _cleanup_session(session)
        except Exception:
            branch.status = "failed"
            if self._session_factory:
                try:
                    conv_repo, _, session = await _get_new_repos()
                    try:
                        await conv_repo.update(conversation_id, auto_exploring=False, status="active")
                    finally:
                        await _cleanup_session(session)
                except Exception:
                    pass
