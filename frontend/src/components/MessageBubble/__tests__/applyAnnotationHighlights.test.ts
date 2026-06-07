import { describe, it, expect, beforeEach } from 'vitest';

// Test the DOM-based highlighting approach
// The key insight: use annotation.text (with markdown stripped) to find text in rendered DOM

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/^\s*[-*]\s/gm, '')
    .replace(/^\s*\d+\.\s/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

describe('stripMarkdown', () => {
  it('strips bold markers', () => {
    expect(stripMarkdown('**bold text**')).toBe('bold text');
  });

  it('strips italic markers', () => {
    expect(stripMarkdown('*italic*')).toBe('italic');
  });

  it('strips heading markers', () => {
    expect(stripMarkdown('### Heading')).toBe('Heading');
  });

  it('strips link syntax', () => {
    expect(stripMarkdown('[link text](http://example.com)')).toBe('link text');
  });

  it('strips inline code', () => {
    expect(stripMarkdown('`code`')).toBe('code');
  });

  it('handles mixed markdown', () => {
    expect(stripMarkdown('**bold** and *italic*')).toBe('bold and italic');
  });
});

describe('DOM annotation highlighting', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('finds annotation text in rendered DOM', () => {
    container.innerHTML = '<p>Hello world, this is a test.</p>';
    const annText = 'world';

    // Collect text nodes
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let renderedText = '';
    while (walker.nextNode()) {
      renderedText += (walker.currentNode as Text).textContent || '';
    }

    const idx = renderedText.indexOf(annText);
    expect(idx).toBe(6);
  });

  it('finds bold text annotation in rendered DOM', () => {
    container.innerHTML = '<p>Hello <strong>world</strong>, test.</p>';
    const annText = '**world**';
    const rendered = stripMarkdown(annText);

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let renderedText = '';
    while (walker.nextNode()) {
      renderedText += (walker.currentNode as Text).textContent || '';
    }

    const idx = renderedText.indexOf(rendered);
    expect(idx).toBe(6); // "Hello " is 6 chars
    expect(renderedText.slice(idx, idx + rendered.length)).toBe('world');
  });

  it('handles cross-block annotations', () => {
    container.innerHTML = '<p>First paragraph.</p><p>Second paragraph.</p>';

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let renderedText = '';
    while (walker.nextNode()) {
      renderedText += (walker.currentNode as Text).textContent || '';
    }

    // "First paragraph.Second paragraph." (no \n\n in rendered text)
    expect(renderedText).toBe('First paragraph.Second paragraph.');

    // Find "First paragraph." and "Second paragraph."
    expect(renderedText.indexOf('First paragraph.')).toBe(0);
    expect(renderedText.indexOf('Second paragraph.')).toBe(16);
  });

  it('applies highlight span to correct text node', () => {
    container.innerHTML = '<p>Hello world, test.</p>';
    const annText = 'world';

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode() as Text;
    const text = textNode.textContent!;
    const idx = text.indexOf(annText);

    // Split the text node and wrap annotation
    const parts: Node[] = [];
    if (idx > 0) parts.push(document.createTextNode(text.slice(0, idx)));
    const span = document.createElement('span');
    span.className = 'ann-highlight';
    span.textContent = text.slice(idx, idx + annText.length);
    parts.push(span);
    if (idx + annText.length < text.length) {
      parts.push(document.createTextNode(text.slice(idx + annText.length)));
    }

    const parent = textNode.parentNode!;
    parts.forEach(p => parent.insertBefore(p, textNode));
    parent.removeChild(textNode);

    const highlights = container.querySelectorAll('.ann-highlight');
    expect(highlights).toHaveLength(1);
    expect(highlights[0].textContent).toBe('world');
    expect(container.textContent).toBe('Hello world, test.');
  });
});
