import type { Annotation } from '../schemas';

// Unicode Private Use Area characters as annotation markers — invisible and collision-free
export const ANN_START = '';
export const ANN_SEP = '';
export const ANN_END = '';

/**
 * Wrap annotated text ranges with invisible markers before ReactMarkdown parsing.
 * Cross-block annotations (spanning \n\n) are split into per-block chunks so each
 * markdown block gets a complete marker pair that highlightAnnotations can match.
 *
 * Process in forward offset order, tracking cumulative offset shift so each
 * annotation's positions are correct in the already-modified string.
 */
export function injectAnnotationMarkers(content: string, annotations: Annotation[]): string {
  const sorted = [...annotations]
    .filter(a => a.startOffset != null && a.endOffset != null && a.startOffset >= 0 && a.endOffset <= content.length)
    .sort((a, b) => a.startOffset - b.startOffset);

  let result = content;
  let offsetShift = 0;

  for (const ann of sorted) {
    const adjStart = ann.startOffset + offsetShift;
    const adjEnd = ann.endOffset + offsetShift;
    const text = result.slice(adjStart, adjEnd);

    let marker: string;
    if (!text.includes('\n\n')) {
      marker = ANN_START + ann.id + ANN_SEP + text + ANN_END;
    } else {
      // Cross-block annotation — split at paragraph breaks, wrap each chunk
      const chunks = text.split('\n\n');
      const parts: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        parts.push(ANN_START + ann.id + ANN_SEP + chunks[i] + ANN_END);
      }
      marker = parts.join('\n\n');
    }

    result = result.slice(0, adjStart) + marker + result.slice(adjEnd);
    offsetShift += marker.length - text.length;
  }
  return result;
}

/**
 * Strip orphaned PUA markers from a string.
 * Handles cases where annotation markers span markdown block boundaries.
 */
export function stripOrphanedMarkers(text: string): string {
  let result = text;
  // Strip orphaned start markers (start without end): remove ANN_START + UUID + ANN_SEP, keep display text
  while (result.includes(ANN_START)) {
    const startIdx = result.indexOf(ANN_START);
    const afterStart = result.slice(startIdx + 1);
    const endIdx = afterStart.indexOf(ANN_END);
    if (endIdx === -1) {
      // Orphaned start — strip marker prefix, keep display text
      const sepIdx = afterStart.indexOf(ANN_SEP);
      const displayText = sepIdx !== -1 ? afterStart.slice(sepIdx + 1) : afterStart;
      result = result.slice(0, startIdx) + displayText;
    } else {
      // Complete marker — leave as-is (will be handled by highlightAnnotations)
      break;
    }
  }
  // Strip orphaned end markers
  result = result.replaceAll(ANN_END, '');
  return result;
}

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
