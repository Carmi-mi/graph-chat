import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Conversation, ConversationWithTree, Message } from '../schemas';

interface ConversationState {
  // State
  conversations: Conversation[];
  currentConversation: ConversationWithTree | null;
  currentBranchId: string | null;
  conversationBranchMap: Record<string, string>; // conversationId → last branchId
  conversationCache: Record<string, ConversationWithTree>; // conversationId → full tree cache
  isLoading: boolean;
  waitingBranchId: string | null;
  error: string | null;

  // Actions
  setConversations: (conversations: Conversation[]) => void;
  setCurrentConversation: (conversation: ConversationWithTree | null) => void;
  setCurrentBranchId: (id: string | null) => void;
  updateBranchMessages: (branchId: string, messages: Message[]) => void;
  removeConversation: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setWaitingBranchId: (id: string | null) => void;
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
      conversationBranchMap: {},
      conversationCache: {},
      isLoading: false,
      waitingBranchId: null,
      error: null,

      // Actions
      setConversations: (conversations) => set({ conversations }),

      setCurrentConversation: (conversation) =>
        set((state) => {
          const map = { ...state.conversationBranchMap };
          // Save current branch for the current conversation
          if (state.currentConversation && state.currentBranchId) {
            map[state.currentConversation.id] = state.currentBranchId;
          }
          // Update cache
          const cache = { ...state.conversationCache };
          if (conversation) {
            cache[conversation.id] = conversation;
          }
          // Restore saved branch for the new conversation, or default to root
          const newBranchId = conversation
            ? (map[conversation.id] ?? conversation.id)
            : null;
          return {
            currentConversation: conversation,
            currentBranchId: newBranchId,
            conversationBranchMap: map,
            conversationCache: cache,
          };
        }),

      setCurrentBranchId: (id) =>
        set((state) => {
          const map = { ...state.conversationBranchMap };
          if (state.currentConversation && id) {
            map[state.currentConversation.id] = id;
          }
          return { currentBranchId: id, conversationBranchMap: map };
        }),

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

      removeConversation: (id) =>
        set((state) => {
          const filtered = state.conversations.filter((c) => c.id !== id);
          const wasCurrent = state.currentConversation?.id === id;
          const cache = { ...state.conversationCache };
          delete cache[id];
          return {
            conversations: filtered,
            currentConversation: wasCurrent ? null : state.currentConversation,
            currentBranchId: wasCurrent ? null : state.currentBranchId,
            conversationCache: cache,
          };
        }),

      setLoading: (isLoading) => set({ isLoading }),

      setWaitingBranchId: (id) => set({ waitingBranchId: id }),

      setError: (error) => set({ error }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'graphchat-conversation-store',
      partialize: (state) => ({
        conversations: state.conversations,
        currentConversation: state.currentConversation,
        currentBranchId: state.currentBranchId,
        conversationBranchMap: state.conversationBranchMap,
        conversationCache: state.conversationCache,
      }),
    },
  ),
);

export default useConversationStore;
