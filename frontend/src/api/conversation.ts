import client from './client';
import type { Conversation, ConversationWithTree, ConversationListResponse } from '../schemas/conversation';

export async function listConversations(): Promise<ConversationListResponse> {
  return client.get('/api/conversations');
}

export async function getConversation(id: string): Promise<ConversationWithTree> {
  return client.get(`/api/conversations/${id}`);
}

export async function createConversation(name: string): Promise<Conversation> {
  return client.post('/api/conversations', { name });
}

export async function updateConversation(
  id: string,
  data: Partial<Pick<Conversation, 'name' | 'status'>>,
): Promise<Conversation> {
  return client.put(`/api/conversations/${id}`, data);
}

export async function deleteConversation(id: string): Promise<{ success: boolean }> {
  return client.delete(`/api/conversations/${id}`);
}
