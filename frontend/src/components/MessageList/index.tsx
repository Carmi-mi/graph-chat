import React, { useRef, useEffect } from 'react';
import type { Message, Annotation } from '../../schemas';
import MessageBubble from '../MessageBubble';

interface MessageListProps {
  messages: Message[];
  annotationEnabled: boolean;
  onAnnotationClick?: (annotation: Annotation, x: number, y: number) => void;
  onTextSelect?: (messageId: string, selectedText: string, startOffset: number, endOffset: number) => void;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  annotationEnabled,
  onAnnotationClick,
  onTextSelect,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const container = scrollRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-6 space-y-1 scroll-smooth scroll-chat"
    >
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <p className="text-lg font-medium">Start a conversation</p>
          <p className="text-sm mt-1">Send a message to begin exploring ideas</p>
        </div>
      )}
      {messages.filter(Boolean).map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          annotationEnabled={annotationEnabled}
          onAnnotationClick={onAnnotationClick}
          onTextSelect={onTextSelect}
        />
      ))}
    </div>
  );
};

export default MessageList;
