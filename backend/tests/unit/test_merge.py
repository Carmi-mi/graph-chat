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
    def mock_llm(self):
        llm = AsyncMock()
        llm.synthesize.return_value = "Synthesized conclusion from all branches."
        return llm

    @pytest.fixture
    def mock_msg_repo(self):
        repo = AsyncMock()
        repo.get_by_conversation.return_value = [_make_message()]
        return repo

    @pytest.fixture
    def service(self, mock_llm, mock_conv_repo, mock_msg_repo):
        return MergeService(
            llm_provider=mock_llm,
            conversation_repository=mock_conv_repo,
            message_repository=mock_msg_repo,
        )

    async def test_merge_success(self, service, mock_conv_repo, mock_llm, mock_msg_repo):
        """Merging branches collects conclusions and synthesizes them."""
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

        assert "conclusion" in result
        assert "merge_record_id" in result
        assert result["conclusion"] == "Synthesized conclusion from all branches."
        mock_llm.synthesize.assert_awaited_once()

    async def test_merge_includes_context_summary(self, service, mock_conv_repo, mock_llm, mock_msg_repo):
        """Merge passes context_summary + last message to LLM."""
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

        call_args = mock_llm.synthesize.call_args[0][0]
        assert len(call_args) == 1
        assert "Discussion about AI" in call_args[0]
        assert "Final answer" in call_args[0]

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

    async def test_merge_no_conclusions(self, service, mock_conv_repo, mock_llm, mock_msg_repo):
        """Merging branches with no assistant messages uses fallback text."""
        target_id = uuid.uuid4()
        source_id = uuid.uuid4()

        mock_conv_repo.get.side_effect = lambda cid: _make_conversation(id=cid)
        mock_msg_repo.get_by_conversation.return_value = [_make_message(role="user")]

        result = await service.merge(target_id, [source_id])

        assert "No conclusions" in result["conclusion"]
        mock_llm.synthesize.assert_not_awaited()

    async def test_merge_archive_option(self, service, mock_conv_repo, mock_msg_repo):
        """Merge with keep_option='archive' updates source status to archived."""
        target_id = uuid.uuid4()
        source_id = uuid.uuid4()

        mock_conv_repo.get.side_effect = lambda cid: _make_conversation(id=cid)
        mock_msg_repo.get_by_conversation.return_value = [_make_message()]

        await service.merge(target_id, [source_id], "archive")

        mock_conv_repo.update.assert_awaited_with(source_id, status="archived")

    async def test_merge_delete_option(self, service, mock_conv_repo, mock_msg_repo):
        """Merge with keep_option='delete' deletes source branches."""
        target_id = uuid.uuid4()
        source_id = uuid.uuid4()

        mock_conv_repo.get.side_effect = lambda cid: _make_conversation(id=cid)
        mock_msg_repo.get_by_conversation.return_value = [_make_message()]

        await service.merge(target_id, [source_id], "delete")

        mock_conv_repo.delete.assert_awaited_with(source_id)
