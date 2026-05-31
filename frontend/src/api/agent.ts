import client from './client';
import type {
  SuggestResponse,
  AutoExploreRequest,
  AutoExploreResponse,
  ExploreStatusResponse,
  MergeRequest,
  MergeResponse,
} from '../schemas/agent';

export async function suggestForks(conversationId: string): Promise<SuggestResponse> {
  return client.post(`/api/agent/suggest?conversation_id=${conversationId}`);
}

export async function autoExplore(request: AutoExploreRequest): Promise<AutoExploreResponse> {
  return client.post('/api/agent/auto-explore', request);
}

export async function getExploreStatus(conversationId: string): Promise<ExploreStatusResponse> {
  return client.get(`/api/agent/status/${conversationId}`);
}

export async function mergeConclusions(request: MergeRequest): Promise<MergeResponse> {
  return client.post('/api/agent/merge', request);
}
