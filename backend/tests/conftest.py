"""Shared test fixtures for the Graph Chat test suite."""

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.dependencies import get_db, get_llm_provider
from app.main import create_app
import app.models  # noqa: F401  -- register all models with Base.metadata
from app.models.base import Base
from app.services.llm import MockLLMProvider


# ---------------------------------------------------------------------------
# Database fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="session")
async def db_engine():
    """Create an in-memory SQLite engine for testing."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Yield a transactional session that rolls back after each test."""
    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()


# ---------------------------------------------------------------------------
# Mock LLM fixture
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_llm() -> MockLLMProvider:
    """Return a MockLLMProvider for deterministic test responses."""
    return MockLLMProvider()


# ---------------------------------------------------------------------------
# Test client fixture
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def client(db_session, mock_llm) -> AsyncGenerator[AsyncClient, None]:
    """Return an httpx AsyncClient wired to the test app with overridden dependencies."""
    app = create_app()

    # Override dependencies to use test session and mock LLM
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_llm_provider] = lambda: mock_llm

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
