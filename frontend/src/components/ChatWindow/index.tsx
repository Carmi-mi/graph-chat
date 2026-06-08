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
import type { Annotation, ForkSuggestion, ConversationWithTree } from '../../schemas';

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
  const popupRef = useRef<HTMLDivElement>(null);
  const { selectedText, position, clearSelection } = useTextSelection(messageAreaRef);

  const [suggestions, setSuggestions] = useState<ForkSuggestion[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [annotationPos, setAnnotationPos] = useState<{ x: number; y: number } | null>(null);
  const [annotationToast, setAnnotationToast] = useState<string | null>(null);

  // Close annotation popup on outside click
  useEffect(() => {
    if (!selectedAnnotation) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setSelectedAnnotation(null);
        setAnnotationPos(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [selectedAnnotation]);
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
      const child = await messageApi.forkMessage(forkingMessageId, {
        selectedText,
      });
      clearSelection();
      setForkingMessageId(null);
      if (conversationId) {
        const conv = await conversationApi.getConversation(conversationId);
        useConversationStore.setState({
          currentConversation: conv,
          currentBranchId: child.id,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create branch');
    }
  }, [forkingMessageId, selectedText, conversationId, clearSelection, setError]);

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
      setAnnotationToast(null);

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
          return { ...node, children: node.children.map(appendMessages).filter((n): n is ConversationWithTree => n != null) };
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

        // Poll for annotations until they appear (background LLM task)
        const pollStart = Date.now();
        const pollInterval = setInterval(() => {
          const s = useConversationStore.getState();
          if (s.currentConversation?.id !== sentFromConversationId || s.currentBranchId !== sentFromBranchId) {
            clearInterval(pollInterval);
            return;
          }
          conversationApi.getConversation(sentFromConversationId).then((conv) => {
            const findNode = (node: typeof conv): typeof conv | null => {
              if (node.id === sentFromBranchId) return node;
              for (const child of node.children) {
                const found = findNode(child);
                if (found) return found;
              }
              return null;
            };
            const branch = findNode(conv);
            const hasAnnotations = branch?.messages.some(
              (m) => m.role === 'assistant' && m.annotations && m.annotations.length > 0,
            );
            if (hasAnnotations) {
              useConversationStore.setState({ currentConversation: conv });
              clearInterval(pollInterval);
              const elapsed = ((Date.now() - pollStart) / 1000).toFixed(0);
              setAnnotationToast(`成功生成标注，用时${elapsed}s`);
              setTimeout(() => setAnnotationToast(null), 5000);
            }
          }).catch(() => {});
        }, 5000);

        // Safety: stop polling after 180 seconds
        setTimeout(() => {
          clearInterval(pollInterval);
          setAnnotationToast('智能标注超时未成功捕获');
          setTimeout(() => setAnnotationToast(null), 5000);
        }, 180000);
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

  const handleAnnotationClick = useCallback((annotation: Annotation, x: number, y: number) => {
    // Compute edge-aware position before render (popup is w-72=288px, est. max height ~260px)
    const POPUP_W = 288;
    const POPUP_H = 260;
    const MARGIN = 8;
    let left = x;
    let top = y + MARGIN;

    if (left + POPUP_W > window.innerWidth - MARGIN) {
      left = window.innerWidth - POPUP_W - MARGIN;
    }
    if (left < MARGIN) left = MARGIN;

    if (top + POPUP_H > window.innerHeight - MARGIN) {
      top = y - POPUP_H - MARGIN;
    }
    if (top < MARGIN) top = MARGIN;

    setSelectedAnnotation(annotation);
    setAnnotationPos({ x: left, y: top });
  }, []);

  const handleAnnotationSuggestion = useCallback(
    async (suggestionText: string) => {
      if (!selectedAnnotation || !conversationId) return;
      try {
        const child = await messageApi.forkMessage(selectedAnnotation.messageId, {
          selectedText: selectedAnnotation.text,
          suggestion: suggestionText,
        });
        setSelectedAnnotation(null);
        setAnnotationPos(null);

        // Mark new branch as waiting so input shows spinner
        setWaitingBranchId(child.id);

        // Refresh tree and switch to the new branch
        const conv = await conversationApi.getConversation(conversationId);
        useConversationStore.setState({
          currentConversation: conv,
          currentBranchId: child.id,
        });

        // Auto-send message in background to trigger LLM reply + annotations
        const userContent = suggestionText || selectedAnnotation.text;
        messageApi.sendMessage({
          conversationId: child.id,
          role: 'user',
          content: `请深入探讨：${userContent}`,
        }).then(async () => {
          setWaitingBranchId(null);
          // Refresh tree, preserve whichever branch user is currently viewing
          const updated = await conversationApi.getConversation(conversationId);
          const state = useConversationStore.getState();
          useConversationStore.setState({
            currentConversation: updated,
            currentBranchId: state.currentBranchId,
          });
        }).catch(() => { setWaitingBranchId(null); });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create branch');
      }
    },
    [selectedAnnotation, conversationId, currentBranchId, setError],
  );

  const handleAnnotationAsk = useCallback(
    (suggestionText: string) => {
      if (!selectedAnnotation) return;
      const question = `关于「${selectedAnnotation.text}」：${suggestionText}`;
      setSelectedAnnotation(null);
      setAnnotationPos(null);
      handleSend(question);
    },
    [selectedAnnotation, handleSend],
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
      <div ref={messageAreaRef} className="flex-1 flex flex-col overflow-hidden">
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

      {/* Annotation toast */}
      {annotationToast && (
        <div className={`mx-auto mb-2 px-3 py-1.5 rounded-lg text-xs ${annotationToast.includes('成功') ? 'bg-green-50 border border-green-200 text-green-600' : 'bg-amber-50 border border-amber-200 text-amber-600'}`}>
          {annotationToast}
        </div>
      )}

      {/* Input area */}
      <InputArea
        onSend={handleSend}
        isLoading={waitingBranchId === currentBranchId}
        disabled={!currentBranchId || isLoading || waitingBranchId === currentBranchId}
      />

      {/* Annotation popup — edge-aware positioning computed in handleAnnotationClick */}
      {selectedAnnotation && annotationPos && (
        <div
          ref={popupRef}
          className="fixed z-50"
          style={{ top: annotationPos.y, left: annotationPos.x }}
        >
          <AnnotationPopup
            annotation={selectedAnnotation}
            onSuggestionClick={handleAnnotationSuggestion}
            onSuggestionAsk={handleAnnotationAsk}
            onClose={() => { setSelectedAnnotation(null); setAnnotationPos(null); }}
          />
        </div>
      )}
    </div>
  );
};

export default ChatWindow;
