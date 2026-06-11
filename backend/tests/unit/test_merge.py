"""Unit tests for MergeService."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import ConversationNotFound
from app.services.merge import MergeService


def _make_conversation(id=None, name="Branch", context_summary=None):
    conv = MagicMock()
    conv.id = id or uuid.uuid4()
    conv.name = name
    conv.context_summary = context_summary
    return conv


def _make_message(role="assistant", content="Conclusion text"):
    msg = MagicMock()
    msg.role = role
    msg.content = content
    return msg


class TestMergeService:
    @pytest.fixture
    def mock_conv_repo(self):
        repo = AsyncMock()
        repo.session = AsyncMock()
        return repo

    @pytest.fixture
    def mock_msg_repo(self):
        repo = AsyncMock()
        repo.get_by_conversation.return_value = [_make_message()]
        return repo

    @pytest.fixture
    def mock_msg_service(self):
        svc = AsyncMock()
        assistant_msg = _make_message(role="assistant", content="Synthesized conclusion from all branches.")
        svc.send_message.return_value = (None, assistant_msg)
        return svc

    @pytest.fixture
    def service(self, mock_conv_repo, mock_msg_repo, mock_msg_service):
        return MergeService(
            conversation_repository=mock_conv_repo,
            message_repository=mock_msg_repo,
            message_service=mock_msg_service,
        )

    async def test_merge_success(self, service, mock_conv_repo, mock_msg_repo, mock_msg_service):
        """Merging branches collects conclusions and delegates to MessageService."""
        target_id = uuid.uuid4()
        source_id = uuid.uuid4()
        target = _make_conversation(id=target_id)
        source = _make_conversation(id=source_id)

        mock_conv_repo.get.side_effect = lambda cid: {
            target_id: target,
            source_id: source,
        }.get(cid)

        mock_msg_repo.get_by_conversation.return_value = [_make_message()]

        result = await service.merge(target_id, [source_id], "keep")

        assert "assistant_message" in result
        assert "user_message" not in result
        mock_msg_service.send_message.assert_awaited_once()
        call_kwargs = mock_msg_service.send_message.call_args
        assert call_kwargs.kwargs.get("skip_annotations") is True
        assert call_kwargs.kwargs.get("skip_user_message") is True

    async def test_merge_passes_conclusions_to_send_message(self, service, mock_conv_repo, mock_msg_repo, mock_msg_service):
        """Merge passes branch conclusions as content to send_message."""
        target_id = uuid.uuid4()
        source_id = uuid.uuid4()
        target = _make_conversation(id=target_id)
        source = _make_conversation(id=source_id, context_summary="Discussion about AI")

        mock_conv_repo.get.side_effect = lambda cid: {
            target_id: target,
            source_id: source,
        }.get(cid)

        mock_msg_repo.get_by_conversation.return_value = [_make_message(content="Final answer")]

        await service.merge(target_id, [source_id], "keep")

        call_args = mock_msg_service.send_message.call_args
        content = call_args.kwargs.get("content", call_args.args[2] if len(call_args.args) > 2 else "")
        assert "Discussion about AI" in content
        assert "Final answer" in content

    async def test_merge_annotates_branch_relationships(self, service, mock_conv_repo, mock_msg_repo, mock_msg_service):
        """Merge annotates parent-child relationships between source branches."""
        target_id = uuid.uuid4()
        parent_id = uuid.uuid4()
        child_id = uuid.uuid4()

        target = _make_conversation(id=target_id)
        parent = _make_conversation(id=parent_id, name="Parent Branch")
        child = _make_conversation(id=child_id, name="Child Branch")
        child.parent_id = parent_id

        mock_conv_repo.get.side_effect = lambda cid: {
            target_id: target,
            parent_id: parent,
            child_id: child,
        }.get(cid)

        mock_msg_repo.get_by_conversation.return_value = [_make_message(content="Answer")]

        await service.merge(target_id, [parent_id, child_id], "keep")

        call_args = mock_msg_service.send_message.call_args
        content = call_args.kwargs.get("content", call_args.args[2] if len(call_args.args) > 2 else "")
        assert "forked from: Parent Branch" in content

    async def test_merge_target_not_found(self, service, mock_conv_repo):
        """Merging with non-existent target raises ConversationNotFound."""
        mock_conv_repo.get.return_value = None
        with pytest.raises(ConversationNotFound):
            await service.merge(uuid.uuid4(), [uuid.uuid4()])

    async def test_merge_source_not_found(self, service, mock_conv_repo):
        """Merging with non-existent source raises ConversationNotFound."""
        target_id = uuid.uuid4()
        source_id = uuid.uuid4()

        mock_conv_repo.get.side_effect = lambda cid: {
            target_id: _make_conversation(id=target_id),
        }.get(cid)

        with pytest.raises(ConversationNotFound):
            await service.merge(target_id, [source_id])

    async def test_merge_no_conclusions(self, service, mock_conv_repo, mock_msg_repo, mock_msg_service):
        """Merging branches with no assistant messages uses fallback text."""
        target_id = uuid.uuid4()
        source_id = uuid.uuid4()

        mock_conv_repo.get.side_effect = lambda cid: _make_conversation(id=cid)
        mock_msg_repo.get_by_conversation.return_value = [_make_message(role="user")]

        await service.merge(target_id, [source_id])

        call_args = mock_msg_service.send_message.call_args
        content = call_args.kwargs.get("content", call_args.args[2] if len(call_args.args) > 2 else "")
        assert "No conclusions" in content

    async def test_merge_archive_option(self, service, mock_conv_repo, mock_msg_repo, mock_msg_service):
        """Merge with keep_option='archive' updates source status to archived."""
        target_id = uuid.uuid4()
        source_id = uuid.uuid4()

        mock_conv_repo.get.side_effect = lambda cid: _make_conversation(id=cid)
        mock_msg_repo.get_by_conversation.return_value = [_make_message()]

        await service.merge(target_id, [source_id], "archive")

        mock_conv_repo.update.assert_awaited_with(source_id, status="archived")

    async def test_merge_delete_option(self, service, mock_conv_repo, mock_msg_repo, mock_msg_service):
        """Merge with keep_option='delete' deletes source branches."""
        target_id = uuid.uuid4()
        source_id = uuid.uuid4()

        mock_conv_repo.get.side_effect = lambda cid: _make_conversation(id=cid)
        mock_msg_repo.get_by_conversation.return_value = [_make_message()]

        await service.merge(target_id, [source_id], "delete")

        mock_conv_repo.delete.assert_awaited_with(source_id)
