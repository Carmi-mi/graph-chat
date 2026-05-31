"""Annotations router -- thin HTTP layer."""

from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.dependencies import get_annotation_service
from app.schemas.annotation import (
    AnnotationResponse,
    CreateAnnotationRequest,
)
from app.services.annotation import AnnotationService

router = APIRouter(prefix="/annotations", tags=["annotations"])


@router.post("/", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
async def create_annotation(
    body: CreateAnnotationRequest,
    service: AnnotationService = Depends(get_annotation_service),
) -> AnnotationResponse:
    """Create an annotation on a message."""
    ann = await service.create(
        message_id=body.message_id,
        text=body.text,
        start_offset=body.start_offset,
        end_offset=body.end_offset,
        suggestions=[s.model_dump() for s in body.suggestions],
    )
    return AnnotationResponse.model_validate(ann)


@router.get("/{message_id}", response_model=list[AnnotationResponse])
async def list_annotations(
    message_id: UUID,
    service: AnnotationService = Depends(get_annotation_service),
) -> list[AnnotationResponse]:
    """Get all annotations for a message."""
    items = await service.get_by_message(message_id)
    return [AnnotationResponse.model_validate(a) for a in items]


@router.delete("/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_annotation(
    annotation_id: UUID,
    service: AnnotationService = Depends(get_annotation_service),
) -> None:
    """Delete an annotation."""
    await service.delete(annotation_id)
