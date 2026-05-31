import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Conversation, ConversationWithTree, Message } from '../schemas';

interface ConversationState {
  // State
  conversations: Conversation[];
  currentConversation: ConversationWithTree | null;
  currentBranchId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setConversations: (conversations: Conversation[]) => void;
  setCurrentConversation: (conversation: ConversationWithTree | null) => void;
  setCurrentBranchId: (id: string | null) => void;
  updateBranchMessages: (branchId: string, messages: Message[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

const useConversationStore = create<ConversationState>()(
  persist(
    (set) => ({
      // Initial state
      conversations: [],
      currentConversation: null,
      currentBranchId: null,
      isLoading: false,
      error: null,

      // Actions
      setConversations: (conversations) => set({ conversations }),

      setCurrentConversation: (conversation) =>
        set({
          currentConversation: conversation,
          currentBranchId: conversation?.id ?? null,
        }),

      setCurrentBranchId: (id) => set({ currentBranchId: id }),

      updateBranchMessages: (branchId, messages) =>
        set((state) => {
          if (!state.currentConversation) return state;

          const updateNode = (node: ConversationWithTree): ConversationWithTree => {
            if (node.id === branchId) {
              return { ...node, messages };
            }
            return { ...node, children: node.children.map(updateNode) };
          };

          return { currentConversation: updateNode(state.currentConversation) };
        }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'graphchat-conversation-store',
      partialize: (state) => ({
        conversations: state.conversations,
        currentConversation: state.currentConversation,
        currentBranchId: state.currentBranchId,
      }),
    },
  ),
);

export default useConversationStore;
