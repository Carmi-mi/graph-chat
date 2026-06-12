import type { ConversationWithTree, Message } from '../schemas';
import { useConversationStore, useUIStore } from '../store';
import * as conversationApi from '../api/conversation';

/**
 * Append messages to a branch in the conversation tree.
 * Handles: in-memory tree update, dirty dot, sidebar refresh.
 */
export function appendMessagesToTree(
  root: ConversationWithTree,
  branchId: string,
  messages: Message[],
): ConversationWithTree {
  const append = (node: ConversationWithTree): ConversationWithTree => {
    if (node.id === branchId) {
      return { ...node, messages: [...node.messages, ...messages] };
    }
    return { ...node, children: node.children.map(append) };
  };
  return append(root);
}

/**
 * Post-message delivery: update store, set dirty dots, refresh sidebar.
 * Works for both normal send and merge.
 */
export function handleMessageDelivered(
  conversationId: string,
  branchId: string,
  messages: Message[],
): void {
  const state = useConversationStore.getState();
  const stillOnSameConversation = state.currentConversation?.id === conversationId;
  const stillOnSameBranch = state.currentBranchId === branchId;

  if (stillOnSameConversation && stillOnSameBranch && state.currentConversation) {
    useConversationStore.setState({
      currentConversation: appendMessagesToTree(state.currentConversation, branchId, messages),
      currentBranchId: branchId,
    });
  } else if (stillOnSameConversation && state.currentConversation) {
    useConversationStore.setState({
      currentConversation: appendMessagesToTree(state.currentConversation, branchId, messages),
    });
    useUIStore.getState().addDirtyBranch(conversationId, branchId);
  } else {
    useConversationStore.getState().updateCachedConversation(
      conversationId,
      (conv) => appendMessagesToTree(conv, branchId, messages),
    );
    useUIStore.getState().addDirtyBranch(conversationId, branchId);
  }

  // Refresh sidebar
  conversationApi.listConversations().then(
    (res) => useConversationStore.getState().setConversations(res.items),
  ).catch(() => {});
}
