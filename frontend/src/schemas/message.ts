import type { Annotation } from './annotation';

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  nodeType: 'normal' | 'annotation' | 'merge';
  annotations: Annotation[];
  createdAt: string;
}

export interface MessageListResponse {
  items: Message[];
  total: number;
}

export interface SendMessageRequest {
  conversationId: string;
  role: 'user';
  content: string;
}

export interface SendMessageResponse {
  userMessage: Message;
  assistantMessage?: Message;
}

export interface ForkRequest {
  selectedText: string;
  suggestion?: string;
}
