import React, { useRef, useLayoutEffect } from 'react';
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

  // Scroll to bottom instantly when messages change
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto scroll-chat"
    >
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p className="text-lg font-medium">Start a conversation</p>
            <p className="text-sm mt-1">Send a message to begin exploring ideas</p>
          </div>
        )}
        {messages.filter((m) => m && m.nodeType !== 'fork_root').map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            annotationEnabled={annotationEnabled}
            onAnnotationClick={onAnnotationClick}
            onTextSelect={onTextSelect}
          />
        ))}
      </div>
    </div>
  );
};

export default MessageList;
