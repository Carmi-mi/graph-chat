import { useState, useCallback, useEffect, useRef } from 'react';

interface SelectionPosition {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

interface TextSelectionState {
  selectedText: string;
  position: SelectionPosition | null;
  clearSelection: () => void;
}

export function useTextSelection(containerRef: React.RefObject<HTMLElement | null>): TextSelectionState {
  const [selectedText, setSelectedText] = useState('');
  const [position, setPosition] = useState<SelectionPosition | null>(null);
  const isSelecting = useRef(false);
  const selectedTextRef = useRef('');

  // Keep ref in sync with state
  useEffect(() => {
    selectedTextRef.current = selectedText;
  }, [selectedText]);

  const clearSelection = useCallback(() => {
    setSelectedText('');
    setPosition(null);
    selectedTextRef.current = '';
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // --- Selection creation: only inside the message area ---
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-fork-button]')) return;
      isSelecting.current = true;
    };

    const handleMouseUp = () => {
      if (!isSelecting.current) return;
      isSelecting.current = false;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        return;
      }

      const text = selection.toString().trim();
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      const target = range.commonAncestorContainer instanceof HTMLElement
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
      if (container.contains(range.commonAncestorContainer) && target?.closest('[data-role="assistant"]')) {
        setSelectedText(text);
        setPosition({
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right,
        });
      }
    };

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mouseup', handleMouseUp);

    // --- Dismissal: global (any interaction except clicking the fork button) ---
    const handleDismiss = (e: Event) => {
      if (!selectedTextRef.current) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-fork-button]')) return;
      if (isSelecting.current) return;
      setSelectedText('');
      setPosition(null);
      selectedTextRef.current = '';
    };

    document.addEventListener('mousedown', handleDismiss, true);
    document.addEventListener('scroll', handleDismiss, true);
    document.addEventListener('keydown', handleDismiss, true);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleDismiss, true);
      document.removeEventListener('scroll', handleDismiss, true);
      document.removeEventListener('keydown', handleDismiss, true);
    };
  }, [containerRef]);

  return { selectedText, position, clearSelection };
}
