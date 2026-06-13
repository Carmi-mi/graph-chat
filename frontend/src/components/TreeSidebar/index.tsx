import React, { useState, useMemo } from 'react';
import { Trash2, ChevronRight } from 'lucide-react';
import type { ConversationWithTree } from '../../schemas';

interface TreeSidebarProps {
  tree: ConversationWithTree;
  currentBranchId: string | null;
  dirtyBranches: Record<string, string[]>;
  onSelectBranch: (id: string) => void;
  onDeleteBranch: (id: string) => void;
}

interface TreeNodeProps {
  node: ConversationWithTree;
  depth: number;
  isRoot: boolean;
  currentBranchId: string | null;
  dirtySet: Set<string>;
  onSelectBranch: (id: string) => void;
  onDeleteBranch: (id: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  isRoot,
  currentBranchId,
  dirtySet,
  onSelectBranch,
  onDeleteBranch,
}) => {
  const isActive = node.id === currentBranchId;
  const isDirty = dirtySet.has(node.id);
  const [hovered, setHovered] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          onClick={() => onSelectBranch(node.id)}
          className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1.5 ${
            isActive
              ? 'bg-[#667eea]/15 text-[#667eea] font-medium'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          style={{ paddingLeft: `${depth * 8 + 8}px` }}
        >
          {hasChildren ? (
            <span
              onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
              className="shrink-0 w-3 h-3 flex items-center justify-center cursor-pointer"
            >
              <ChevronRight className={`w-3 h-3 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
            </span>
          ) : (
            <span className="shrink-0 w-3 h-3" />
          )}
          {isDirty && !isActive && (
            <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteBranch(node.id);
          }}
          className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer ${hovered ? 'opacity-100' : 'opacity-0'}`}
          title="Delete branch"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {hasChildren && !collapsed && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isRoot={false}
              currentBranchId={currentBranchId}
              dirtySet={dirtySet}
              onSelectBranch={onSelectBranch}
              onDeleteBranch={onDeleteBranch}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const TreeSidebar: React.FC<TreeSidebarProps> = ({
  tree,
  currentBranchId,
  dirtyBranches,
  onSelectBranch,
  onDeleteBranch,
}) => {
  const dirtySet = useMemo(
    () => new Set(dirtyBranches[tree.id] ?? []),
    [dirtyBranches, tree.id],
  );

  return (
    <div className="w-64 h-full flex flex-col bg-gray-50/80 border-l border-gray-200/50 backdrop-blur-sm">
      <div className="min-h-[52px] flex items-center px-3 border-b border-gray-200/50">
        <h3 className="text-sm font-semibold text-gray-700">Conversation Tree</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 scroll-chat">
        <TreeNode
          node={tree}
          depth={0}
          isRoot={true}
          currentBranchId={currentBranchId}
          dirtySet={dirtySet}
          onSelectBranch={onSelectBranch}
          onDeleteBranch={onDeleteBranch}
        />
      </div>
    </div>
  );
};

export default TreeSidebar;
