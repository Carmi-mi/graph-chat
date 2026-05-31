import client from './client';
import type { MessageListResponse, SendMessageRequest, SendMessageResponse, ForkRequest } from '../schemas/message';
import type { Conversation } from '../schemas/conversation';

export async function getMessages(conversationId: string): Promise<MessageListResponse> {
  return client.get(`/api/messages/${conversationId}`);
}

export async function sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
  return client.post('/api/messages/', request);
}

export async function forkMessage(messageId: string, request: ForkRequest): Promise<Conversation> {
  return client.post(`/api/messages/${messageId}/fork`, request);
}
