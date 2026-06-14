import React from 'react';
import { GitBranch, Plus, MessageSquare, Trash2, Settings } from 'lucide-react';
import type { Conversation } from '../../schemas';

interface SidebarProps {
  conversations: Conversation[];
  currentId: string | null;
  dirtyBranches: Record<string, string[]>;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onSettingsClick: () => void;
  settingsOpen: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  currentId,
  dirtyBranches,
  onSelect,
  onCreate,
  onDelete,
  onSettingsClick,
  settingsOpen,
}) => {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="w-64 h-full flex flex-col bg-gray-50 border-r border-gray-200 relative z-10">
      {/* Header */}
      <div className="px-3">
        <div className="flex items-center gap-2 min-h-[52px]">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center">
            <GitBranch className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-semibold text-gray-800">Graph Chat</span>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Conversation
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scroll-chat">
        {conversations.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">
            No conversations yet
          </p>
        )}
        {conversations.map((conv) => {
          const hasDirty = (dirtyBranches[conv.id]?.length ?? 0) > 0;
          const isCurrent = currentId === conv.id;
          return (
          <div key={conv.id} className="group relative">
            <button
              onClick={() => onSelect(conv.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${
                isCurrent
                  ? 'bg-[#667eea]/10 border border-[#667eea]/20'
                  : 'hover:bg-gray-100 border border-transparent'
              }`}
            >
              <div className="flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {conv.name}
                  </p>

                  <div className="flex items-center gap-1.5 mt-1">
                    {hasDirty && !isCurrent && (
                      <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" />
                    )}
                    <span className="text-xs text-gray-400">
                      {formatDate(conv.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.id);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
              title="Delete conversation"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
        })}
      </div>

      {/* Settings button */}
      <div className="p-2 border-t border-gray-200">
        <button
          type="button"
          onClick={onSettingsClick}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all cursor-pointer ${
            settingsOpen
              ? 'bg-[#667eea]/10 text-[#667eea] border border-[#667eea]/20'
              : 'text-gray-500 hover:bg-gray-100 border border-transparent'
          }`}
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
