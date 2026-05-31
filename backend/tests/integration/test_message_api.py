"""Integration tests for Messages API endpoints."""

import pytest
from httpx import AsyncClient


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
        assert "Fork:" in fork_data["name"]
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
