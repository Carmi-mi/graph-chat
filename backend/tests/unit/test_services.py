"""Unit tests for ConversationService and MessageService with mocked repositories."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.exceptions import ConversationNotFound, MessageEmptyContent, MessageNotFound
from app.models.conversation import Conversation
from app.models.message import Message
from app.services.conversation import ConversationService
from app.services.message import MessageService
from app.services.llm import MockLLMProvider


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_conversation(id: uuid.UUID | None = None, name: str = "Test") -> MagicMock:
    """Create a mock Conversation object."""
    conv = MagicMock(spec=Conversation)
    conv.id = id or uuid.uuid4()
    conv.name = name
    conv.status = "active"
    conv.parent_id = None
    conv.fork_from = None
    conv.fork_text = None
    conv.auto_exploring = False
    conv.created_at = datetime.now(tz=timezone.utc)
    conv.updated_at = datetime.now(tz=timezone.utc)
    return conv


def _make_message(
    id: uuid.UUID | None = None,
    conversation_id: uuid.UUID | None = None,
    role: str = "user",
    content: str = "Hello",
) -> MagicMock:
    """Create a mock Message object."""
    msg = MagicMock(spec=Message)
    msg.id = id or uuid.uuid4()
    msg.conversation_id = conversation_id or uuid.uuid4()
    msg.role = role
    msg.content = content
    msg.node_type = "normal"
    msg.created_at = datetime.now(tz=timezone.utc)
    msg.annotations = []
    return msg


# ---------------------------------------------------------------------------
# ConversationService tests
# ---------------------------------------------------------------------------


class TestConversationService:
    """Tests for ConversationService."""

    @pytest.fixture
    def mock_repo(self):
        """Create a mock ConversationRepository."""
        repo = AsyncMock()
        return repo

    @pytest.fixture
    def service(self, mock_repo):
        """Create a ConversationService with the mock repo."""
        return ConversationService(repository=mock_repo)

    async def test_create(self, service, mock_repo):
        """Creating a conversation should delegate to the repository."""
        expected = _make_conversation(name="My Chat")
        mock_repo.create.return_value = expected

        result = await service.create(name="My Chat")
        assert result.name == "My Chat"
        mock_repo.create.assert_awaited_once_with(name="My Chat")

    async def test_get_success(self, service, mock_repo):
        """Getting an existing conversation should return it."""
        conv = _make_conversation()
        mock_repo.get.return_value = conv

        result = await service.get(conv.id)
        assert result.id == conv.id

    async def test_get_not_found(self, service, mock_repo):
        """Getting a non-existent conversation should raise ConversationNotFound."""
        mock_repo.get.return_value = None
        with pytest.raises(ConversationNotFound):
            await service.get(uuid.uuid4())

    async def test_list(self, service, mock_repo):
        """Listing should delegate to list_by_parent."""
        convs = [_make_conversation(name="A"), _make_conversation(name="B")]
        mock_repo.list_by_parent.return_value = convs

        result = await service.list()
        assert len(result) == 2
        mock_repo.list_by_parent.assert_awaited_once_with(parent_id=None)

    async def test_update_name(self, service, mock_repo):
        """Updating name should pass only name to repository."""
        conv = _make_conversation()
        mock_repo.get.return_value = conv
        mock_repo.update.return_value = conv

        await service.update(conv.id, name="New Name")
        mock_repo.update.assert_awaited_once_with(conv.id, name="New Name")

    async def test_update_status(self, service, mock_repo):
        """Updating status should pass only status to repository."""
        conv = _make_conversation()
        mock_repo.get.return_value = conv
        mock_repo.update.return_value = conv

        await service.update(conv.id, status="archived")
        mock_repo.update.assert_awaited_once_with(conv.id, status="archived")

    async def test_update_no_changes(self, service, mock_repo):
        """Updating with all None should not call repository update."""
        conv = _make_conversation()
        mock_repo.get.return_value = conv

        result = await service.update(conv.id)
        assert result.id == conv.id
        mock_repo.update.assert_not_awaited()

    async def test_delete_success(self, service, mock_repo):
        """Deleting an existing conversation should return True."""
        conv = _make_conversation()
        mock_repo.get.return_value = conv
        mock_repo.delete.return_value = True

        result = await service.delete(conv.id)
        assert result is True

    async def test_delete_not_found(self, service, mock_repo):
        """Deleting a non-existent conversation should raise ConversationNotFound."""
        mock_repo.get.return_value = None
        with pytest.raises(ConversationNotFound):
            await service.delete(uuid.uuid4())


# ---------------------------------------------------------------------------
# MessageService tests
# ---------------------------------------------------------------------------


class TestMessageService:
    """Tests for MessageService."""

    @pytest.fixture
    def mock_msg_repo(self):
        return AsyncMock()

    @pytest.fixture
    def mock_conv_repo(self):
        return AsyncMock()

    @pytest.fixture
    def llm_provider(self):
        return MockLLMProvider()

    @pytest.fixture
    def service(self, mock_msg_repo, mock_conv_repo, llm_provider):
        return MessageService(
            message_repository=mock_msg_repo,
            conversation_repository=mock_conv_repo,
            llm_provider=llm_provider,
        )

    async def test_send_message_creates_user_msg(self, service, mock_msg_repo, mock_conv_repo):
        """Sending a user message should persist it and trigger an assistant reply."""
        conv = _make_conversation()
        user_msg = _make_message(role="user", content="Hi", conversation_id=conv.id)
        assistant_msg = _make_message(role="assistant", content="Reply", conversation_id=conv.id)

        mock_conv_repo.get.return_value = conv
        mock_msg_repo.create.side_effect = [user_msg, assistant_msg]
        mock_msg_repo.get_by_conversation.return_value = [user_msg]

        user_result, assistant_result = await service.send_message(conv.id, "user", "Hi")
        assert user_result.role == "user"
        assert assistant_result.role == "assistant"
        # create called twice: once for user, once for assistant auto-reply
        assert mock_msg_repo.create.await_count == 2

    async def test_send_message_assistant_no_auto_reply(self, service, mock_msg_repo, mock_conv_repo):
        """Sending an assistant message should not trigger an auto-reply."""
        conv = _make_conversation()
        msg = _make_message(role="assistant", content="Something", conversation_id=conv.id)

        mock_conv_repo.get.return_value = conv
        mock_msg_repo.create.return_value = msg

        user_result, assistant_result = await service.send_message(conv.id, "assistant", "Something")
        assert user_result.role == "assistant"
        assert assistant_result is None
        mock_msg_repo.create.assert_awaited_once()

    async def test_send_message_empty_content_raises(self, service, mock_conv_repo):
        """Sending an empty message should raise MessageEmptyContent."""
        conv = _make_conversation()
        mock_conv_repo.get.return_value = conv

        with pytest.raises(MessageEmptyContent):
            await service.send_message(conv.id, "user", "")

    async def test_send_message_conversation_not_found(self, service, mock_conv_repo):
        """Sending to a non-existent conversation should raise ConversationNotFound."""
        mock_conv_repo.get.return_value = None

        with pytest.raises(ConversationNotFound):
            await service.send_message(uuid.uuid4(), "user", "Hello")

    async def test_get_messages(self, service, mock_msg_repo):
        """get_messages should delegate to the repository."""
        msgs = [_make_message(), _make_message()]
        mock_msg_repo.get_by_conversation.return_value = msgs

        result = await service.get_messages(uuid.uuid4())
        assert len(result) == 2

    async def test_get_message_success(self, service, mock_msg_repo):
        """Getting an existing message should return it."""
        msg = _make_message()
        mock_msg_repo.get.return_value = msg

        result = await service.get_message(msg.id)
        assert result.id == msg.id

    async def test_get_message_not_found(self, service, mock_msg_repo):
        """Getting a non-existent message should raise MessageNotFound."""
        mock_msg_repo.get.return_value = None

        with pytest.raises(MessageNotFound):
            await service.get_message(uuid.uuid4())
