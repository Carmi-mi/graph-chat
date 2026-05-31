import client from './client';
import type { Annotation, CreateAnnotationRequest } from '../schemas/annotation';

export async function getMessageAnnotations(messageId: string): Promise<Annotation[]> {
  return client.get(`/api/annotations/${messageId}`);
}

export async function createAnnotation(request: CreateAnnotationRequest): Promise<Annotation> {
  return client.post('/api/annotations/', request);
}

export async function deleteAnnotation(id: string): Promise<{ success: boolean }> {
  return client.delete(`/api/annotations/${id}`);
}
