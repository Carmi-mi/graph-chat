import { describe, it, expect, beforeEach } from 'vitest';
import useConversationStore from '../conversationStore';
import type { ConversationWithTree } from '../../schemas';

// Helper to create a mock conversation tree
function makeConv(id: string, children: ConversationWithTree[] = []): ConversationWithTree {
  return {
    id,
    name: `Conv ${id}`,
    parentId: null,
    status: 'active',
    forkFrom: null,
    forkText: null,
    autoExploring: false,
    contextSummary: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    children,
  };
}

describe('conversationStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useConversationStore.setState({
      conversations: [],
      currentConversation: null,
      currentBranchId: null,
      conversationBranchMap: {},
      isLoading: false,
      error: null,
    });
  });

  describe('setCurrentConversation', () => {
    it('defaults currentBranchId to root for a new conversation', () => {
      const convA = makeConv('a');
      const convB = makeConv('b');

      useConversationStore.getState().setCurrentConversation(convA);
      expect(useConversationStore.getState().currentBranchId).toBe('a');

      useConversationStore.getState().setCurrentConversation(convB);
      expect(useConversationStore.getState().currentBranchId).toBe('b');
    });

    it('restores saved branch when switching back to a conversation', () => {
      const convA = makeConv('a');
      const convB = makeConv('b');

      // User is on conversation A, branch X
      useConversationStore.getState().setCurrentConversation(convA);
      useConversationStore.getState().setCurrentBranchId('branch-x');
      expect(useConversationStore.getState().currentBranchId).toBe('branch-x');

      // Switch to conversation B
      useConversationStore.getState().setCurrentConversation(convB);
      expect(useConversationStore.getState().currentBranchId).toBe('b');

      // Switch back to conversation A — should restore branch-x
      useConversationStore.getState().setCurrentConversation(convA);
      expect(useConversationStore.getState().currentBranchId).toBe('branch-x');
    });

    it('updates conversationBranchMap when switching branches', () => {
      const convA = makeConv('a');

      useConversationStore.getState().setCurrentConversation(convA);
      useConversationStore.getState().setCurrentBranchId('branch-x');

      expect(useConversationStore.getState().conversationBranchMap['a']).toBe('branch-x');

      useConversationStore.getState().setCurrentBranchId('branch-y');
      expect(useConversationStore.getState().conversationBranchMap['a']).toBe('branch-y');
    });

    it('saves branch position before switching away', () => {
      const convA = makeConv('a');
      const convB = makeConv('b');

      useConversationStore.getState().setCurrentConversation(convA);
      useConversationStore.getState().setCurrentBranchId('branch-x');

      // Switch to B — should save A's branch position
      useConversationStore.getState().setCurrentConversation(convB);
      expect(useConversationStore.getState().conversationBranchMap['a']).toBe('branch-x');
    });
  });
});
