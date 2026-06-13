import React from 'react';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import type { Conversation } from '../../schemas';

interface SidebarProps {
  conversations: Conversation[];
  currentId: string | null;
  dirtyBranches: Record<string, string[]>;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

const statusColors: Record<Conversation['status'], string> = {
  active: 'bg-green-400',
  exploring: 'bg-yellow-400',
  done: 'bg-blue-400',
  archived: 'bg-gray-400',
};

const statusLabels: Record<Conversation['status'], string> = {
  active: 'Active',
  exploring: 'Exploring',
  done: 'Done',
  archived: 'Archived',
};

const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  currentId,
  dirtyBranches,
  onSelect,
  onCreate,
  onDelete,
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
      <div className="p-3">
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
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
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
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {conv.name}
                    </p>
                    {hasDirty && !isCurrent && (
                      <span className="shrink-0 w-2 h-2 rounded-full bg-[#667eea]" />
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`w-2 h-2 rounded-full ${statusColors[conv.status]}`}
                      title={statusLabels[conv.status]}
                    />
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
    </div>
  );
};

export default Sidebar;
