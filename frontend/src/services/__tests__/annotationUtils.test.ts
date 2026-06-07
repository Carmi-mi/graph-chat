import { describe, it, expect } from 'vitest';
import {
  ANN_START,
  ANN_SEP,
  ANN_END,
  injectAnnotationMarkers,
  stripOrphanedMarkers,
} from '../annotationUtils';
import type { Annotation } from '../../schemas';

function makeAnnotation(id: string, text: string, startOffset: number, endOffset: number): Annotation {
  return {
    id,
    messageId: 'msg-1',
    text,
    startOffset,
    endOffset,
    suggestions: [{ text: 'suggestion', description: 'desc' }],
    createdAt: '2026-01-01T00:00:00Z',
  };
}

describe('injectAnnotationMarkers', () => {
  it('wraps annotated text with markers', () => {
    const content = 'Hello world, this is a test.';
    const ann = makeAnnotation('uuid-1', 'world', 6, 11);
    const result = injectAnnotationMarkers(content, [ann]);

    expect(result).toBe(
      'Hello ' + ANN_START + 'uuid-1' + ANN_SEP + 'world' + ANN_END + ', this is a test.'
    );
  });

  it('handles multiple annotations in reverse offset order', () => {
    const content = 'AAA BBB CCC';
    const ann1 = makeAnnotation('id-1', 'AAA', 0, 3);
    const ann2 = makeAnnotation('id-2', 'CCC', 8, 11);
    const result = injectAnnotationMarkers(content, [ann1, ann2]);

    expect(result).toBe(
      ANN_START + 'id-1' + ANN_SEP + 'AAA' + ANN_END +
      ' BBB ' +
      ANN_START + 'id-2' + ANN_SEP + 'CCC' + ANN_END
    );
  });

  it('filters out invalid annotations', () => {
    const content = 'Hello';
    const invalid = makeAnnotation('bad', 'xyz', -1, 3);
    const result = injectAnnotationMarkers(content, [invalid]);
    expect(result).toBe('Hello');
  });

  it('returns original content when no annotations', () => {
    expect(injectAnnotationMarkers('test', [])).toBe('test');
  });

  it('splits cross-block annotation into per-block marker pairs', () => {
    const content = 'First paragraph.\n\nSecond paragraph.';
    const ann = makeAnnotation('uuid-x', content, 0, content.length);
    const result = injectAnnotationMarkers(content, [ann]);

    // Each paragraph block should get its own complete marker pair
    const expected =
      ANN_START + 'uuid-x' + ANN_SEP + 'First paragraph.' + ANN_END +
      '\n\n' +
      ANN_START + 'uuid-x' + ANN_SEP + 'Second paragraph.' + ANN_END;

    expect(result).toBe(expected);
  });

  it('handles annotation spanning three blocks', () => {
    const content = 'AAA\n\nBBB\n\nCCC';
    const ann = makeAnnotation('uuid-3', content, 0, content.length);
    const result = injectAnnotationMarkers(content, [ann]);

    const expected =
      ANN_START + 'uuid-3' + ANN_SEP + 'AAA' + ANN_END +
      '\n\n' +
      ANN_START + 'uuid-3' + ANN_SEP + 'BBB' + ANN_END +
      '\n\n' +
      ANN_START + 'uuid-3' + ANN_SEP + 'CCC' + ANN_END;

    expect(result).toBe(expected);
  });

  it('handles mix of single-block and cross-block annotations', () => {
    const content = 'AAA\n\nBBB CCC';
    const ann1 = makeAnnotation('id-1', 'CCC', 9, 12);      // single-block (space at 8)
    const ann2 = makeAnnotation('id-2', 'AAA\n\nBBB', 0, 8); // cross-block
    const result = injectAnnotationMarkers(content, [ann1, ann2]);

    // ann2 split into two marker pairs, ann1 wrapped normally
    expect(result).toContain(ANN_START + 'id-2' + ANN_SEP + 'AAA' + ANN_END);
    expect(result).toContain(ANN_START + 'id-2' + ANN_SEP + 'BBB' + ANN_END);
    expect(result).toContain(ANN_START + 'id-1' + ANN_SEP + 'CCC' + ANN_END);
  });
});

describe('stripOrphanedMarkers', () => {
  it('strips orphaned start marker and UUID, keeps display text', () => {
    // Simulates: ANN_START + uuid + ANN_SEP + "some text" (no ANN_END)
    const input = 'before ' + ANN_START + 'uuid-123' + ANN_SEP + 'highlighted text';
    const result = stripOrphanedMarkers(input);
    expect(result).toBe('before highlighted text');
    expect(result).not.toContain(ANN_START);
    expect(result).not.toContain(ANN_SEP);
    expect(result).not.toContain('uuid-123');
  });

  it('strips orphaned end marker', () => {
    const input = 'some text' + ANN_END + ' more text';
    const result = stripOrphanedMarkers(input);
    expect(result).toBe('some text more text');
    expect(result).not.toContain(ANN_END);
  });

  it('strips all ANN_END markers (only called on text without ANN_START)', () => {
    const input = 'aaa' + ANN_END + 'bbb' + ANN_END + 'ccc';
    const result = stripOrphanedMarkers(input);
    expect(result).toBe('aaabbbccc');
  });

  it('handles mixed orphaned and complete markers', () => {
    // First block: orphaned start (end is in another block)
    const block1 = 'prefix ' + ANN_START + 'uuid-1' + ANN_SEP + 'partial text';
    // Second block: orphaned end (start was in previous block) + normal text
    const block2 = 'rest of text' + ANN_END + ' trailing';

    const result1 = stripOrphanedMarkers(block1);
    const result2 = stripOrphanedMarkers(block2);

    expect(result1).toBe('prefix partial text');
    expect(result1).not.toContain('uuid-1');
    expect(result2).toBe('rest of text trailing');
    expect(result2).not.toContain(ANN_END);
  });

  it('handles orphaned start without separator', () => {
    const input = 'text ' + ANN_START + 'orphan content without sep';
    const result = stripOrphanedMarkers(input);
    expect(result).toBe('text orphan content without sep');
    expect(result).not.toContain(ANN_START);
  });

  it('returns clean text unchanged', () => {
    expect(stripOrphanedMarkers('just normal text')).toBe('just normal text');
  });
});
