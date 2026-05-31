"""Abstract and concrete base repository implementations."""

from abc import ABC, abstractmethod
from typing import Generic, TypeVar
from uuid import UUID

from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Base

T = TypeVar("T", bound=Base)


class AbstractRepository(ABC, Generic[T]):
    """Abstract repository interface defining CRUD operations."""

    @abstractmethod
    async def get(self, id: UUID) -> T | None:
        """Retrieve a single record by ID."""
        ...

    @abstractmethod
    async def list(self, skip: int = 0, limit: int = 100, **filters) -> list[T]:
        """List records with optional filtering and pagination."""
        ...

    @abstractmethod
    async def create(self, **kwargs) -> T:
        """Create a new record."""
        ...

    @abstractmethod
    async def update(self, id: UUID, **kwargs) -> T:
        """Update an existing record by ID."""
        ...

    @abstractmethod
    async def delete(self, id: UUID) -> bool:
        """Delete a record by ID. Returns True if deleted."""
        ...


class BaseRepository(AbstractRepository[T]):
    """Concrete SQLAlchemy repository implementation.

    Subclasses must set `model` to the ORM class they manage.
    """

    model: type[T]  # to be set by subclasses

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, id: UUID) -> T | None:
        result = await self.session.execute(
            select(self.model).where(self.model.id == id)
        )
        return result.scalar_one_or_none()

    async def list(self, skip: int = 0, limit: int = 100, **filters) -> list[T]:
        stmt = select(self.model)
        for key, value in filters.items():
            if hasattr(self.model, key) and value is not None:
                stmt = stmt.where(getattr(self.model, key) == value)
        stmt = stmt.offset(skip).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, **kwargs) -> T:
        instance = self.model(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def update(self, id: UUID, **kwargs) -> T:
        await self.session.execute(
            update(self.model).where(self.model.id == id).values(**kwargs)
        )
        await self.session.flush()
        return await self.get(id)

    async def delete(self, id: UUID) -> bool:
        result = await self.session.execute(
            delete(self.model).where(self.model.id == id)
        )
        await self.session.flush()
        return result.rowcount > 0
