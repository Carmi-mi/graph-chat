import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import Header, { type BreadcrumbItem } from '../Header';
import MessageList from '../MessageList';
import InputArea from '../InputArea';
import SuggestionBar from '../SuggestionBar';
import AgentIndicator from '../AgentIndicator';
import AnnotationPopup from '../Annotation/Popup';
import SettingsPage from '../SettingsPage';
import { useConversationStore, useUIStore } from '../../store';
import { useTextSelection } from '../../hooks/useTextSelection';
import { handleMessageDelivered } from '../../services/messageUtils';
import * as conversationApi from '../../api/conversation';
import * as messageApi from '../../api/message';
import * as agentApi from '../../api/agent';
import * as annotationApi from '../../api/annotation';
import type { Annotation, ForkSuggestion, ConversationWithTree, Conversation } from '../../schemas';

interface ChatWindowProps {
  conversationId: string | null;
  onNavigate?: (id: string) => void;
  onConversationCreated?: (conversation: Conversation) => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ conversationId, onNavigate, onConversationCreated }) => {
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

  const { annotationBranchStates, settingsOpen, exploringBranches, addExploringBranch, removeExploringBranch, toggleAnnotation } =
    useUIStore();

  const annotationEnabled = currentBranchId ? (annotationBranchStates[currentBranchId] ?? false) : false;

  const messageAreaRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // Per-message annotation poll tracking — survives conversation switches
  const pollMapRef = useRef<Map<string, { interval: ReturnType<typeof setInterval>; timeout: ReturnType<typeof setTimeout>; conversationId: string; branchId: string }>>(new Map());
  const { selectedText, position, clearSelection } = useTextSelection(messageAreaRef);

  const [suggestions, setSuggestions] = useState<ForkSuggestion[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [annotationPos, setAnnotationPos] = useState<{ x: number; y: number } | null>(null);
  const [annotationDone, setAnnotationDone] = useState(false);

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

  const startAnnotationPoll = useCallback((targetMsgId: string, pollConversationId: string, pollBranchId: string, onDone?: () => void) => {
    clearAnnotationPoll(targetMsgId);

    const pollStart = Date.now();
    const interval = setInterval(() => {
      annotationApi.getMessageAnnotations(targetMsgId).then((annotations) => {
        if (annotations.length > 0) {
          clearAnnotationPoll(targetMsgId);
          onDone?.();
          // Reset annotation toggle to off after generation completes
          useUIStore.getState().setAnnotationEnabled(pollBranchId, false);
          // Always update the conversation cache regardless of current view
          const s = useConversationStore.getState();
          const cached = s.conversationCache[pollConversationId];
          if (cached) {
            s.updateCachedConversation(pollConversationId, (conv) => {
              const updateNode = (node: typeof conv): typeof conv => {
                const updatedMessages = node.messages.map((m) =>
                  m.id === targetMsgId ? { ...m, annotations } : m,
                );
                const updatedChildren = node.children.map(updateNode);
                if (updatedMessages !== node.messages || updatedChildren !== node.children) {
                  return { ...node, messages: updatedMessages, children: updatedChildren };
                }
                return node;
              };
              return updateNode(conv);
            });
          } else {
            // Cache missing — fetch full conversation to populate cache
            conversationApi.getConversation(pollConversationId).then((conv) => {
              useConversationStore.getState().setCurrentConversation(conv);
            }).catch(() => {});
          }
          // Show status on annotation button if user is viewing this branch
          if (s.currentConversation?.id === pollConversationId && s.currentBranchId === pollBranchId) {
            setAnnotationDone(true);
            setTimeout(() => setAnnotationDone(false), 5000);
          }
        }
      }).catch(() => {});
    }, 5000);

    const timeout = setTimeout(() => {
      clearAnnotationPoll(targetMsgId);
      onDone?.();
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
      let activeConversationId = conversationId;
      let activeBranchId = currentBranchId;

      // Auto-create conversation when none exists
      if (!activeConversationId || !activeBranchId) {
        try {
          const name = content.length > 50 ? content.slice(0, 50) + '…' : content;
          const created = await conversationApi.createConversation(name);
          activeConversationId = created.id;
          activeBranchId = created.id;
          onConversationCreated?.(created);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to create conversation');
          return;
        }
      }

      const sentFromConversationId = activeConversationId;
      const sentFromBranchId = activeBranchId;
      setWaitingBranchId(activeBranchId);

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
            finalContent = `我正在从主对话中分叉出来，深入探索以下方向：\n主题：${branchNode.forkText}\n我的问题：${content}\n\n请围绕这个主题进行深入分析。`;
          }
        }
      }

      try {
        const response = await messageApi.sendMessage({
          conversationId: activeBranchId,
          role: 'user',
          content: finalContent,
          skipAnnotations: !annotationEnabled,
        });

        const newMsgs = [response.userMessage];
        if (response.assistantMessage) newMsgs.push(response.assistantMessage);
        handleMessageDelivered(sentFromConversationId, sentFromBranchId, newMsgs);

        // Poll for annotations on the specific assistant message just created
        const targetMsgId = response.assistantMessage?.id;
        if (targetMsgId && annotationEnabled) {
          // Keep loading state until annotation polling completes or times out
          startAnnotationPoll(targetMsgId, sentFromConversationId, sentFromBranchId, () => {
            setWaitingBranchId(null);
          });
        } else {
          setWaitingBranchId(null);
        }
      } catch (err) {
        setWaitingBranchId(null);
        setError(err instanceof Error ? err.message : 'Failed to send message');
      }
    },
    [conversationId, currentBranchId, setError, startAnnotationPoll, annotationEnabled],
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

        // Inherit annotation state from parent branch, then reset parent
        const uiState = useUIStore.getState();
        const parentAnnotationState = uiState.annotationBranchStates[currentBranchId!] ?? false;
        uiState.setAnnotationEnabled(child.id, parentAnnotationState);
        uiState.setAnnotationEnabled(currentBranchId!, false);

        // Auto-send message in background to trigger LLM reply + annotations
        const fullSuggestion = suggestionDesc
          ? `${suggestionText}（${suggestionDesc}）`
          : suggestionText || selectedAnnotation.text;
        messageApi.sendMessage({
          conversationId: child.id,
          role: 'user',
          content: `基于之前的对话，我想深入探讨：\n标注内容：${selectedAnnotation.text}\n探索方向：${fullSuggestion}\n\n请围绕这个主题进行深入分析。`,
          skipAnnotations: !parentAnnotationState,
        }).then(async (resp) => {
          const newMsgs = [resp.userMessage];
          if (resp.assistantMessage) newMsgs.push(resp.assistantMessage);
          handleMessageDelivered(conversationId, child.id, newMsgs);

          // Poll for annotations on the new assistant message
          const targetMsgId = resp.assistantMessage?.id;
          if (targetMsgId && parentAnnotationState) {
            startAnnotationPoll(targetMsgId, conversationId, child.id, () => {
              setWaitingBranchId(null);
            });
          } else {
            setWaitingBranchId(null);
          }
        }).catch(() => { setWaitingBranchId(null); });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create branch');
      }
    },
    [selectedAnnotation, conversationId, currentBranchId, setError, startAnnotationPoll, annotationEnabled],
  );

  const handleAnnotationAsk = useCallback(
    (suggestionText: string, suggestionDesc: string) => {
      if (!selectedAnnotation) return;
      const fullSuggestion = suggestionDesc
        ? `${suggestionText}（${suggestionDesc}）`
        : suggestionText;
      const question = `基于之前的对话，我想深入探讨：\n标注内容：${selectedAnnotation.text}\n探索方向：${fullSuggestion}\n\n请围绕这个主题进行深入分析。`;
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

  const { messages, forkText } = useMemo(() => {
    if (!currentConversation || !currentBranchId) return { messages: [], forkText: null };
    const findNode = (node: typeof currentConversation): typeof currentConversation | null => {
      if (node.id === currentBranchId) return node;
      for (const child of node.children) {
        const found = findNode(child);
        if (found) return found;
      }
      return null;
    };
    const node = findNode(currentConversation);
    return { messages: node?.messages ?? [], forkText: node?.forkText ?? null };
  }, [currentConversation, currentBranchId]);

  // When settings is open, show settings page instead of chat
  if (settingsOpen) {
    return (
      <div className="flex flex-col h-full bg-white relative">
        <Header
          breadcrumbs={[{ id: 'settings', label: 'Settings' }]}
          onBreadcrumbClick={() => {}}
        />
        <SettingsPage />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white relative">
      <Header
        breadcrumbs={breadcrumbs}
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
          forkText={forkText}
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
        isLoading={!!currentBranchId && (waitingBranchId === currentBranchId || mergeWaitingBranchId === currentBranchId)}
        disabled={isLoading || (!!currentBranchId && (waitingBranchId === currentBranchId || mergeWaitingBranchId === currentBranchId))}
        annotationEnabled={annotationEnabled}
        annotationDone={annotationDone}
        onToggleAnnotation={() => currentBranchId && toggleAnnotation(currentBranchId)}
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
