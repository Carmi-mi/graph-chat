import React, { useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import type { Message, Annotation } from '../../schemas';

// Unicode Private Use Area characters as annotation markers — invisible and collision-free
const ANN_START = '';
const ANN_SEP = '';
const ANN_END = '';

/**
 * Wrap annotated text ranges with invisible markers before ReactMarkdown parsing.
 * Process in reverse offset order so replacements don't shift later positions.
 */
function injectAnnotationMarkers(content: string, annotations: Annotation[]): string {
  const sorted = [...annotations]
    .filter(a => a.startOffset != null && a.endOffset != null && a.startOffset >= 0 && a.endOffset <= content.length)
    .sort((a, b) => b.startOffset - a.startOffset);

  let result = content;
  for (const ann of sorted) {
    result =
      result.slice(0, ann.startOffset) +
      ANN_START + ann.id + ANN_SEP +
      result.slice(ann.startOffset, ann.endOffset) +
      ANN_END +
      result.slice(ann.endOffset);
  }
  return result;
}

/** Walk React children tree and wrap marker-delimited segments with highlight spans */
function highlightAnnotations(
  children: React.ReactNode,
  annotations: Annotation[],
  onAnnotationClick?: (annotation: Annotation, x: number, y: number) => void,
): React.ReactNode {
  const annMap = new Map(annotations.map(a => [a.id, a]));
  const walk = (node: React.ReactNode): React.ReactNode => {
    return React.Children.map(node, (child) => {
      if (typeof child === 'string') {
        if (!child.includes(ANN_START)) return child;
        const parts: React.ReactNode[] = [];
        let remaining = child;
        let key = 0;
        while (remaining.length > 0) {
          const startIdx = remaining.indexOf(ANN_START);
          if (startIdx === -1) {
            if (remaining) parts.push(remaining);
            break;
          }
          if (startIdx > 0) parts.push(remaining.slice(0, startIdx));
          const afterStart = remaining.slice(startIdx + 1);
          const endIdx = afterStart.indexOf(ANN_END);
          if (endIdx === -1) {
            parts.push(remaining.slice(startIdx));
            break;
          }
          const markerContent = afterStart.slice(0, endIdx);
          const sepIdx = markerContent.indexOf(ANN_SEP);
          const annId = sepIdx !== -1 ? markerContent.slice(0, sepIdx) : '';
          const displayText = sepIdx !== -1 ? markerContent.slice(sepIdx + 1) : markerContent;
          const annotation = annMap.get(annId);
          parts.push(
            <span
              key={key++}
              className="bg-[#667eea]/15 border-b-2 border-[#667eea] rounded-sm cursor-pointer hover:bg-[#667eea]/25 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                if (annotation && onAnnotationClick) onAnnotationClick(annotation, e.clientX, e.clientY);
              }}
            >
              {displayText}
            </span>
          );
          remaining = afterStart.slice(endIdx + 1);
        }
        return parts.length === 1 ? parts[0] : parts;
      }
      if (React.isValidElement(child) && child.props.children) {
        return React.cloneElement(child as React.ReactElement<{ children?: React.ReactNode }>, {
          children: walk(child.props.children),
        });
      }
      return child;
    });
  };
  return walk(children);
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

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // Pre-process content: inject highlight markers around annotated text ranges
  const annotatedContent = useMemo(() => {
    if (!annotationEnabled || !message.annotations.length) return message.content;
    return injectAnnotationMarkers(message.content, message.annotations);
  }, [message.content, message.annotations, annotationEnabled]);

  // Components map with inline annotation highlighting for assistant messages
  const componentsWithAnnotations: Components = useMemo(() => ({
    ...markdownComponents,
    p: ({ children }) => <p className="my-1">{highlightAnnotations(children, message.annotations, onAnnotationClick)}</p>,
    li: ({ children }) => <li className="my-0">{highlightAnnotations(children, message.annotations, onAnnotationClick)}</li>,
    h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-2">{highlightAnnotations(children, message.annotations, onAnnotationClick)}</h1>,
    h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2">{highlightAnnotations(children, message.annotations, onAnnotationClick)}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{highlightAnnotations(children, message.annotations, onAnnotationClick)}</h3>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-[#667eea] bg-gray-50 py-1 px-3 rounded-r-lg my-2">
        {highlightAnnotations(children, message.annotations, onAnnotationClick)}
      </blockquote>
    ),
    td: ({ children }) => <td className="border border-gray-200 px-2 py-1">{highlightAnnotations(children, message.annotations, onAnnotationClick)}</td>,
    th: ({ children }) => <th className="border border-gray-200 px-2 py-1 bg-gray-50 font-medium">{highlightAnnotations(children, message.annotations, onAnnotationClick)}</th>,
  }), [message.annotations, onAnnotationClick]);

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
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={annotationEnabled && message.annotations.length > 0 ? componentsWithAnnotations : markdownComponents}
          >
            {annotatedContent}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
