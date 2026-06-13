import React, { useCallback, useEffect, useRef, useState } from 'react';
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
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links
    .replace(/\n+/g, ' ')               // newlines → space (HTML rendering collapses them)
    .replace(/\s{2,}/g, ' ')            // collapse multiple spaces
    .trim();
}

/** Rebuild text nodes array and rendered text from current DOM state */
function collectTextNodes(container: HTMLElement): {
  nodes: { node: Text; renderedStart: number }[];
  renderedText: string;
} {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; renderedStart: number }[] = [];
  let renderedText = '';
  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const text = textNode.textContent || '';
    if (!text) continue;
    nodes.push({ node: textNode, renderedStart: renderedText.length });
    renderedText += text;
  }
  return { nodes, renderedText };
}

/** Walk DOM text nodes and apply annotation highlights via native DOM manipulation */
function applyAnnotationHighlights(
  container: HTMLElement,
  _originalContent: string,
  annotations: Annotation[],
  onAnnotationClick: (annotation: Annotation, x: number, y: number) => void,
): { matched: number; total: number } {
  // Remove existing highlights
  container.querySelectorAll('.ann-highlight').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    }
  });
  container.normalize();

  if (!annotations.length) return { matched: 0, total: 0 };

  // Initial text node collection
  let { nodes: textNodes, renderedText } = collectTextNodes(container);
  if (!textNodes.length) return { matched: 0, total: annotations.length };

  const normalizedRendered = renderedText.replace(/\n/g, ' ');

  // For each annotation, find its rendered position
  const matched = [...annotations]
    .map(ann => {
      const rendered = stripMarkdown(ann.text);
      let idx = normalizedRendered.indexOf(rendered);
      if (idx !== -1) {
        return { ann, start: idx, end: idx + rendered.length };
      }
      // Fuzzy match: sliding window, sample every 3rd char
      const sample = rendered.slice(0, 60);
      const step = 3;
      let bestPos = -1;
      let bestScore = 0;
      for (let i = 0; i <= normalizedRendered.length - 10; i++) {
        let score = 0;
        for (let j = 0; j < sample.length && i + j < normalizedRendered.length; j += step) {
          if (normalizedRendered[i + j] === sample[j]) score++;
        }
        if (score > bestScore) {
          bestScore = score;
          bestPos = i;
        }
      }
      const threshold = Math.floor(sample.length / step * 0.7);
      if (bestPos >= 0 && bestScore >= threshold) {
        return { ann, start: bestPos, end: bestPos + rendered.length };
      }
      return null;
    })
    .filter((x): x is { ann: Annotation; start: number; end: number } => x !== null)
    .sort((a, b) => b.start - a.start); // reverse order for DOM insertion

  // Apply highlights, rebuilding textNodes after each one to avoid stale references
  let highlighted = 0;
  for (const { ann, start, end } of matched) {
    // Rebuild text nodes from current DOM state
    const current = collectTextNodes(container);
    textNodes = current.nodes;
    renderedText = current.renderedText;

    let applied = false;
    for (let i = textNodes.length - 1; i >= 0; i--) {
      const { node, renderedStart } = textNodes[i];
      const nodeText = node.textContent || '';
      const nodeEnd = renderedStart + nodeText.length;

      const overlapStart = Math.max(start, renderedStart);
      const overlapEnd = Math.min(end, nodeEnd);
      if (overlapStart >= overlapEnd) continue;

      const parts: (Text | HTMLSpanElement)[] = [];

      if (overlapStart > renderedStart) {
        parts.push(document.createTextNode(nodeText.slice(0, overlapStart - renderedStart)));
      }

      const span = document.createElement('span');
      span.className = 'ann-highlight bg-[#667eea]/15 border-b-2 border-[#667eea] rounded-sm cursor-pointer hover:bg-[#667eea]/25 transition-colors';
      span.textContent = nodeText.slice(overlapStart - renderedStart, overlapEnd - renderedStart);
      span.addEventListener('click', (ev) => { ev.stopPropagation(); onAnnotationClick(ann, ev.clientX, ev.clientY); });
      parts.push(span);

      if (overlapEnd < nodeEnd) {
        parts.push(document.createTextNode(nodeText.slice(overlapEnd - renderedStart)));
      }

      const parent = node.parentNode;
      if (parent) {
        parts.forEach(p => parent.insertBefore(p, node));
        parent.removeChild(node);
      }
      applied = true;
    }
    if (applied) highlighted++;
  }

  return { matched: highlighted, total: annotations.length };
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
  const [matchInfo, setMatchInfo] = useState<{ matched: number; total: number } | null>(null);

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
    if (!annotationEnabled || !message.annotations.length || !containerRef.current || !onAnnotationClick) {
      setMatchInfo(null);
      return;
    }
    const result = applyAnnotationHighlights(containerRef.current, message.content, message.annotations, onAnnotationClick);
    setMatchInfo(result);
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
      <div className="inline-flex flex-col items-start gap-0.5">
        {/* Annotation match indicator */}
        {!isUser && matchInfo && matchInfo.total > 0 && (
          <div className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
            matchInfo.matched === matchInfo.total
              ? 'bg-green-100 text-green-700 border border-green-300'
              : 'bg-red-100 text-red-700 border border-red-300'
          }`}>
            {matchInfo.matched}/{matchInfo.total}
          </div>
        )}
        <div
          ref={containerRef}
          className={`${isUser ? 'max-w-[480px] bg-gray-100 text-gray-800 rounded-2xl rounded-br-md px-4 py-3' : 'max-w-[800px] text-gray-800'} text-base leading-relaxed`}
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
    </div>
  );
};

export default MessageBubble;
