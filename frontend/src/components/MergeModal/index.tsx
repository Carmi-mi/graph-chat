import React, { useState, useCallback, useMemo } from 'react';
import { X, GitMerge } from 'lucide-react';
import type { ConversationWithTree } from '../../schemas';
import type { MergeRequest } from '../../schemas/agent';
import { findNode, flattenSubtree } from '../../services/treeUtils';

interface MergeModalProps {
  tree: ConversationWithTree;
  currentBranchId: string;
  onMerge: (request: MergeRequest) => void;
  onClose: () => void;
}

const MergeModal: React.FC<MergeModalProps> = ({ tree, currentBranchId, onMerge, onClose }) => {
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [keepOption, setKeepOption] = useState<MergeRequest['keepOption']>('keep');

  const currentBranch = useMemo(() => findNode(tree, currentBranchId), [tree, currentBranchId]);
  const descendants = useMemo(
    () => (currentBranch ? currentBranch.children.flatMap((c) => flattenSubtree(c)) : []),
    [currentBranch],
  );

  const toggleSource = useCallback((id: string) => {
    setSourceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }, []);

  const handleSubmit = useCallback(() => {
    if (sourceIds.length === 0) return;
    onMerge({
      targetId: currentBranchId,
      sourceIds,
      keepOption,
    });
  }, [currentBranchId, sourceIds, keepOption, onMerge]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-[#667eea]" />
            <h2 className="text-lg font-semibold text-gray-800">Merge Branches</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Source selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select branches to merge
            </label>
            <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2">
              {descendants.map(({ node, depth }) => (
                <label
                  key={node.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                  style={{ paddingLeft: `${depth * 16 + 8}px` }}
                >
                  <input
                    type="checkbox"
                    checked={sourceIds.includes(node.id)}
                    onChange={() => toggleSource(node.id)}
                    className="text-[#667eea] focus:ring-[#667eea] rounded"
                  />
                  <span className="text-sm text-gray-700 truncate">{node.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Keep option */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              After merge
            </label>
            <select
              value={keepOption}
              onChange={(e) => setKeepOption(e.target.value as MergeRequest['keepOption'])}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#667eea]/30 focus:border-[#667eea]"
            >
              <option value="keep">Keep source branches</option>
              <option value="delete">Delete source branches</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={sourceIds.length === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Merge {sourceIds.length > 0 ? `(${sourceIds.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MergeModal;
