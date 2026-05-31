"""Integration tests for Conversations API endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestConversationAPI:
    """Test /api/conversations endpoints."""

    async def test_create_conversation(self, client: AsyncClient):
        """POST /api/conversations creates a new conversation."""
        resp = await client.post("/api/conversations/", json={"name": "Test Conv"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test Conv"
        assert "id" in data
        assert data["status"] == "active"

    async def test_list_conversations(self, client: AsyncClient):
        """GET /api/conversations returns a list."""
        await client.post("/api/conversations/", json={"name": "Conv 1"})
        await client.post("/api/conversations/", json={"name": "Conv 2"})
        resp = await client.get("/api/conversations/")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert data["total"] >= 2

    async def test_get_conversation_with_tree(self, client: AsyncClient):
        """GET /api/conversations/{id} returns conversation with messages and children."""
        create_resp = await client.post("/api/conversations/", json={"name": "Tree Conv"})
        conv_id = create_resp.json()["id"]

        resp = await client.get(f"/api/conversations/{conv_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == conv_id
        assert data["name"] == "Tree Conv"
        assert "messages" in data
        assert "children" in data
        assert isinstance(data["messages"], list)
        assert isinstance(data["children"], list)

    async def test_get_conversation_not_found(self, client: AsyncClient):
        """GET /api/conversations/{id} with bad ID returns 404."""
        resp = await client.get("/api/conversations/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404

    async def test_update_conversation_name(self, client: AsyncClient):
        """PUT /api/conversations/{id} updates name."""
        create_resp = await client.post("/api/conversations/", json={"name": "Old Name"})
        conv_id = create_resp.json()["id"]

        resp = await client.put(f"/api/conversations/{conv_id}", json={"name": "New Name"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    async def test_update_conversation_status(self, client: AsyncClient):
        """PUT /api/conversations/{id} updates status."""
        create_resp = await client.post("/api/conversations/", json={"name": "Status Conv"})
        conv_id = create_resp.json()["id"]

        resp = await client.put(f"/api/conversations/{conv_id}", json={"status": "archived"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "archived"

    async def test_delete_conversation(self, client: AsyncClient):
        """DELETE /api/conversations/{id} removes the conversation."""
        create_resp = await client.post("/api/conversations/", json={"name": "To Delete"})
        conv_id = create_resp.json()["id"]

        resp = await client.delete(f"/api/conversations/{conv_id}")
        assert resp.status_code == 204

        # Verify it's gone
        resp = await client.get(f"/api/conversations/{conv_id}")
        assert resp.status_code == 404

    async def test_delete_conversation_not_found(self, client: AsyncClient):
        """DELETE /api/conversations/{id} with bad ID returns 404."""
        resp = await client.delete("/api/conversations/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404
