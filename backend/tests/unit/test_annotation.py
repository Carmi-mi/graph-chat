"""Unit tests for AnnotationService."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import AnnotationNotFound, MessageNotFound
from app.services.annotation import AnnotationService


def _make_annotation(id=None, message_id=None, text="highlighted", start=0, end=10):
    ann = MagicMock()
    ann.id = id or uuid.uuid4()
    ann.message_id = message_id or uuid.uuid4()
    ann.text = text
    ann.start_offset = start
    ann.end_offset = end
    ann.suggestions = []
    return ann


class TestAnnotationService:
    @pytest.fixture
    def mock_ann_repo(self):
        return AsyncMock()

    @pytest.fixture
    def mock_msg_repo(self):
        return AsyncMock()

    @pytest.fixture
    def service(self, mock_ann_repo, mock_msg_repo):
        return AnnotationService(
            annotation_repository=mock_ann_repo,
            message_repository=mock_msg_repo,
        )

    async def test_create_annotation(self, service, mock_ann_repo, mock_msg_repo):
        """Creating an annotation on an existing message succeeds."""
        msg_id = uuid.uuid4()
        mock_msg_repo.get.return_value = MagicMock()  # message exists
        expected = _make_annotation(message_id=msg_id)
        mock_ann_repo.create.return_value = expected

        result = await service.create(msg_id, "text", 0, 10, [{"text": "go deeper"}])
        assert result.message_id == msg_id
        mock_ann_repo.create.assert_awaited_once()

    async def test_create_on_nonexistent_message(self, service, mock_msg_repo):
        """Creating an annotation on a non-existent message raises MessageNotFound."""
        mock_msg_repo.get.return_value = None
        with pytest.raises(MessageNotFound):
            await service.create(uuid.uuid4(), "text", 0, 10)

    async def test_get_by_message(self, service, mock_ann_repo):
        """get_by_message delegates to the repository."""
        msg_id = uuid.uuid4()
        anns = [_make_annotation(message_id=msg_id), _make_annotation(message_id=msg_id)]
        mock_ann_repo.get_by_message.return_value = anns

        result = await service.get_by_message(msg_id)
        assert len(result) == 2

    async def test_get_annotation_success(self, service, mock_ann_repo):
        """Getting an existing annotation returns it."""
        ann = _make_annotation()
        mock_ann_repo.get.return_value = ann

        result = await service.get(ann.id)
        assert result.id == ann.id

    async def test_get_annotation_not_found(self, service, mock_ann_repo):
        """Getting a non-existent annotation raises AnnotationNotFound."""
        mock_ann_repo.get.return_value = None
        with pytest.raises(AnnotationNotFound):
            await service.get(uuid.uuid4())

    async def test_delete_annotation(self, service, mock_ann_repo):
        """Deleting an existing annotation returns True."""
        ann = _make_annotation()
        mock_ann_repo.get.return_value = ann
        mock_ann_repo.delete.return_value = True

        result = await service.delete(ann.id)
        assert result is True

    async def test_delete_nonexistent_annotation(self, service, mock_ann_repo):
        """Deleting a non-existent annotation raises AnnotationNotFound."""
        mock_ann_repo.get.return_value = None
        with pytest.raises(AnnotationNotFound):
            await service.delete(uuid.uuid4())

    async def test_create_with_empty_suggestions(self, service, mock_ann_repo, mock_msg_repo):
        """Creating an annotation with no suggestions defaults to empty list."""
        mock_msg_repo.get.return_value = MagicMock()
        mock_ann_repo.create.return_value = _make_annotation()

        await service.create(uuid.uuid4(), "text", 0, 10)
        call_kwargs = mock_ann_repo.create.call_args.kwargs
        assert call_kwargs.get("suggestions") == []
