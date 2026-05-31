import { useState, useEffect, useCallback } from 'react';
import { GitMerge, PanelLeftClose, PanelLeft } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import TreeSidebar from './components/TreeSidebar';
import MergeModal from './components/MergeModal';
import { useConversationStore, useUIStore } from './store';
import * as conversationApi from './api/conversation';
import * as agentApi from './api/agent';
import type { MergeRequest } from './schemas/agent';
import './App.css';

function App() {
  const {
    conversations,
    currentConversation,
    currentBranchId,
    setConversations,
    setCurrentConversation,
    setCurrentBranchId,
    setLoading,
    setError,
  } = useConversationStore();

  const { sidebarOpen, toggleSidebar, dirtyBranches, removeDirtyBranch } = useUIStore();

  const [showMergeModal, setShowMergeModal] = useState(false);

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

  // Select a conversation: load its full tree
  const handleSelectConversation = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        // Remember which branch the user was on before switching
        const prevConvId = useConversationStore.getState().currentConversation?.id;
        const prevBranchId = useConversationStore.getState().currentBranchId;
        const wasOnSameConversation = prevConvId === id;

        const conv = await conversationApi.getConversation(id);
        setCurrentConversation(conv);

        // Restore sub-branch position if returning to the same conversation
        if (wasOnSameConversation && prevBranchId && prevBranchId !== id) {
          setCurrentBranchId(prevBranchId);
        }
        // Don't clear dirty branches here — let the user see them in TreeSidebar
        // Dirty branches are cleared individually in handleSelectBranch
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
      } finally {
        setLoading(false);
      }
    },
    [setCurrentConversation, setCurrentBranchId, setLoading, setError],
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
    (id: string) => {
      setCurrentBranchId(id);
      // Clear dirty dot for this branch
      if (currentConversation) {
        removeDirtyBranch(currentConversation.id, id);
      }
    },
    [setCurrentBranchId, currentConversation, removeDirtyBranch],
  );

  // ChatWindow onNavigate callback (breadcrumb clicks)
  const handleNavigate = useCallback(
    (id: string) => {
      setCurrentBranchId(id);
    },
    [setCurrentBranchId],
  );

  // Merge handler
  const handleMerge = useCallback(
    async (request: MergeRequest) => {
      try {
        await agentApi.mergeConclusions(request);
        setShowMergeModal(false);
        if (currentConversation) {
          const conv = await conversationApi.getConversation(currentConversation.id);
          setCurrentConversation(conv);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to merge branches');
      }
    },
    [currentConversation, setCurrentConversation, setError],
  );

  const hasChildren = currentConversation != null && currentConversation.children.length > 0;

  return (
    <div className="flex h-screen w-full bg-white overflow-hidden">
      {/* Left sidebar: conversation list (collapsible) */}
      {sidebarOpen && (
        <Sidebar
          conversations={conversations}
          currentId={currentConversation?.id ?? null}
          dirtyBranches={dirtyBranches}
          onSelect={handleSelectConversation}
          onCreate={handleCreateConversation}
        />
      )}

      {/* Center: main chat area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <button
          type="button"
          onClick={toggleSidebar}
          className="absolute top-3 left-3 z-20 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-5 h-5" />
          ) : (
            <PanelLeft className="w-5 h-5" />
          )}
        </button>

        <ChatWindow
          conversationId={currentConversation?.id ?? null}
          onNavigate={handleNavigate}
        />
      </div>

      {/* Right sidebar: tree navigation (only when conversation has branches) */}
      {hasChildren && (
        <TreeSidebar
          tree={currentConversation!}
          currentBranchId={currentBranchId}
          dirtyBranches={dirtyBranches}
          onSelectBranch={handleSelectBranch}
        />
      )}

      {/* Floating merge button */}
      {hasChildren && (
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
      {showMergeModal && currentConversation && (
        <MergeModal
          tree={currentConversation}
          onMerge={handleMerge}
          onClose={() => setShowMergeModal(false)}
        />
      )}
    </div>
  );
}

export default App;
