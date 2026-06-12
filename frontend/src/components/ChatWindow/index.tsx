import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import Header, { type BreadcrumbItem } from '../Header';
import MessageList from '../MessageList';
import InputArea from '../InputArea';
import SuggestionBar from '../SuggestionBar';
import AgentIndicator from '../AgentIndicator';
import AnnotationPopup from '../Annotation/Popup';
import { useConversationStore, useUIStore } from '../../store';
import { useTextSelection } from '../../hooks/useTextSelection';
import { handleMessageDelivered } from '../../services/messageUtils';
import * as conversationApi from '../../api/conversation';
import * as messageApi from '../../api/message';
import * as agentApi from '../../api/agent';
import * as annotationApi from '../../api/annotation';
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
    waitingBranchId: mergeWaitingBranchId,
    setCurrentConversation,
    setCurrentBranchId,
    setLoading,
    setError,
  } = useConversationStore();

  const { annotationEnabled, exploringBranches, addExploringBranch, removeExploringBranch, toggleAnnotation } =
    useUIStore();

  const messageAreaRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // Per-message annotation poll tracking — survives conversation switches
  const pollMapRef = useRef<Map<string, { interval: ReturnType<typeof setInterval>; timeout: ReturnType<typeof setTimeout>; conversationId: string; branchId: string }>>(new Map());
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

  // Cleanup all polls on unmount only — polls survive conversation switches
  useEffect(() => {
    return () => {
      pollMapRef.current.forEach(({ interval, timeout }) => {
        clearInterval(interval);
        clearTimeout(timeout);
      });
      pollMapRef.current.clear();
    };
  }, []);

  const clearAnnotationPoll = useCallback((msgId: string) => {
    const entry = pollMapRef.current.get(msgId);
    if (entry) {
      clearInterval(entry.interval);
      clearTimeout(entry.timeout);
      pollMapRef.current.delete(msgId);
    }
  }, []);

  const startAnnotationPoll = useCallback((targetMsgId: string, pollConversationId: string, pollBranchId: string) => {
    clearAnnotationPoll(targetMsgId);

    const pollStart = Date.now();
    const interval = setInterval(() => {
      annotationApi.getMessageAnnotations(targetMsgId).then((annotations) => {
        if (annotations.length > 0) {
          clearAnnotationPoll(targetMsgId);
          const s = useConversationStore.getState();
          if (s.currentConversation?.id === pollConversationId && s.currentBranchId === pollBranchId) {
            s.updateMessageAnnotations(targetMsgId, annotations);
            const elapsed = ((Date.now() - pollStart) / 1000).toFixed(0);
            setAnnotationToast(`成功生成标注，用时${elapsed}s`);
            setTimeout(() => setAnnotationToast(null), 5000);
          } else {
            useUIStore.getState().addDirtyBranch(pollConversationId, pollBranchId);
          }
        }
      }).catch(() => {});
    }, 5000);

    const timeout = setTimeout(() => {
      clearAnnotationPoll(targetMsgId);
    }, 180000);

    pollMapRef.current.set(targetMsgId, { interval, timeout, conversationId: pollConversationId, branchId: pollBranchId });
  }, [clearAnnotationPoll]);

  // Load conversation on mount or when conversationId changes
  useEffect(() => {
    if (!conversationId) {
      setCurrentConversation(null);
      return;
    }

    // Skip fetch if store already has this conversation loaded
    const state = useConversationStore.getState();
    if (state.currentConversation?.id === conversationId) return;

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
          const s = useConversationStore.getState();
          if (s.currentConversation?.id === conversationId) {
            setCurrentConversation(conv);
            setCurrentBranchId(currentBranchId);
          }
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
      if (child.parentId) {
        const s = useConversationStore.getState();
        if (s.currentConversation?.id === conversationId) {
          s.insertChildNode(child.parentId, { ...child, messages: [], children: [] });
        }
        setCurrentBranchId(child.id);
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

      // If this is the first user message in a forked branch, wrap with fork context
      let finalContent = content;
      if (currentConversation) {
        const findNode = (node: typeof currentConversation): typeof currentConversation | null => {
          if (node.id === currentBranchId) return node;
          for (const child of node.children) {
            const found = findNode(child);
            if (found) return found;
          }
          return null;
        };
        const branchNode = findNode(currentConversation);
        if (branchNode?.forkText) {
          const hasUserMsg = branchNode.messages.some(m => m.role === 'user');
          if (!hasUserMsg) {
            finalContent = `关于「${branchNode.forkText}」，我想深入了解：${content}`;
          }
        }
      }

      try {
        const response = await messageApi.sendMessage({
          conversationId: currentBranchId,
          role: 'user',
          content: finalContent,
        });
        setWaitingBranchId(null);

        const newMsgs = [response.userMessage];
        if (response.assistantMessage) newMsgs.push(response.assistantMessage);
        handleMessageDelivered(sentFromConversationId, sentFromBranchId, newMsgs);

        // Poll for annotations on the specific assistant message just created
        const targetMsgId = response.assistantMessage?.id;
        if (targetMsgId) {
          startAnnotationPoll(targetMsgId, sentFromConversationId, sentFromBranchId);
        }
      } catch (err) {
        setWaitingBranchId(null);
        setError(err instanceof Error ? err.message : 'Failed to send message');
      }
    },
    [conversationId, currentBranchId, setError, startAnnotationPoll],
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
        // Refresh sidebar to reflect exploring status
        conversationApi.listConversations().then(
          (res) => useConversationStore.getState().setConversations(res.items),
        ).catch(() => {});
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
    async (suggestionText: string, suggestionDesc: string) => {
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

        // Insert child node locally and switch to it
        if (child.parentId) {
          const s = useConversationStore.getState();
          if (s.currentConversation?.id === conversationId) {
            s.insertChildNode(child.parentId, { ...child, messages: [], children: [] });
          }
        }
        setCurrentBranchId(child.id);

        // Auto-send message in background to trigger LLM reply + annotations
        const fullSuggestion = suggestionDesc
          ? `${suggestionText}（${suggestionDesc}）`
          : suggestionText || selectedAnnotation.text;
        messageApi.sendMessage({
          conversationId: child.id,
          role: 'user',
          content: `关于「${selectedAnnotation.text}」，我想深入了解：${fullSuggestion}`,
        }).then(async (resp) => {
          setWaitingBranchId(null);
          const newMsgs = [resp.userMessage];
          if (resp.assistantMessage) newMsgs.push(resp.assistantMessage);
          handleMessageDelivered(conversationId, child.id, newMsgs);

          // Poll for annotations on the new assistant message
          const targetMsgId = resp.assistantMessage?.id;
          if (targetMsgId) {
            startAnnotationPoll(targetMsgId, conversationId, child.id);
          }
        }).catch(() => { setWaitingBranchId(null); });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create branch');
      }
    },
    [selectedAnnotation, conversationId, currentBranchId, setError, startAnnotationPoll],
  );

  const handleAnnotationAsk = useCallback(
    (suggestionText: string, suggestionDesc: string) => {
      if (!selectedAnnotation) return;
      const fullSuggestion = suggestionDesc
        ? `${suggestionText}（${suggestionDesc}）`
        : suggestionText;
      const question = `关于「${selectedAnnotation.text}」，我想深入了解：${fullSuggestion}`;
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
        isLoading={waitingBranchId === currentBranchId || mergeWaitingBranchId === currentBranchId}
        disabled={!currentBranchId || isLoading || waitingBranchId === currentBranchId || mergeWaitingBranchId === currentBranchId}
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
