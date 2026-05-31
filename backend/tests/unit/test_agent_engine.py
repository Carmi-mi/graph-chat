"""Unit tests for AgentEngine."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import ConversationNotFound
from app.services.agent_engine import AgentEngine, BranchTask, AutoExploreState


class TestAgentEngine:
    @pytest.fixture
    def mock_conv_repo(self):
        return AsyncMock()

    @pytest.fixture
    def mock_msg_repo(self):
        return AsyncMock()

    @pytest.fixture
    def mock_llm(self):
        llm = AsyncMock()
        llm.generate_annotations.return_value = [{"text": "key point", "start": 0, "end": 10}]
        llm.suggest_forks.return_value = [
            {"selectedText": "key point", "suggestion": "Explore this further"}
        ]
        return llm

    @pytest.fixture
    def engine(self, mock_llm, mock_conv_repo, mock_msg_repo):
        return AgentEngine(
            llm_provider=mock_llm,
            conversation_repository=mock_conv_repo,
            message_repository=mock_msg_repo,
        )

    async def test_suggest_forks_returns_suggestions(self, engine, mock_conv_repo, mock_msg_repo, mock_llm):
        """suggest_forks returns LLM-generated suggestions for the last assistant message."""
        conv_id = uuid.uuid4()
        msg = MagicMock()
        msg.role = "assistant"
        msg.content = "The answer is 42."
        mock_conv_repo.get.return_value = MagicMock(id=conv_id)
        mock_msg_repo.get_by_conversation.return_value = [msg]

        result = await engine.suggest_forks(conv_id)
        assert len(result) == 1
        assert result[0]["selectedText"] == "key point"
        mock_llm.generate_annotations.assert_awaited_once()
        mock_llm.suggest_forks.assert_awaited_once()

    async def test_suggest_forks_no_assistant_messages(self, engine, mock_conv_repo, mock_msg_repo):
        """suggest_forks returns empty list when no assistant messages exist."""
        conv_id = uuid.uuid4()
        msg = MagicMock()
        msg.role = "user"
        mock_conv_repo.get.return_value = MagicMock(id=conv_id)
        mock_msg_repo.get_by_conversation.return_value = [msg]

        result = await engine.suggest_forks(conv_id)
        assert result == []

    async def test_suggest_forks_conversation_not_found(self, engine, mock_conv_repo):
        """suggest_forks raises ConversationNotFound for missing conversation."""
        mock_conv_repo.get.return_value = None
        with pytest.raises(ConversationNotFound):
            await engine.suggest_forks(uuid.uuid4())

    async def test_start_auto_explore_returns_task_id(self, engine, mock_conv_repo):
        """start_auto_explore returns a UUID task ID."""
        conv_id = uuid.uuid4()
        mock_conv_repo.get.return_value = MagicMock(id=conv_id, name="Test")

        task_id = await engine.start_auto_explore(conv_id, max_depth=2)
        assert isinstance(task_id, uuid.UUID)

    async def test_start_auto_explore_conversation_not_found(self, engine, mock_conv_repo):
        """start_auto_explore raises ConversationNotFound for missing conversation."""
        mock_conv_repo.get.return_value = None
        with pytest.raises(ConversationNotFound):
            await engine.start_auto_explore(uuid.uuid4())

    def test_get_explore_status_empty(self, engine):
        """get_explore_status returns empty list when no tasks are running."""
        # Clear any leftover state from other tests
        from app.services.agent_engine import _explore_state
        _explore_state.branches.clear()

        result = engine.get_explore_status()
        assert result == []

    def test_branch_task_defaults(self):
        """BranchTask has correct default values."""
        task = BranchTask(conversation_id=uuid.uuid4(), name="Test")
        assert task.status == "running"
        assert task.progress == 0
        assert task.max_depth == 3

    def test_auto_explore_state_defaults(self):
        """AutoExploreState starts with empty branches dict."""
        state = AutoExploreState()
        assert state.branches == {}
