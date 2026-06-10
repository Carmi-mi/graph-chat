export interface AnnotationSuggestion {
  text: string;
  description: string;
}

export interface Annotation {
  id: string;
  messageId: string;
  text: string;
  startOffset?: number | null;
  endOffset?: number | null;
  suggestions: AnnotationSuggestion[];
  createdAt: string;
}

export interface CreateAnnotationRequest {
  messageId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  suggestions: AnnotationSuggestion[];
}
