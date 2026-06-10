import React from 'react';
import { X, GitBranch, MessageCircle } from 'lucide-react';
import type { Annotation } from '../../schemas';

interface PopupProps {
  annotation: Annotation;
  onSuggestionClick: (text: string, description: string) => void;
  onSuggestionAsk: (text: string, description: string) => void;
  onClose: () => void;
}

const Popup: React.FC<PopupProps> = ({
  annotation,
  onSuggestionClick,
  onSuggestionAsk,
  onClose,
}) => {
  return (
    <div className="absolute z-50 w-72 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-[#667eea]/5 to-[#764ba2]/5 border-b border-gray-100">
        <h4 className="text-sm font-semibold text-gray-700">
          Recommended deep-dives
        </h4>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Annotated text */}
      <div className="px-3 py-2 border-b border-gray-100">
        <p className="text-xs text-gray-500 italic">
          &ldquo;{annotation.text}&rdquo;
        </p>
      </div>

      {/* Suggestions */}
      <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
        {annotation.suggestions.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">
            No suggestions available
          </p>
        )}
        {annotation.suggestions.map((suggestion, index) => (
          <div
            key={index}
            className="px-3 py-2 rounded-lg hover:bg-[#667eea]/5 transition-colors group"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">
                  {suggestion.text}
                </p>
                {suggestion.description && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {suggestion.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onSuggestionAsk(suggestion.text, suggestion.description)}
                  className="p-1 rounded hover:bg-[#667eea]/10 transition-colors"
                  title="在当前对话追问"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-[#667eea]" />
                </button>
                <button
                  onClick={() => onSuggestionClick(suggestion.text, suggestion.description)}
                  className="p-1 rounded hover:bg-[#667eea]/10 transition-colors"
                  title="分支探索"
                >
                  <GitBranch className="w-3.5 h-3.5 text-[#667eea]" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Popup;
