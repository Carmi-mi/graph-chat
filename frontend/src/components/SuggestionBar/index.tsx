import React from 'react';
import { Lightbulb, X, GitBranch } from 'lucide-react';
import type { ForkSuggestion } from '../../schemas';

interface SuggestionBarProps {
  suggestions: ForkSuggestion[];
  onDismiss: () => void;
  onExplore: (suggestion?: ForkSuggestion) => void;
}

const SuggestionBar: React.FC<SuggestionBarProps> = ({
  suggestions,
  onDismiss,
  onExplore,
}) => {
  if (suggestions.length === 0) return null;

  return (
    <div className="mx-4 mb-2 rounded-xl bg-gradient-to-r from-[#667eea]/5 to-[#764ba2]/5 border border-[#667eea]/20 p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-[#667eea] shrink-0" />
          <span className="text-sm font-medium text-gray-700">
            Agent detected multiple exploration dimensions
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        {suggestions.map((suggestion, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/60 border border-gray-100"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">
                {suggestion.text}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {suggestion.description}
              </p>
            </div>
            <button
              onClick={() => onExplore(suggestion)}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#667eea]/10 text-[#667eea] text-xs font-medium hover:bg-[#667eea]/20 transition-colors"
            >
              <GitBranch className="w-3 h-3" />
              Explore
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SuggestionBar;
