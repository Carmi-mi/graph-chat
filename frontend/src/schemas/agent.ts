export interface ForkSuggestion {
  text: string;
  description: string;
}

export interface SuggestResponse {
  suggestions: ForkSuggestion[];
  count: number;
}

export interface AutoExploreRequest {
  branchId: string;
  maxDepth: number;
  parallel: number;
}

export interface AutoExploreResponse {
  taskId: string;
}

export interface BranchStatus {
  conversationId: string;
  name: string;
  status: 'exploring' | 'done' | 'active';
  progress: number;
  maxDepth: number;
}

export interface ExploreStatusResponse {
  branches: BranchStatus[];
}

export interface MergeRequest {
  targetId: string;
  sourceIds: string[];
  keepOption: 'keep' | 'archive' | 'delete';
}

export interface MergeResponse {
  assistantMessage: import('./message').Message;
}
