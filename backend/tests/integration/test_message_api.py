"""Integration tests for Messages API endpoints."""

import uuid

import pytest
from httpx import AsyncClient

from app.services.llm import MockLLMProvider


class SpyLLMProvider(MockLLMProvider):
    """MockLLMProvider that records messages passed to complete()."""

    def __init__(self):
        super().__init__()
        self.call_log: list[list[dict]] = []

    async def complete(self, messages: list[dict]) -> str:
        self.call_log.append(messages)
        return await super().complete(messages)


@pytest.mark.asyncio
class TestMessageAPI:
    """Test /api/messages endpoints."""

    async def _create_conversation(self, client: AsyncClient) -> str:
        resp = await client.post("/api/conversations/", json={"name": "Msg Test Conv"})
        return resp.json()["id"]

    async def test_send_message(self, client: AsyncClient):
        """POST /api/messages sends a message and gets auto-reply."""
        conv_id = await self._create_conversation(client)

        resp = await client.post("/api/messages/", json={
            "conversationId": conv_id,
            "role": "user",
            "content": "Hello, what is AI?",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["userMessage"]["role"] == "user"
        assert data["userMessage"]["content"] == "Hello, what is AI?"
        assert data["userMessage"]["conversationId"] == conv_id
        assert "assistantMessage" in data
        assert data["assistantMessage"]["role"] == "assistant"

    async def test_send_message_auto_reply(self, client: AsyncClient):
        """Sending a user message triggers an auto-reply from assistant."""
        conv_id = await self._create_conversation(client)

        await client.post("/api/messages/", json={
            "conversationId": conv_id,
            "role": "user",
            "content": "Tell me about graphs",
        })

        # Check messages - should have user + assistant
        resp = await client.get(f"/api/messages/{conv_id}")
        assert resp.status_code == 200
        messages = resp.json()["items"]
        assert len(messages) >= 2
        roles = [m["role"] for m in messages]
        assert "user" in roles
        assert "assistant" in roles

    async def test_send_message_empty_content(self, client: AsyncClient):
        """POST /api/messages with empty content returns 400."""
        conv_id = await self._create_conversation(client)

        resp = await client.post("/api/messages/", json={
            "conversationId": conv_id,
            "role": "user",
            "content": "",
        })
        assert resp.status_code == 422

    async def test_send_message_conversation_not_found(self, client: AsyncClient):
        """POST /api/messages to non-existent conversation returns 404."""
        resp = await client.post("/api/messages/", json={
            "conversationId": "00000000-0000-0000-0000-000000000000",
            "role": "user",
            "content": "Hello",
        })
        assert resp.status_code == 404

    async def test_list_messages(self, client: AsyncClient):
        """GET /api/messages/{convId} returns messages in order."""
        conv_id = await self._create_conversation(client)

        await client.post("/api/messages/", json={
            "conversationId": conv_id,
            "role": "user",
            "content": "First message",
        })

        resp = await client.get(f"/api/messages/{conv_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert data["total"] >= 1

    async def test_list_messages_empty(self, client: AsyncClient):
        """GET /api/messages/{convId} for new conversation returns empty list."""
        conv_id = await self._create_conversation(client)

        resp = await client.get(f"/api/messages/{conv_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0


@pytest.mark.asyncio
class TestForkAPI:
    """Test /api/messages/{id}/fork endpoint."""

    async def test_fork_from_assistant_message(self, client: AsyncClient):
        """POST /api/messages/{id}/fork creates a child conversation."""
        # Create conversation and send message to get assistant reply
        conv_resp = await client.post("/api/conversations/", json={"name": "Fork Test"})
        conv_id = conv_resp.json()["id"]

        await client.post("/api/messages/", json={
            "conversationId": conv_id,
            "role": "user",
            "content": "Explain quantum computing",
        })

        # Get the assistant message
        msg_resp = await client.get(f"/api/messages/{conv_id}")
        messages = msg_resp.json()["items"]
        assistant_msgs = [m for m in messages if m["role"] == "assistant"]
        assert len(assistant_msgs) > 0
        assistant_msg_id = assistant_msgs[0]["id"]

        # Fork from it
        fork_resp = await client.post(f"/api/messages/{assistant_msg_id}/fork", json={
            "selectedText": "quantum computing basics",
            "suggestion": "Tell me more about qubits",
        })
        assert fork_resp.status_code == 201
        fork_data = fork_resp.json()
        assert fork_data["parentId"] == conv_id
        assert fork_data["name"] == "quantum computing basics"
        assert fork_data["forkText"] == "quantum computing basics"

    async def test_fork_text_too_short(self, client: AsyncClient):
        """Fork with empty text returns 400."""
        conv_resp = await client.post("/api/conversations/", json={"name": "Fork Short"})
        conv_id = conv_resp.json()["id"]

        await client.post("/api/messages/", json={
            "conversationId": conv_id,
            "role": "user",
            "content": "Hello",
        })

        msg_resp = await client.get(f"/api/messages/{conv_id}")
        assistant_msgs = [m for m in msg_resp.json()["items"] if m["role"] == "assistant"]
        if not assistant_msgs:
            pytest.skip("No assistant message generated")

        fork_resp = await client.post(f"/api/messages/{assistant_msgs[0]['id']}/fork", json={
            "selectedText": "",
        })
        assert fork_resp.status_code == 422

    async def test_fork_nonexistent_message(self, client: AsyncClient):
        """Fork from non-existent message returns 404."""
        resp = await client.post("/api/messages/00000000-0000-0000-0000-000000000000/fork", json={
            "selectedText": "some text",
        })
        assert resp.status_code == 404

    async def test_fork_branch_carries_parent_context(self, mock_llm):
        """Fork branch should inject parent context_summary + source message into LLM prompt."""
        from app.main import create_app
        from app.dependencies import get_db, get_llm_provider
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
        from app.models.base import Base
        import app.models  # noqa: F401
        from httpx import ASGITransport, AsyncClient

        spy = SpyLLMProvider()

        # Create a dedicated engine+session for this test
        engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        session = session_factory()

        app = create_app()
        app.dependency_overrides[get_db] = lambda: session
        app.dependency_overrides[get_llm_provider] = lambda: spy

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Create parent conversation and send a message
            conv_resp = await ac.post("/api/conversations/", json={"name": "Parent"})
            parent_id = conv_resp.json()["id"]

            await ac.post("/api/messages/", json={
                "conversationId": parent_id,
                "role": "user",
                "content": "Explain quantum computing",
            })

            # 2. Get the assistant message
            msg_resp = await ac.get(f"/api/messages/{parent_id}")
            assistant_msgs = [m for m in msg_resp.json()["items"] if m["role"] == "assistant"]
            assert len(assistant_msgs) > 0
            assistant_msg_id = assistant_msgs[0]["id"]
            assistant_content = assistant_msgs[0]["content"]

            # 3. Manually set context_summary on parent conversation
            #    (normally done by background annotation task)
            from app.repositories.conversation import ConversationRepository
            repo = ConversationRepository(session=session)
            conv = await repo.get(uuid.UUID(parent_id))
            conv.context_summary = "Discussion about quantum basics"
            await session.commit()

            # 4. Fork from the assistant message
            fork_resp = await ac.post(f"/api/messages/{assistant_msg_id}/fork", json={
                "selectedText": "quantum bits",
            })
            assert fork_resp.status_code == 201
            fork_id = fork_resp.json()["id"]

            # 5. Send a message in the fork branch
            spy.call_log.clear()
            await ac.post("/api/messages/", json={
                "conversationId": fork_id,
                "role": "user",
                "content": "Tell me more",
            })

            # 6. Verify LLM received fork context as system message
            assert len(spy.call_log) == 1
            messages = spy.call_log[0]

            # First message should be system with parent context
            assert messages[0]["role"] == "system"
            assert "Discussion about quantum basics" in messages[0]["content"]
            assert assistant_content in messages[0]["content"]

            # Remaining messages: fork_root (assistant) + user
            assert messages[1]["role"] == "assistant"
            assert messages[1]["content"] == "quantum bits"
            assert messages[2]["role"] == "user"
            assert messages[2]["content"] == "Tell me more"

        app.dependency_overrides.clear()
        await session.close()
        await engine.dispose()

    async def test_fork_branch_no_context_without_summary(self, mock_llm):
        """Fork branch without parent context_summary should only include source message."""
        from app.main import create_app
        from app.dependencies import get_db, get_llm_provider
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
        from app.models.base import Base
        import app.models  # noqa: F401
        from httpx import ASGITransport, AsyncClient

        spy = SpyLLMProvider()

        engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        session = session_factory()

        app = create_app()
        app.dependency_overrides[get_db] = lambda: session
        app.dependency_overrides[get_llm_provider] = lambda: spy

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Create conversation and get assistant reply
            conv_resp = await ac.post("/api/conversations/", json={"name": "No Summary"})
            conv_id = conv_resp.json()["id"]

            await ac.post("/api/messages/", json={
                "conversationId": conv_id,
                "role": "user",
                "content": "Hello",
            })

            msg_resp = await ac.get(f"/api/messages/{conv_id}")
            assistant_msg = [m for m in msg_resp.json()["items"] if m["role"] == "assistant"][0]

            # Fork WITHOUT setting context_summary (parent has no summary yet)
            fork_resp = await ac.post(f"/api/messages/{assistant_msg['id']}/fork", json={
                "selectedText": "some text",
            })
            fork_id = fork_resp.json()["id"]

            # Send message in fork
            spy.call_log.clear()
            await ac.post("/api/messages/", json={
                "conversationId": fork_id,
                "role": "user",
                "content": "Continue",
            })

            messages = spy.call_log[0]
            # Should have system msg with source content but NO summary
            assert messages[0]["role"] == "system"
            # Source message is the mock's assistant reply, not selectedText
            assert assistant_msg["content"] in messages[0]["content"]
            assert "背景摘要" not in messages[0]["content"]
            # fork_root + user
            assert messages[1]["role"] == "assistant"
            assert messages[2]["role"] == "user"

        app.dependency_overrides.clear()
        await session.close()
        await engine.dispose()
