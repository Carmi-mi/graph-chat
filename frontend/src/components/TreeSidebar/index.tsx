import React, { useMemo } from 'react';
import type { ConversationWithTree } from '../../schemas';

interface TreeSidebarProps {
  tree: ConversationWithTree;
  currentBranchId: string | null;
  dirtyBranches: Record<string, string[]>;
  onSelectBranch: (id: string) => void;
}

interface TreeNodeProps {
  node: ConversationWithTree;
  depth: number;
  currentBranchId: string | null;
  dirtySet: Set<string>;
  onSelectBranch: (id: string) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  currentBranchId,
  dirtySet,
  onSelectBranch,
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
    <div>
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

      {node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              currentBranchId={currentBranchId}
              dirtySet={dirtySet}
              onSelectBranch={onSelectBranch}
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
          currentBranchId={currentBranchId}
          dirtySet={dirtySet}
          onSelectBranch={onSelectBranch}
        />
      </div>
    </div>
  );
};

export default TreeSidebar;
