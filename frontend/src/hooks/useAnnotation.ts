import { useState, useCallback } from 'react';
import type { Annotation, CreateAnnotationRequest } from '../schemas';
import * as annotationApi from '../api/annotation';

export function useAnnotation() {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAnnotations = useCallback(async (messageId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await annotationApi.getMessageAnnotations(messageId);
      setAnnotations(result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load annotations';
      setError(msg);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createAnnotation = useCallback(async (request: CreateAnnotationRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const created = await annotationApi.createAnnotation(request);
      setAnnotations((prev) => [...prev, created]);
      return created;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create annotation';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteAnnotation = useCallback(async (annotationId: string) => {
    setError(null);
    try {
      await annotationApi.deleteAnnotation(annotationId);
      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete annotation';
      setError(msg);
      throw err;
    }
  }, []);

  return {
    annotations,
    isLoading,
    error,
    getAnnotations,
    createAnnotation,
    deleteAnnotation,
  };
}
