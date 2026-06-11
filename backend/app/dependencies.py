"""Dependency injection composition root for FastAPI."""

from collections.abc import AsyncGenerator

from fastapi import Depends
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.repositories.annotation import AnnotationRepository
from app.repositories.conversation import ConversationRepository
from app.repositories.message import MessageRepository
from app.services.agent_engine import AgentEngine
from app.services.annotation import AnnotationService
from app.services.conversation import ConversationService
from app.services.fork import ForkService
from app.services.llm import ILLMProvider, get_llm_provider_instance
from app.services.merge import MergeService
from app.services.message import MessageService

# ---------------------------------------------------------------------------
# Database engine & session factory (created once at import time)
# ---------------------------------------------------------------------------

_settings = get_settings()
_is_sqlite = _settings.DATABASE_URL.startswith("sqlite")
_engine = create_async_engine(
    _settings.DATABASE_URL,
    echo=_settings.is_development,
    future=True,
    connect_args={"timeout": 30} if _is_sqlite else {},
)

if _is_sqlite:
    @event.listens_for(_engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

_session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


# ---------------------------------------------------------------------------
# Database session dependency
# ---------------------------------------------------------------------------

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session; auto-commits on success, rolls back on error."""
    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# Repository dependencies
# ---------------------------------------------------------------------------

def get_conversation_repository(
    db: AsyncSession = Depends(get_db),
) -> ConversationRepository:
    return ConversationRepository(session=db)


def get_message_repository(
    db: AsyncSession = Depends(get_db),
) -> MessageRepository:
    return MessageRepository(session=db)


def get_annotation_repository(
    db: AsyncSession = Depends(get_db),
) -> AnnotationRepository:
    return AnnotationRepository(session=db)


# ---------------------------------------------------------------------------
# LLM provider dependency
# ---------------------------------------------------------------------------

def get_llm_provider() -> ILLMProvider:
    return get_llm_provider_instance()


# ---------------------------------------------------------------------------
# Service dependencies
# ---------------------------------------------------------------------------

def get_conversation_service(
    repo: ConversationRepository = Depends(get_conversation_repository),
) -> ConversationService:
    return ConversationService(repository=repo)


def get_message_service(
    msg_repo: MessageRepository = Depends(get_message_repository),
    conv_repo: ConversationRepository = Depends(get_conversation_repository),
    llm: ILLMProvider = Depends(get_llm_provider),
    ann_repo: AnnotationRepository = Depends(get_annotation_repository),
) -> MessageService:
    return MessageService(
        message_repository=msg_repo,
        conversation_repository=conv_repo,
        llm_provider=llm,
        annotation_repository=ann_repo,
        session_factory=_session_factory,
    )


def get_fork_service(
    conv_repo: ConversationRepository = Depends(get_conversation_repository),
    msg_repo: MessageRepository = Depends(get_message_repository),
) -> ForkService:
    return ForkService(
        conversation_repository=conv_repo,
        message_repository=msg_repo,
    )


def get_annotation_service(
    ann_repo: AnnotationRepository = Depends(get_annotation_repository),
    msg_repo: MessageRepository = Depends(get_message_repository),
) -> AnnotationService:
    return AnnotationService(
        annotation_repository=ann_repo,
        message_repository=msg_repo,
    )


def get_agent_engine(
    llm: ILLMProvider = Depends(get_llm_provider),
    conv_repo: ConversationRepository = Depends(get_conversation_repository),
    msg_repo: MessageRepository = Depends(get_message_repository),
    ann_repo: AnnotationRepository = Depends(get_annotation_repository),
) -> AgentEngine:
    return AgentEngine(
        llm_provider=llm,
        conversation_repository=conv_repo,
        message_repository=msg_repo,
        annotation_repository=ann_repo,
        session_factory=_session_factory,
    )


def get_merge_service(
    conv_repo: ConversationRepository = Depends(get_conversation_repository),
    msg_repo: MessageRepository = Depends(get_message_repository),
    msg_service: MessageService = Depends(get_message_service),
) -> MergeService:
    return MergeService(
        conversation_repository=conv_repo,
        message_repository=msg_repo,
        message_service=msg_service,
    )


def get_engine():
    """Return the SQLAlchemy async engine (for lifespan init)."""
    return _engine
