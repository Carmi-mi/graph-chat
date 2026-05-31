import React, { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
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

  const statusIcon = () => {
    switch (node.status) {
      case 'exploring':
        return <span className="text-yellow-500 text-xs">&#x1f504;</span>;
      case 'done':
        return <span className="text-green-500 text-xs">&#x2713;</span>;
      case 'active':
        return <span className="text-blue-500 text-xs">&#x25cf;</span>;
      default:
        return <span className="text-gray-400 text-xs">&#x25cb;</span>;
    }
  };

  return (
    <div className="group/node">
      <div className="relative">
        <button
          onClick={() => onSelectBranch(node.id)}
          className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1.5 ${
            isActive
              ? 'bg-[#667eea]/15 text-[#667eea] font-medium'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {statusIcon()}
          <span className="truncate">{node.name}</span>
          {isDirty && !isActive && (
            <span className="ml-auto shrink-0 w-2 h-2 rounded-full bg-[#667eea]" />
          )}
        </button>
        {!isRoot && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteBranch(node.id);
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover/node:opacity-100 transition-all cursor-pointer"
            title="Delete branch"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {node.children.length > 0 && (
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
      <div className="p-3 border-b border-gray-200/50">
        <h3 className="text-sm font-semibold text-gray-700">Conversation Tree</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
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
