import { useCallback } from 'react';
import { useConversationStore } from '../store';
import * as conversationApi from '../api/conversation';

export function useConversation() {
  const {
    conversations,
    currentConversation,
    currentBranchId,
    isLoading,
    error,
    setConversations,
    setCurrentConversation,
    setCurrentBranchId,
    setLoading,
    setError,
  } = useConversationStore();

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await conversationApi.listConversations();
      setConversations(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, [setConversations, setLoading, setError]);

  const loadConversation = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const conv = await conversationApi.getConversation(id);
      setCurrentConversation(conv);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  }, [setCurrentConversation, setLoading, setError]);

  const createConversation = useCallback(async (name: string) => {
    try {
      const created = await conversationApi.createConversation(name);
      const response = await conversationApi.listConversations();
      setConversations(response.items);
      await loadConversation(created.id);
      return created;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create conversation');
      throw err;
    }
  }, [setConversations, setError, loadConversation]);

  return {
    conversations,
    currentConversation,
    currentBranchId,
    isLoading,
    error,
    loadConversations,
    loadConversation,
    createConversation,
    setCurrentBranchId,
  };
}
