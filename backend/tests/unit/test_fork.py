"""Unit tests for ForkService."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import (
    ConversationNotFound,
    ForkFromNonAssistant,
    ForkTextTooLong,
    ForkTextTooShort,
    MessageNotFound,
)
from app.services.fork import ForkService, MAX_FORK_TEXT_LENGTH


def _make_message(id=None, role="assistant", content="Some answer", conversation_id=None):
    msg = MagicMock()
    msg.id = id or uuid.uuid4()
    msg.role = role
    msg.content = content
    msg.conversation_id = conversation_id or uuid.uuid4()
    return msg


def _make_conversation(id=None, name="Test Conv"):
    conv = MagicMock()
    conv.id = id or uuid.uuid4()
    conv.name = name
    return conv


class TestForkService:
    @pytest.fixture
    def mock_conv_repo(self):
        return AsyncMock()

    @pytest.fixture
    def mock_msg_repo(self):
        return AsyncMock()

    @pytest.fixture
    def service(self, mock_conv_repo, mock_msg_repo):
        return ForkService(
            conversation_repository=mock_conv_repo,
            message_repository=mock_msg_repo,
        )

    async def test_fork_success(self, service, mock_conv_repo, mock_msg_repo):
        """Forking from an assistant message creates a child conversation."""
        conv_id = uuid.uuid4()
        msg = _make_message(conversation_id=conv_id)
        conv = _make_conversation(id=conv_id)
        child = _make_conversation(name="Fork: Some text")

        mock_msg_repo.get.return_value = msg
        mock_conv_repo.get.return_value = conv
        mock_conv_repo.create.return_value = child
        mock_msg_repo.create.return_value = MagicMock()

        result = await service.fork(msg.id, "Some selected text", "Try this")
        assert result.name.startswith("Fork:")
        mock_conv_repo.create.assert_awaited_once()
        mock_msg_repo.create.assert_awaited_once()

    async def test_fork_with_suggestion(self, service, mock_conv_repo, mock_msg_repo):
        """Fork with suggestion appends suggestion to context content."""
        conv_id = uuid.uuid4()
        msg = _make_message(conversation_id=conv_id)
        conv = _make_conversation(id=conv_id)
        child = _make_conversation()

        mock_msg_repo.get.return_value = msg
        mock_conv_repo.get.return_value = conv
        mock_conv_repo.create.return_value = child
        mock_msg_repo.create.return_value = MagicMock()

        await service.fork(msg.id, "Selected text", "My suggestion")
        create_call = mock_msg_repo.create.call_args
        assert "My suggestion" in create_call.kwargs.get("content", create_call[1].get("content", ""))

    async def test_fork_text_too_short(self, service):
        """Fork with empty text raises ForkTextTooShort."""
        with pytest.raises(ForkTextTooShort):
            await service.fork(uuid.uuid4(), "")

    async def test_fork_text_too_long(self, service):
        """Fork with text exceeding max length raises ForkTextTooLong."""
        long_text = "x" * (MAX_FORK_TEXT_LENGTH + 1)
        with pytest.raises(ForkTextTooLong):
            await service.fork(uuid.uuid4(), long_text)

    async def test_fork_nonexistent_message(self, service, mock_msg_repo):
        """Fork from a non-existent message raises MessageNotFound."""
        mock_msg_repo.get.return_value = None
        with pytest.raises(MessageNotFound):
            await service.fork(uuid.uuid4(), "Some text")

    async def test_fork_from_user_message(self, service, mock_msg_repo):
        """Fork from a user message raises ForkFromNonAssistant."""
        msg = _make_message(role="user")
        mock_msg_repo.get.return_value = msg
        with pytest.raises(ForkFromNonAssistant):
            await service.fork(msg.id, "Some text")

    async def test_fork_from_system_message(self, service, mock_msg_repo):
        """Fork from a system message raises ForkFromNonAssistant."""
        msg = _make_message(role="system")
        mock_msg_repo.get.return_value = msg
        with pytest.raises(ForkFromNonAssistant):
            await service.fork(msg.id, "Some text")

    async def test_fork_creates_fork_root_message(self, service, mock_conv_repo, mock_msg_repo):
        """Fork creates a context message with node_type='fork_root'."""
        conv_id = uuid.uuid4()
        msg = _make_message(conversation_id=conv_id)
        conv = _make_conversation(id=conv_id)
        child = _make_conversation()

        mock_msg_repo.get.return_value = msg
        mock_conv_repo.get.return_value = conv
        mock_conv_repo.create.return_value = child
        mock_msg_repo.create.return_value = MagicMock()

        await service.fork(msg.id, "Text here")
        create_call = mock_msg_repo.create.call_args
        assert create_call.kwargs.get("node_type") == "fork_root" or create_call[1].get("node_type") == "fork_root"
