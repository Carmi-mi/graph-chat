import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import Header, { type BreadcrumbItem } from '../Header';
import MessageList from '../MessageList';
import InputArea from '../InputArea';
import SuggestionBar from '../SuggestionBar';
import AgentIndicator from '../AgentIndicator';
import AnnotationPopup from '../Annotation/Popup';
import { useConversationStore, useUIStore } from '../../store';
import { useTextSelection } from '../../hooks/useTextSelection';
import * as conversationApi from '../../api/conversation';
import * as messageApi from '../../api/message';
import * as agentApi from '../../api/agent';
import type { Annotation, ForkSuggestion } from '../../schemas';

interface ChatWindowProps {
  conversationId: string | null;
  onNavigate?: (id: string) => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ conversationId, onNavigate }) => {
  const {
    currentConversation,
    currentBranchId,
    isLoading,
    setCurrentConversation,
    setCurrentBranchId,
    setLoading,
    setError,
  } = useConversationStore();

  const { annotationEnabled, exploringBranches, addExploringBranch, removeExploringBranch, toggleAnnotation } =
    useUIStore();

  const messageAreaRef = useRef<HTMLDivElement>(null);
  const { selectedText, position, clearSelection } = useTextSelection(messageAreaRef);

  const [suggestions, setSuggestions] = useState<ForkSuggestion[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [waitingBranchId, setWaitingBranchId] = useState<string | null>(null);
  const [forkingMessageId, setForkingMessageId] = useState<string | null>(null);

  // Load conversation on mount or when conversationId changes
  useEffect(() => {
    if (!conversationId) {
      setCurrentConversation(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const conv = await conversationApi.getConversation(conversationId);
        if (!cancelled) {
          setCurrentConversation(conv);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load conversation');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [conversationId, setCurrentConversation, setLoading, setError]);

  // Poll exploration status while any branches are exploring
  useEffect(() => {
    if (exploringBranches.length === 0 || !conversationId) return;

    const interval = setInterval(async () => {
      try {
        const status = await agentApi.getExploreStatus(conversationId);
        const allDone = status.branches.every(
          (b) => b.status === 'done' || b.status === 'active',
        );
        if (allDone) {
          exploringBranches.forEach((id) => removeExploringBranch(id));
          const conv = await conversationApi.getConversation(conversationId);
          useConversationStore.setState({
            currentConversation: conv,
            currentBranchId: currentBranchId,
          });
          clearInterval(interval);
        }
      } catch {
        // Polling failure does not stop the interval
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [exploringBranches, conversationId, currentBranchId, removeExploringBranch]);

  // Track which message the selected text belongs to
  const handleTextSelect = useCallback(
    (messageId: string) => {
      setForkingMessageId(messageId);
    },
    [],
  );

  // Handle manual fork from selected text
  const handleForkText = useCallback(async () => {
    if (!forkingMessageId || !selectedText) return;
    try {
      await messageApi.forkMessage(forkingMessageId, {
        selectedText,
      });
      clearSelection();
      setForkingMessageId(null);
      if (conversationId) {
        const conv = await conversationApi.getConversation(conversationId);
        useConversationStore.setState({
          currentConversation: conv,
          currentBranchId: currentBranchId,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create branch');
    }
  }, [forkingMessageId, selectedText, conversationId, currentBranchId, clearSelection, setError]);

  // Build breadcrumb trail from root to current branch
  const breadcrumbs: BreadcrumbItem[] = [];
  if (currentConversation && currentBranchId) {
    const findPath = (
      node: typeof currentConversation,
      targetId: string,
      path: typeof currentConversation[],
    ): boolean => {
      path.push(node);
      if (node.id === targetId) return true;
      for (const child of node.children) {
        if (findPath(child, targetId, path)) return true;
      }
      path.pop();
      return false;
    };

    const path: typeof currentConversation[] = [];
    findPath(currentConversation, currentBranchId, path);
    breadcrumbs.push(
      ...path.map((node) => ({ id: node.id, label: node.name })),
    );
  }

  const handleSend = useCallback(
    async (content: string) => {
      if (!currentBranchId || !conversationId) return;
      const sentFromConversationId = conversationId;
      const sentFromBranchId = currentBranchId;
      setWaitingBranchId(currentBranchId);

      try {
        const response = await messageApi.sendMessage({
          conversationId: currentBranchId,
          role: 'user',
          content,
        });
        setWaitingBranchId(null);

        // Append new messages to the branch in store (no extra getConversation call)
        const appendMessages = (node: typeof currentConversation): typeof currentConversation => {
          if (!node) return node;
          if (node.id === sentFromBranchId) {
            const newMsgs = [response.userMessage];
            if (response.assistantMessage) newMsgs.push(response.assistantMessage);
            return { ...node, messages: [...node.messages, ...newMsgs] };
          }
          return { ...node, children: node.children.map(appendMessages) };
        };

        const state = useConversationStore.getState();
        const stillOnSameConversation = state.currentConversation?.id === sentFromConversationId;
        const stillOnSameBranch = state.currentBranchId === sentFromBranchId;

        if (stillOnSameConversation && stillOnSameBranch && state.currentConversation) {
          // User is still here — append messages directly
          useConversationStore.setState({
            currentConversation: appendMessages(state.currentConversation),
            currentBranchId: sentFromBranchId,
          });
        } else {
          // User switched away — just mark dirty
          useUIStore.getState().addDirtyBranch(sentFromConversationId, sentFromBranchId);
        }

        // Refresh sidebar conversation list
        conversationApi.listConversations().then(
          (res) => useConversationStore.getState().setConversations(res.items),
        ).catch(() => {});
      } catch (err) {
        setWaitingBranchId(null);
        setError(err instanceof Error ? err.message : 'Failed to send message');
      }
    },
    [conversationId, currentBranchId, setError],
  );

  const handleExplore = useCallback(
    async () => {
      if (!currentBranchId) return;
      try {
        const result = await agentApi.autoExplore({
          branchId: currentBranchId,
          maxDepth: 2,
          parallel: 1,
        });
        addExploringBranch(result.taskId);
        setSuggestions([]);
        // Refresh conversation tree, preserve current branch
        if (conversationId) {
          const conv = await conversationApi.getConversation(conversationId);
          useConversationStore.setState({
            currentConversation: conv,
            currentBranchId: currentBranchId,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start exploration');
      }
    },
    [currentBranchId, conversationId, addExploringBranch, setError],
  );

  const handleAnnotationClick = useCallback((annotation: Annotation) => {
    setSelectedAnnotation(annotation);
  }, []);

  const handleAnnotationSuggestion = useCallback(
    async (suggestionText: string) => {
      if (!selectedAnnotation) return;
      try {
        await messageApi.forkMessage(selectedAnnotation.messageId, {
          selectedText: selectedAnnotation.text,
          suggestion: suggestionText,
        });
        setSelectedAnnotation(null);
        // Refresh conversation tree, preserve current branch
        if (conversationId) {
          const conv = await conversationApi.getConversation(conversationId);
          useConversationStore.setState({
            currentConversation: conv,
            currentBranchId: currentBranchId,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create branch');
      }
    },
    [selectedAnnotation, conversationId, currentBranchId, setError],
  );

  const handleBreadcrumbClick = useCallback(
    (id: string) => {
      setCurrentBranchId(id);
      onNavigate?.(id);
    },
    [setCurrentBranchId, onNavigate],
  );

  const messages = useMemo(() => {
    if (!currentConversation || !currentBranchId) return [];
    const findNode = (node: typeof currentConversation): typeof currentConversation | null => {
      if (node.id === currentBranchId) return node;
      for (const child of node.children) {
        const found = findNode(child);
        if (found) return found;
      }
      return null;
    };
    const node = findNode(currentConversation);
    return node?.messages ?? [];
  }, [currentConversation, currentBranchId]);

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 to-gray-100 relative">
      <Header
        breadcrumbs={breadcrumbs}
        annotationEnabled={annotationEnabled}
        onToggleAnnotation={toggleAnnotation}
        onBreadcrumbClick={handleBreadcrumbClick}
      />

      {/* Agent indicator */}
      {exploringBranches.length > 0 && (
        <AgentIndicator
          exploringCount={exploringBranches.length}
          isDone={false}
        />
      )}

      {/* Message list */}
      <div ref={messageAreaRef} className="flex-1 overflow-hidden">
        <MessageList
          messages={messages}
          annotationEnabled={annotationEnabled}
          onAnnotationClick={handleAnnotationClick}
          onTextSelect={handleTextSelect}
        />
      </div>

      {/* Floating fork button for text selection (only for assistant messages) */}
      {selectedText && position && forkingMessageId && (
        <button
          data-fork-button
          onClick={handleForkText}
          className="fixed z-50 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-xs font-medium shadow-lg hover:opacity-90 transition-opacity cursor-pointer"
          style={{
            top: position.top - 36,
            left: (position.left + position.right) / 2 - 30,
          }}
        >
          Fork
        </button>
      )}

      {/* Suggestion bar */}
      <SuggestionBar
        suggestions={suggestions}
        onDismiss={() => setSuggestions([])}
        onExplore={handleExplore}
      />

      {/* Input area */}
      <InputArea
        onSend={handleSend}
        isLoading={waitingBranchId === currentBranchId}
        disabled={!currentBranchId || isLoading || waitingBranchId === currentBranchId}
      />

      {/* Annotation popup overlay */}
      {selectedAnnotation && (
        <div className="fixed inset-0 z-40" onClick={() => setSelectedAnnotation(null)}>
          <div
            className="absolute top-1/3 left-1/2 -translate-x-1/2"
            onClick={(e) => e.stopPropagation()}
          >
            <AnnotationPopup
              annotation={selectedAnnotation}
              onSuggestionClick={handleAnnotationSuggestion}
              onClose={() => setSelectedAnnotation(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWindow;
