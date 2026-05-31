"""User experience integration tests.

Simulates real user behaviors across the full API surface.
Each test corresponds to a specific UX scenario that a user might encounter.
"""

import pytest
from httpx import AsyncClient


@pytest.fixture
async def conversation_with_branches(client: AsyncClient):
    """Create a conversation with a forked branch for testing.

    Returns (root_id, child_id) tuple.
    """
    # Create root conversation
    resp = await client.post("/api/conversations/", json={"name": "UX Test Conv"})
    root_id = resp.json()["id"]

    # Send a message to root to have content for forking
    await client.post("/api/messages/", json={
        "conversationId": root_id,
        "role": "user",
        "content": "What is machine learning?",
    })

    # Get messages to find the assistant reply
    resp = await client.get(f"/api/messages/{root_id}")
    messages = resp.json()["items"]
    assistant_msg = next(m for m in messages if m["role"] == "assistant")

    # Fork from the assistant message to create a child branch
    resp = await client.post(f"/api/messages/{assistant_msg['id']}/fork", json={
        "selectedText": "machine learning",
        "suggestion": "Tell me more about supervised learning",
    })
    child_id = resp.json()["id"]

    return root_id, child_id


class TestScenario1SendMessageAndWait:
    """User sends a message and waits on the same branch for the reply."""

    async def test_send_and_see_reply(self, client: AsyncClient):
        """After sending, the reply should appear in the branch's messages."""
        resp = await client.post("/api/conversations/", json={"name": "Scenario 1"})
        conv_id = resp.json()["id"]

        # Send message
        resp = await client.post("/api/messages/", json={
            "conversationId": conv_id,
            "role": "user",
            "content": "Hello",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["userMessage"]["role"] == "user"
        assert data["assistantMessage"]["role"] == "assistant"

        # Verify messages are in the branch
        resp = await client.get(f"/api/messages/{conv_id}")
        messages = resp.json()["items"]
        roles = [m["role"] for m in messages]
        assert "user" in roles
        assert "assistant" in roles
        assert len(messages) >= 2


class TestScenario2SendAndSwitchBranch:
    """User sends a message on branch A, then switches to branch B in the same tree."""

    async def test_both_branches_have_messages(
        self, client: AsyncClient, conversation_with_branches
    ):
        """Messages sent to different branches stay in their respective branches."""
        root_id, child_id = conversation_with_branches

        # Send message on root (branch A)
        await client.post("/api/messages/", json={
            "conversationId": root_id,
            "role": "user",
            "content": "Question on root",
        })

        # Send message on child (branch B)
        await client.post("/api/messages/", json={
            "conversationId": child_id,
            "role": "user",
            "content": "Question on child",
        })

        # Root should have its own messages
        resp = await client.get(f"/api/messages/{root_id}")
        root_msgs = resp.json()["items"]
        root_contents = [m["content"] for m in root_msgs]
        assert "Question on root" in root_contents
        assert "Question on child" not in root_contents

        # Child should have its own messages
        resp = await client.get(f"/api/messages/{child_id}")
        child_msgs = resp.json()["items"]
        child_contents = [m["content"] for m in child_msgs]
        assert "Question on child" in child_contents
        assert "Question on root" not in child_contents

    async def test_tree_structure_preserved(
        self, client: AsyncClient, conversation_with_branches
    ):
        """Sending messages doesn't break the conversation tree structure."""
        root_id, child_id = conversation_with_branches

        # Send messages to both
        await client.post("/api/messages/", json={
            "conversationId": root_id, "role": "user", "content": "Root msg",
        })
        await client.post("/api/messages/", json={
            "conversationId": child_id, "role": "user", "content": "Child msg",
        })

        # Tree should still have both nodes
        resp = await client.get(f"/api/conversations/{root_id}")
        tree = resp.json()
        assert tree["id"] == root_id
        assert len(tree["children"]) >= 1
        child_ids = [c["id"] for c in tree["children"]]
        assert child_id in child_ids


class TestScenario3SendAndSwitchConversation:
    """User sends a message in conversation 1, then switches to conversation 2."""

    async def test_conversations_independent(self, client: AsyncClient):
        """Messages in one conversation don't appear in another."""
        # Create two conversations
        resp1 = await client.post("/api/conversations/", json={"name": "Conv 1"})
        conv1_id = resp1.json()["id"]
        resp2 = await client.post("/api/conversations/", json={"name": "Conv 2"})
        conv2_id = resp2.json()["id"]

        # Send message in conv1
        await client.post("/api/messages/", json={
            "conversationId": conv1_id, "role": "user", "content": "Msg in conv1",
        })

        # Conv2 should be empty
        resp = await client.get(f"/api/messages/{conv2_id}")
        assert resp.json()["total"] == 0

        # Conv1 should have the message
        resp = await client.get(f"/api/messages/{conv1_id}")
        messages = resp.json()["items"]
        assert any(m["content"] == "Msg in conv1" for m in messages)


class TestScenario4ReturnToDirtyBranch:
    """User sends on branch A, switches to branch B, then returns to branch A."""

    async def test_messages_persist_after_switching_back(
        self, client: AsyncClient, conversation_with_branches
    ):
        """Messages sent on branch A should still be there when user returns."""
        root_id, child_id = conversation_with_branches

        # Send on root
        await client.post("/api/messages/", json={
            "conversationId": root_id, "role": "user", "content": "Root question",
        })

        # Switch to child (simulate by getting child messages)
        resp = await client.get(f"/api/messages/{child_id}")
        assert resp.status_code == 200

        # Return to root — messages should still be there
        resp = await client.get(f"/api/messages/{root_id}")
        root_msgs = resp.json()["items"]
        assert any(m["content"] == "Root question" for m in root_msgs)
        assert any(m["role"] == "assistant" for m in root_msgs)


class TestScenario5ReturnToDirtyConversation:
    """User sends in conv1, switches to conv2, then returns to conv1."""

    async def test_messages_persist_after_switching_conversation(
        self, client: AsyncClient
    ):
        """Messages should persist when returning to a conversation."""
        resp1 = await client.post("/api/conversations/", json={"name": "Conv A"})
        conv_a = resp1.json()["id"]
        resp2 = await client.post("/api/conversations/", json={"name": "Conv B"})
        conv_b = resp2.json()["id"]

        # Send in conv A
        await client.post("/api/messages/", json={
            "conversationId": conv_a, "role": "user", "content": "Hello A",
        })

        # Switch to conv B
        resp = await client.get(f"/api/conversations/{conv_b}")
        assert resp.status_code == 200

        # Return to conv A
        resp = await client.get(f"/api/messages/{conv_a}")
        messages = resp.json()["items"]
        assert any(m["content"] == "Hello A" for m in messages)
        assert any(m["role"] == "assistant" for m in messages)


class TestScenario6RapidMessages:
    """User sends multiple messages in quick succession."""

    async def test_multiple_messages_all_processed(self, client: AsyncClient):
        """All messages and replies should be present."""
        resp = await client.post("/api/conversations/", json={"name": "Rapid Test"})
        conv_id = resp.json()["id"]

        # Send 3 messages
        for i in range(3):
            resp = await client.post("/api/messages/", json={
                "conversationId": conv_id,
                "role": "user",
                "content": f"Message {i+1}",
            })
            assert resp.status_code == 201

        # Should have 3 user + 3 assistant = 6 messages
        resp = await client.get(f"/api/messages/{conv_id}")
        messages = resp.json()["items"]
        user_msgs = [m for m in messages if m["role"] == "user"]
        assistant_msgs = [m for m in messages if m["role"] == "assistant"]
        assert len(user_msgs) == 3
        assert len(assistant_msgs) == 3

        # Each user message should have its content
        user_contents = [m["content"] for m in user_msgs]
        assert "Message 1" in user_contents
        assert "Message 2" in user_contents
        assert "Message 3" in user_contents


class TestScenario7ChildBranchMessages:
    """User sends a message from a child branch (not root)."""

    async def test_message_on_child_branch(
        self, client: AsyncClient, conversation_with_branches
    ):
        """Messages on a child branch are stored correctly."""
        root_id, child_id = conversation_with_branches

        # Send on child
        resp = await client.post("/api/messages/", json={
            "conversationId": child_id,
            "role": "user",
            "content": "Deep question on child",
        })
        assert resp.status_code == 201

        # Verify it's in the child, not the root
        resp = await client.get(f"/api/messages/{child_id}")
        child_msgs = resp.json()["items"]
        assert any(m["content"] == "Deep question on child" for m in child_msgs)

        resp = await client.get(f"/api/messages/{root_id}")
        root_msgs = resp.json()["items"]
        assert not any(m["content"] == "Deep question on child" for m in root_msgs)

    async def test_child_branch_in_tree(
        self, client: AsyncClient, conversation_with_branches
    ):
        """After sending on child, tree structure still shows the child."""
        root_id, child_id = conversation_with_branches

        await client.post("/api/messages/", json={
            "conversationId": child_id,
            "role": "user",
            "content": "Child msg",
        })

        resp = await client.get(f"/api/conversations/{root_id}")
        tree = resp.json()
        child_ids = [c["id"] for c in tree["children"]]
        assert child_id in child_ids

        # Child in tree should have its messages
        child_in_tree = next(c for c in tree["children"] if c["id"] == child_id)
        assert len(child_in_tree["messages"]) > 0


class TestScenario8PageRefreshStateRestore:
    """User refreshes the page — state should be recoverable from API."""

    async def test_conversation_list_survives(self, client: AsyncClient):
        """Conversation list is still available after 'refresh'."""
        # Create conversations
        await client.post("/api/conversations/", json={"name": "Persist 1"})
        await client.post("/api/conversations/", json={"name": "Persist 2"})

        # "Refresh" — re-fetch conversation list
        resp = await client.get("/api/conversations/")
        items = resp.json()["items"]
        names = [c["name"] for c in items]
        assert "Persist 1" in names
        assert "Persist 2" in names

    async def test_conversation_tree_survives(
        self, client: AsyncClient, conversation_with_branches
    ):
        """Full conversation tree is available after 'refresh'."""
        root_id, child_id = conversation_with_branches

        # Send some messages
        await client.post("/api/messages/", json={
            "conversationId": root_id, "role": "user", "content": "Root msg",
        })
        await client.post("/api/messages/", json={
            "conversationId": child_id, "role": "user", "content": "Child msg",
        })

        # "Refresh" — re-fetch the tree
        resp = await client.get(f"/api/conversations/{root_id}")
        tree = resp.json()

        # Root should have messages
        assert len(tree["messages"]) > 0

        # Child should exist with messages
        assert len(tree["children"]) >= 1
        child = next(c for c in tree["children"] if c["id"] == child_id)
        assert len(child["messages"]) > 0
