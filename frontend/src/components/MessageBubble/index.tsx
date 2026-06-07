import React, { useCallback, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import type { Message, Annotation } from '../../schemas';

/** Strip markdown syntax from text to get the rendered form */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')   // bold
    .replace(/\*(.*?)\*/g, '$1')         // italic
    .replace(/__(.*?)__/g, '$1')         // bold underscore
    .replace(/_(.*?)_/g, '$1')           // italic underscore
    .replace(/`([^`]*)`/g, '$1')         // inline code
    .replace(/#{1,6}\s/g, '')            // headings
    .replace(/^\s*[-*]\s/gm, '')         // unordered list markers
    .replace(/^\s*\d+\.\s/gm, '')        // ordered list markers
    .replace(/^\s*>\s?/gm, '')           // blockquotes
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // links
}

/** Walk DOM text nodes and apply annotation highlights via native DOM manipulation */
function applyAnnotationHighlights(
  container: HTMLElement,
  _originalContent: string,
  annotations: Annotation[],
  onAnnotationClick: (annotation: Annotation, x: number, y: number) => void,
): void {
  // Remove existing highlights
  container.querySelectorAll('.ann-highlight').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    }
  });
  container.normalize();

  if (!annotations.length) return;

  // Collect all DOM text nodes and build rendered text
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: { node: Text | HTMLSpanElement; renderedStart: number }[] = [];
  let renderedText = '';
  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const text = textNode.textContent || '';
    if (!text) continue;
    textNodes.push({ node: textNode, renderedStart: renderedText.length });
    renderedText += text;
  }
  if (!textNodes.length) return;

  // For each annotation, find its rendered text in the DOM
  // Process in reverse order to avoid offset invalidation
  const sorted = [...annotations]
    .map(ann => {
      const rendered = stripMarkdown(ann.text);
      const idx = renderedText.indexOf(rendered);
      if (idx === -1) return null;
      return { ann, rendered, start: idx, end: idx + rendered.length };
    })
    .filter((x): x is { ann: Annotation; rendered: string; start: number; end: number } => x !== null)
    .sort((a, b) => b.start - a.start); // reverse order

  for (const { ann, start, end } of sorted) {
    // Find which text nodes overlap with this annotation
    for (let i = textNodes.length - 1; i >= 0; i--) {
      const { node, renderedStart } = textNodes[i];
      const nodeText = node.textContent || '';
      const nodeEnd = renderedStart + nodeText.length;

      // Check overlap
      const overlapStart = Math.max(start, renderedStart);
      const overlapEnd = Math.min(end, nodeEnd);
      if (overlapStart >= overlapEnd) continue;

      const parts: (Text | HTMLSpanElement)[] = [];

      // Text before annotation in this node
      if (overlapStart > renderedStart) {
        parts.push(document.createTextNode(nodeText.slice(0, overlapStart - renderedStart)));
      }

      // Annotated text
      const span = document.createElement('span');
      span.className = 'ann-highlight bg-[#667eea]/15 border-b-2 border-[#667eea] rounded-sm cursor-pointer hover:bg-[#667eea]/25 transition-colors';
      span.textContent = nodeText.slice(overlapStart - renderedStart, overlapEnd - renderedStart);
      span.addEventListener('click', (ev) => { ev.stopPropagation(); onAnnotationClick(ann, ev.clientX, ev.clientY); });
      parts.push(span);

      // Text after annotation in this node
      if (overlapEnd < nodeEnd) {
        parts.push(document.createTextNode(nodeText.slice(overlapEnd - renderedStart)));
      }

      // Replace the text node
      const parent = node.parentNode;
      if (parent) {
        parts.forEach(p => parent.insertBefore(p, node));
        parent.removeChild(node);
      }

      // Update the textNodes entry for this position
      textNodes[i] = { node: parts.find((p): p is HTMLSpanElement => p instanceof HTMLSpanElement) || node, renderedStart };
    }
  }
}

interface MessageBubbleProps {
  message: Message;
  annotationEnabled: boolean;
  onAnnotationClick?: (annotation: Annotation, x: number, y: number) => void;
  onTextSelect?: (messageId: string, selectedText: string, startOffset: number, endOffset: number) => void;
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-2">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
  p: ({ children }) => <p className="my-1">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside my-1 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside my-1 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="my-0">{children}</li>,
  code: ({ children, className }) => {
    const isInline = !className;
    return isInline ? (
      <code className="text-[#667eea] bg-gray-100 px-1 py-0.5 rounded text-xs">{children}</code>
    ) : (
      <code className={className}>{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-gray-50 p-2 rounded-lg overflow-x-auto my-2 text-xs">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-[#667eea] bg-gray-50 py-1 px-3 rounded-r-lg my-2">{children}</blockquote>
  ),
  table: ({ children }) => (
    <table className="border-collapse text-xs my-2">{children}</table>
  ),
  th: ({ children }) => (
    <th className="border border-gray-200 px-2 py-1 bg-gray-50 font-medium">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-200 px-2 py-1">{children}</td>
  ),
  a: ({ children, href }) => (
    <a href={href} className="text-[#667eea] underline" target="_blank" rel="noopener noreferrer">{children}</a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
};

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  annotationEnabled,
  onAnnotationClick,
  onTextSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseUp = useCallback(() => {
    if (!onTextSelect || message.role !== 'assistant') return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    const startOffset = message.content.indexOf(selectedText);
    const endOffset = startOffset + selectedText.length;
    if (startOffset >= 0) {
      onTextSelect(message.id, selectedText, startOffset, endOffset);
    }
  }, [message, onTextSelect]);

  // Apply annotation highlights via DOM post-processing
  useEffect(() => {
    if (!annotationEnabled || !message.annotations.length || !containerRef.current || !onAnnotationClick) return;
    applyAnnotationHighlights(containerRef.current, message.content, message.annotations, onAnnotationClick);
  }, [message.content, message.annotations, annotationEnabled, onAnnotationClick]);

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="text-xs text-gray-500 bg-gray-100 px-4 py-2 rounded-lg max-w-[80%]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        ref={containerRef}
        className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? 'bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white rounded-br-md'
            : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm'
        }`}
        onMouseUp={handleMouseUp}
      >
        {isUser ? (
          <span>{message.content}</span>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
