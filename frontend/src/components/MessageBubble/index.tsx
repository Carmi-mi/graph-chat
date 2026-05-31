import React, { useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import type { Message, Annotation } from '../../schemas';

interface MessageBubbleProps {
  message: Message;
  annotationEnabled: boolean;
  onAnnotationClick?: (annotation: Annotation) => void;
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
            components={markdownComponents}
          >
            {message.content}
          </ReactMarkdown>
        )}

        {/* Annotation buttons below message content */}
        {!isUser && annotationEnabled && message.annotations.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-100 space-y-1">
            {message.annotations.map((annotation) => (
              <button
                key={annotation.id}
                onClick={() => onAnnotationClick?.(annotation)}
                className="w-full text-left text-xs text-[#667eea] hover:bg-[#667eea]/5 px-2 py-1 rounded transition-colors flex items-center gap-1"
              >
                <span className="underline decoration-dotted underline-offset-2">
                  {annotation.text.length > 60 ? annotation.text.slice(0, 60) + '...' : annotation.text}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
