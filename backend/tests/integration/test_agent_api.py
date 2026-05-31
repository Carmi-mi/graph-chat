"""Integration tests for Agent API endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestAgentSuggestAPI:
    """Test /api/agent/suggest endpoint."""

    async def test_suggest_forks(self, client: AsyncClient):
        """POST /api/agent/suggest returns fork suggestions."""
        # Create conversation with messages
        conv_resp = await client.post("/api/conversations/", json={"name": "Suggest Test"})
        conv_id = conv_resp.json()["id"]

        await client.post("/api/messages/", json={
            "conversationId": conv_id,
            "role": "user",
            "content": "Explain machine learning",
        })

        resp = await client.post(f"/api/agent/suggest?conversation_id={conv_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert "suggestions" in data
        assert "count" in data
        assert isinstance(data["suggestions"], list)

    async def test_suggest_forks_conversation_not_found(self, client: AsyncClient):
        """POST /api/agent/suggest with bad ID returns 404."""
        resp = await client.post(
            "/api/agent/suggest?conversation_id=00000000-0000-0000-0000-000000000000"
        )
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestAutoExploreAPI:
    """Test /api/agent/auto-explore and /api/agent/status endpoints."""

    async def test_start_auto_explore(self, client: AsyncClient):
        """POST /api/agent/auto-explore starts an exploration task."""
        conv_resp = await client.post("/api/conversations/", json={"name": "Explore Test"})
        conv_id = conv_resp.json()["id"]

        await client.post("/api/messages/", json={
            "conversationId": conv_id,
            "role": "user",
            "content": "What is deep learning?",
        })

        resp = await client.post("/api/agent/auto-explore", json={
            "branchId": conv_id,
            "maxDepth": 1,
            "parallel": 1,
        })
        assert resp.status_code == 202
        data = resp.json()
        assert "taskId" in data

    async def test_get_explore_status(self, client: AsyncClient):
        """GET /api/agent/status/{convId} returns exploration status."""
        conv_resp = await client.post("/api/conversations/", json={"name": "Status Test"})
        conv_id = conv_resp.json()["id"]

        resp = await client.get(f"/api/agent/status/{conv_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert "branches" in data


@pytest.mark.asyncio
class TestMergeAPI:
    """Test /api/agent/merge endpoint."""

    async def test_merge_branches(self, client: AsyncClient):
        """POST /api/agent/merge combines branch conclusions."""
        # Create parent conversation
        parent_resp = await client.post("/api/conversations/", json={"name": "Parent"})
        parent_id = parent_resp.json()["id"]

        # Send message to get assistant reply
        await client.post("/api/messages/", json={
            "conversationId": parent_id,
            "role": "user",
            "content": "Explain neural networks",
        })

        # Get assistant message to fork from
        msg_resp = await client.get(f"/api/messages/{parent_id}")
        messages = msg_resp.json()["items"]
        assistant_msgs = [m for m in messages if m["role"] == "assistant"]

        if not assistant_msgs:
            pytest.skip("No assistant message generated for forking")

        # Fork two branches
        fork1_resp = await client.post(f"/api/messages/{assistant_msgs[0]['id']}/fork", json={
            "selectedText": "neural networks",
            "suggestion": "Explain CNNs",
        })
        fork2_resp = await client.post(f"/api/messages/{assistant_msgs[0]['id']}/fork", json={
            "selectedText": "neural networks",
            "suggestion": "Explain RNNs",
        })

        branch1_id = fork1_resp.json()["id"]
        branch2_id = fork2_resp.json()["id"]

        # Merge
        merge_resp = await client.post("/api/agent/merge", json={
            "targetId": parent_id,
            "sourceIds": [branch1_id, branch2_id],
            "keepOption": "keep",
        })
        assert merge_resp.status_code == 200
        data = merge_resp.json()
        assert "conclusion" in data
        assert "mergeRecordId" in data

    async def test_merge_target_not_found(self, client: AsyncClient):
        """POST /api/agent/merge with bad target returns 404."""
        resp = await client.post("/api/agent/merge", json={
            "targetId": "00000000-0000-0000-0000-000000000000",
            "sourceIds": ["00000000-0000-0000-0000-000000000001"],
            "keepOption": "keep",
        })
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestAnnotationAPI:
    """Test /api/annotations endpoints."""

    async def test_create_annotation(self, client: AsyncClient):
        """POST /api/annotations creates an annotation."""
        conv_resp = await client.post("/api/conversations/", json={"name": "Ann Test"})
        conv_id = conv_resp.json()["id"]

        msg_resp = await client.post("/api/messages/", json={
            "conversationId": conv_id,
            "role": "user",
            "content": "Tell me about AI",
        })

        # Get messages to find assistant reply
        msgs_resp = await client.get(f"/api/messages/{conv_id}")
        messages = msgs_resp.json()["items"]
        assistant_msgs = [m for m in messages if m["role"] == "assistant"]

        if not assistant_msgs:
            pytest.skip("No assistant message for annotation")

        resp = await client.post("/api/annotations/", json={
            "messageId": assistant_msgs[0]["id"],
            "text": "machine learning",
            "startOffset": 0,
            "endOffset": 16,
            "suggestions": [{"text": "Deep dive into ML", "description": "Explore ML further"}],
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["text"] == "machine learning"

    async def test_get_annotations(self, client: AsyncClient):
        """GET /api/annotations/{msgId} returns annotations for a message."""
        conv_resp = await client.post("/api/conversations/", json={"name": "Get Ann"})
        conv_id = conv_resp.json()["id"]

        await client.post("/api/messages/", json={
            "conversationId": conv_id,
            "role": "user",
            "content": "Explain AI",
        })

        msgs_resp = await client.get(f"/api/messages/{conv_id}")
        messages = msgs_resp.json()["items"]
        assistant_msgs = [m for m in messages if m["role"] == "assistant"]

        if not assistant_msgs:
            pytest.skip("No assistant message")

        msg_id = assistant_msgs[0]["id"]

        # Create annotation first
        await client.post("/api/annotations/", json={
            "messageId": msg_id,
            "text": "test",
            "startOffset": 0,
            "endOffset": 4,
            "suggestions": [],
        })

        resp = await client.get(f"/api/annotations/{msg_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    async def test_delete_annotation(self, client: AsyncClient):
        """DELETE /api/annotations/{id} removes an annotation."""
        conv_resp = await client.post("/api/conversations/", json={"name": "Del Ann"})
        conv_id = conv_resp.json()["id"]

        await client.post("/api/messages/", json={
            "conversationId": conv_id,
            "role": "user",
            "content": "Hello",
        })

        msgs_resp = await client.get(f"/api/messages/{conv_id}")
        messages = msgs_resp.json()["items"]
        assistant_msgs = [m for m in messages if m["role"] == "assistant"]

        if not assistant_msgs:
            pytest.skip("No assistant message")

        create_resp = await client.post("/api/annotations/", json={
            "messageId": assistant_msgs[0]["id"],
            "text": "delete me",
            "startOffset": 0,
            "endOffset": 9,
            "suggestions": [],
        })
        ann_id = create_resp.json()["id"]

        resp = await client.delete(f"/api/annotations/{ann_id}")
        assert resp.status_code == 204
