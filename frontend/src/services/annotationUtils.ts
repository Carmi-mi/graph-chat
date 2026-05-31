import type { Annotation } from '../schemas';

export function sortByOffset(annotations: Annotation[]): Annotation[] {
  return [...annotations].sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);
}

export function overlaps(a: Annotation, b: Annotation): boolean {
  return a.startOffset < b.endOffset && b.startOffset < a.endOffset;
}

export function mergeOverlapping(annotations: Annotation[]): Annotation[] {
  if (annotations.length === 0) return [];

  const sorted = sortByOffset(annotations);
  const merged: Annotation[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (overlaps(last, current)) {
      const mergedEnd = Math.max(last.endOffset, current.endOffset);
      const existingTexts = new Set(last.suggestions.map((s) => s.text));
      const newSuggestions = current.suggestions.filter((s) => !existingTexts.has(s.text));

      merged[merged.length - 1] = {
        ...last,
        endOffset: mergedEnd,
        suggestions: [...last.suggestions, ...newSuggestions],
      };
    } else {
      merged.push(current);
    }
  }

  return merged;
}
