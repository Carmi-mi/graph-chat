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

  const clearSelection = useCallback(() => {
    setSelectedText('');
    setPosition(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = () => {
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

      if (container.contains(range.commonAncestorContainer)) {
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

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mouseup', handleMouseUp);
    };
  }, [containerRef]);

  return { selectedText, position, clearSelection };
}
