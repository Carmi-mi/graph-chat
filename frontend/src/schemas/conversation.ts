import type { Message } from './message';

export interface Conversation {
  id: string;
  name: string;
  parentId: string | null;
  status: 'active' | 'exploring' | 'done' | 'archived';
  forkFrom: string | null;
  forkText: string | null;
  autoExploring: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithTree extends Conversation {
  messages: Message[];
  children: ConversationWithTree[];
}

export interface ConversationListResponse {
  items: Conversation[];
  total: number;
}
