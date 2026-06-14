import { useState, useEffect, useCallback, useRef } from 'react';
import { GitMerge, PanelLeftClose, PanelLeft, PanelRightClose, PanelRight } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import TreeSidebar from './components/TreeSidebar';
import MergeModal from './components/MergeModal';
import ConfirmDialog from './components/ConfirmDialog';
import ErrorToast from './components/ErrorToast';
import { useConversationStore, useUIStore } from './store';
import { findNode, removeNode } from './services/treeUtils';
import { handleMessageDelivered } from './services/messageUtils';
import * as conversationApi from './api/conversation';
import * as agentApi from './api/agent';
import type { MergeRequest } from './schemas/agent';
import './App.css';

function App() {
  const {
    conversations,
    currentConversation,
    currentBranchId,
    waitingBranchId,
    setConversations,
    setCurrentConversation,
    setCurrentBranchId,
    setWaitingBranchId,
    setLoading,
    setError,
  } = useConversationStore();

  const { sidebarOpen, toggleSidebar, treeSidebarOpen, toggleTreeSidebar, settingsOpen, toggleSettings, setSettingsOpen, dirtyBranches, removeDirtyBranch, clearDirtyBranches } = useUIStore();

  const [showMergeModal, setShowMergeModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteBranchTargetId, setDeleteBranchTargetId] = useState<string | null>(null);
  const prevConvRef = useRef<{ id: string; branchId: string | null } | null>(null);

  // Load conversation list on mount
  useEffect(() => {
    const loadConversations = async () => {
      setLoading(true);
      try {
        const response = await conversationApi.listConversations();
        setConversations(response.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversations');
      } finally {
        setLoading(false);
      }
    };
    loadConversations();
  }, [setConversations, setLoading, setError]);

  // Select a conversation: use cache if available, otherwise fetch
  const handleSelectConversation = useCallback(
    async (id: string) => {
      // Close settings if open (restores tree sidebar via setSettingsOpen)
      if (useUIStore.getState().settingsOpen) {
        setSettingsOpen(false);
        prevConvRef.current = null; // Don't restore old conversation
      }

      const cached = useConversationStore.getState().conversationCache[id];

      if (cached) {
        setCurrentConversation(cached);
        const currentBranch = useConversationStore.getState().currentBranchId;
        if (currentBranch) {
          removeDirtyBranch(id, currentBranch);
        }
        return;
      }

      setLoading(true);
      try {
        const conv = await conversationApi.getConversation(id);
        setCurrentConversation(conv);
        const currentBranch = useConversationStore.getState().currentBranchId;
        if (currentBranch) {
          removeDirtyBranch(id, currentBranch);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
      } finally {
        setLoading(false);
      }
    },
    [setCurrentConversation, setLoading, setError, removeDirtyBranch, setSettingsOpen],
  );

  // Create a new conversation with a default name, then select it
  const handleCreateConversation = useCallback(async () => {
    try {
      const created = await conversationApi.createConversation('New Conversation');
      const response = await conversationApi.listConversations();
      setConversations(response.items);
      await handleSelectConversation(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create conversation');
    }
  }, [setConversations, setError, handleSelectConversation]);

  // Branch navigation
  const handleSelectBranch = useCallback(
    async (id: string) => {
      if (!currentConversation) return;
      const isDirty = (dirtyBranches[currentConversation.id] ?? []).includes(id);
      if (isDirty) {
        // Dirty branch — try cache first, fetch only if cache is missing
        const cached = useConversationStore.getState().conversationCache[currentConversation.id];
        if (cached) {
          setCurrentConversation(cached);
        } else {
          setLoading(true);
          try {
            const conv = await conversationApi.getConversation(currentConversation.id);
            setCurrentConversation(conv);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to refresh conversation');
          } finally {
            setLoading(false);
          }
        }
      }
      setCurrentBranchId(id);
      removeDirtyBranch(currentConversation.id, id);
    },
    [currentConversation, dirtyBranches, setCurrentBranchId, setCurrentConversation, removeDirtyBranch, setLoading, setError],
  );

  // ChatWindow onNavigate callback (breadcrumb clicks)
  const handleNavigate = useCallback(
    (id: string) => {
      setCurrentBranchId(id);
      if (currentConversation) {
        removeDirtyBranch(currentConversation.id, id);
      }
    },
    [setCurrentBranchId, currentConversation, removeDirtyBranch],
  );

  // Merge handler
  const handleMerge = useCallback(
    async (request: MergeRequest) => {
      if (!currentConversation) return;
      setShowMergeModal(false);
      setWaitingBranchId(request.targetId);
      try {
        const response = await agentApi.mergeConclusions(request);
        setWaitingBranchId(null);
        const newMsgs = [response.assistantMessage];
        handleMessageDelivered(currentConversation.id, request.targetId, newMsgs);
      } catch (err) {
        setWaitingBranchId(null);
        setError(err instanceof Error ? err.message : 'Failed to merge branches');
      }
    },
    [currentConversation, setWaitingBranchId, setError],
  );

  // Delete conversation handler
  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await conversationApi.deleteConversation(id);
        setConversations(conversations.filter((c) => c.id !== id));
        clearDirtyBranches(id);
        if (currentConversation?.id === id) {
          setCurrentConversation(null);
          setCurrentBranchId(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete conversation');
      }
    },
    [conversations, currentConversation, setConversations, setCurrentConversation, setCurrentBranchId, clearDirtyBranches, setError],
  );

  // Delete branch handler
  const handleDeleteBranch = useCallback(
    async (id: string) => {
      if (!currentConversation) return;
      try {
        await conversationApi.deleteConversation(id);
        // Deleting root branch = delete entire conversation
        if (id === currentConversation.id) {
          const remaining = conversations.filter((c) => c.id !== id);
          setConversations(remaining);
          clearDirtyBranches(id);
          if (remaining.length > 0) {
            await handleSelectConversation(remaining[0].id);
          } else {
            setCurrentConversation(null);
            setCurrentBranchId(null);
          }
          return;
        }
        // Deleting a sub-branch: update local tree
        const updated = removeNode(currentConversation, id);
        if (updated) {
          setCurrentConversation(updated);
        }
        removeDirtyBranch(currentConversation.id, id);
        if (currentBranchId === id) {
          setCurrentBranchId(currentConversation.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete branch');
      }
    },
    [currentConversation, currentBranchId, conversations, setConversations, setCurrentConversation, setCurrentBranchId, removeDirtyBranch, clearDirtyBranches, handleSelectConversation, setError],
  );

  const hasChildren = currentConversation != null && currentConversation.children.length > 0;
  const currentBranch = currentConversation && currentBranchId
    ? findNode(currentConversation, currentBranchId)
    : null;
  const canMerge = currentBranch != null && currentBranch.children.length > 0;

  return (
    <div className="flex h-screen w-full bg-white overflow-hidden">
      <ErrorToast />
      {/* Left sidebar: conversation list (collapsible) */}
      {sidebarOpen && (
        <Sidebar
          conversations={conversations}
          currentId={currentConversation?.id ?? null}
          dirtyBranches={dirtyBranches}
          onSelect={handleSelectConversation}
          onCreate={handleCreateConversation}
          onDelete={(id) => setDeleteTargetId(id)}
          onSettingsClick={() => {
            if (!settingsOpen) {
              // Opening: save current conversation
              const state = useConversationStore.getState();
              prevConvRef.current = state.currentConversation
                ? { id: state.currentConversation.id, branchId: state.currentBranchId }
                : null;
              setCurrentConversation(null);
              setCurrentBranchId(null);
              toggleSettings();
            } else {
              // Closing: restore previous conversation
              toggleSettings();
              const prev = prevConvRef.current;
              prevConvRef.current = null;
              if (prev) {
                handleSelectConversation(prev.id).then(() => {
                  if (prev.branchId) {
                    setCurrentBranchId(prev.branchId);
                  }
                });
              }
            }
          }}
          settingsOpen={settingsOpen}
        />
      )}

      {/* Center: main chat area */}
      <div className="flex-1 h-full flex flex-col min-w-0 relative">
        <button
          type="button"
          onClick={toggleSidebar}
          className="absolute top-[10px] left-3 z-40 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-5 h-5" />
          ) : (
            <PanelLeft className="w-5 h-5" />
          )}
        </button>

        {/* Right sidebar toggle button */}
        {hasChildren && !settingsOpen && (
          <button
            type="button"
            onClick={toggleTreeSidebar}
            className="absolute top-[10px] right-3 z-40 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            title={treeSidebarOpen ? 'Close tree sidebar' : 'Open tree sidebar'}
          >
            {treeSidebarOpen ? (
              <PanelRightClose className="w-5 h-5" />
            ) : (
              <PanelRight className="w-5 h-5" />
            )}
          </button>
        )}

        <ChatWindow
          conversationId={currentConversation?.id ?? null}
          onNavigate={handleNavigate}
        />
      </div>

      {/* Right sidebar: tree navigation (only when conversation has branches and sidebar is open) */}
      {hasChildren && treeSidebarOpen && !settingsOpen && (
        <TreeSidebar
          tree={currentConversation!}
          currentBranchId={currentBranchId}
          dirtyBranches={dirtyBranches}
          onSelectBranch={handleSelectBranch}
          onDeleteBranch={(id) => setDeleteBranchTargetId(id)}
        />
      )}

      {/* Floating merge button */}
      {canMerge && treeSidebarOpen && !settingsOpen && (
        <button
          onClick={() => setShowMergeModal(true)}
          className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-sm font-medium shadow-lg hover:shadow-xl hover:opacity-90 transition-all"
          title="Merge branches"
        >
          <GitMerge className="w-4 h-4" />
          Merge
        </button>
      )}

      {/* Merge modal */}
      {showMergeModal && currentConversation && currentBranchId && (
        <MergeModal
          tree={currentConversation}
          currentBranchId={currentBranchId}
          onMerge={handleMerge}
          onClose={() => setShowMergeModal(false)}
        />
      )}

      {/* Delete conversation confirmation dialog */}
      {deleteTargetId && (
        <ConfirmDialog
          title="Delete Conversation"
          message="This conversation and all its branches will be permanently deleted. This action cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          danger
          onConfirm={() => {
            handleDeleteConversation(deleteTargetId);
            setDeleteTargetId(null);
          }}
          onClose={() => setDeleteTargetId(null)}
        />
      )}

      {/* Delete branch confirmation dialog */}
      {deleteBranchTargetId && (
        <ConfirmDialog
          title="Delete Branch"
          message="This branch and all its sub-branches will be permanently deleted. This action cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          danger
          onConfirm={() => {
            handleDeleteBranch(deleteBranchTargetId);
            setDeleteBranchTargetId(null);
          }}
          onClose={() => setDeleteBranchTargetId(null)}
        />
      )}
    </div>
  );
}

export default App;
