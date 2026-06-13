import React, { useState, useCallback, useRef } from 'react';
import { Send, Sparkles } from 'lucide-react';

interface InputAreaProps {
  onSend: (content: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  annotationEnabled?: boolean;
  onToggleAnnotation?: () => void;
}

const InputArea: React.FC<InputAreaProps> = ({
  onSend,
  isLoading = false,
  disabled = false,
  annotationEnabled = false,
  onToggleAnnotation,
}) => {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isLoading, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, []);

  return (
    <div className="px-4 py-3 border-t border-gray-200/50 bg-white/50 backdrop-blur-sm">
      <div className="max-w-3xl mx-auto rounded-xl border border-gray-200 bg-white overflow-hidden">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={disabled || isLoading}
          rows={1}
          className="w-full resize-none px-4 pt-3 pb-1 text-base text-gray-800 placeholder-gray-400 focus:outline-none scroll-chat"
        />
        <div className="flex items-center justify-between px-2 py-1.5">
          <button
            onClick={onToggleAnnotation}
            className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium transition-all ${
              annotationEnabled
                ? 'bg-[#667eea]/10 text-[#667eea]'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Annotations</span>
          </button>
          <button
            onClick={handleSend}
            disabled={!value.trim() || isLoading || disabled}
            className="w-8 h-8 rounded-lg bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InputArea;
