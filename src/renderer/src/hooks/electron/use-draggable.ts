import {
  useState, useRef, useEffect, useCallback,
} from 'react';
import { useMode } from '@/context/mode-context';

interface Position {
  x: number
  y: number
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

interface UseDraggableProps {
  componentId: string
}

/**
 * Minimum number of pixels of the element that must remain inside the viewport.
 * Without this the box can be dragged (or restored from localStorage) completely
 * off-screen, which looks exactly like "the subtitle/input box disappeared".
 */
const VISIBLE_MARGIN = 60;

/**
 * Elements that must never start a drag. Clicking the input field or one of the
 * icon buttons should behave like a normal click, not like grabbing the window.
 */
const INTERACTIVE_SELECTOR = 'input, textarea, select, button, a, [role="button"], [contenteditable="true"]';

/**
 * A custom hook that provides dragging functionality for components
 * @param componentId - Unique identifier for the component
 * @returns Object containing refs and handlers for dragging functionality
 */
export function useDraggable({ componentId }: UseDraggableProps) {
  const { mode } = useMode();
  const isPet = mode === 'pet';
  // Track if the element is currently being dragged
  const [isDragging, setIsDragging] = useState(false);

  const storageKey = `draggable_position_${componentId}`;

  // Load saved position from localStorage
  const loadSavedPosition = (): Position => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return { x: 0, y: 0 };
      const parsed = JSON.parse(stored);
      if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number'
        || !Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) {
        return { x: 0, y: 0 };
      }
      return { x: parsed.x, y: parsed.y };
    } catch {
      return { x: 0, y: 0 };
    }
  };

  // Refs to store position data that persists between renders
  const positionRef = useRef<Position>(loadSavedPosition());
  const dragStartRef = useRef<Position>({ x: 0, y: 0 });
  const elementRef = useRef<HTMLDivElement>(null);
  // Layout rect of the element as if the drag offset were (0, 0).
  const baseRectRef = useRef<Rect | null>(null);
  // Mirror of isDragging that is readable from inside native event listeners.
  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef<Position>({ x: 0, y: 0 });

  const applyTransform = useCallback((pos: Position) => {
    if (!elementRef.current) return;
    elementRef.current.style.transform = `translateX(-50%) translate(${pos.x}px, ${pos.y}px)`;
  }, []);

  /** Measure where the element would sit with a zero drag offset. */
  const measureBase = useCallback(() => {
    if (!elementRef.current) return;
    const rect = elementRef.current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    baseRectRef.current = {
      left: rect.left - positionRef.current.x,
      top: rect.top - positionRef.current.y,
      width: rect.width,
      height: rect.height,
    };
  }, []);

  /** Keep at least VISIBLE_MARGIN pixels of the element inside the viewport. */
  const clampToViewport = useCallback((pos: Position): Position => {
    const base = baseRectRef.current;
    if (!base || base.width === 0) return pos;

    const minX = VISIBLE_MARGIN - base.left - base.width;
    const maxX = window.innerWidth - VISIBLE_MARGIN - base.left;
    // The title/close row lives at the top, so never let the top edge go above 0.
    const minY = -base.top;
    const maxY = window.innerHeight - VISIBLE_MARGIN - base.top;

    return {
      x: Math.min(Math.max(pos.x, Math.min(minX, maxX)), Math.max(minX, maxX)),
      y: Math.min(Math.max(pos.y, Math.min(minY, maxY)), Math.max(minY, maxY)),
    };
  }, []);

  /** Re-clamp the stored position and persist it if it had to move. */
  const enforceViewportBounds = useCallback(() => {
    measureBase();
    const clamped = clampToViewport(positionRef.current);
    if (clamped.x === positionRef.current.x && clamped.y === positionRef.current.y) return;
    positionRef.current = clamped;
    applyTransform(clamped);
    try {
      localStorage.setItem(storageKey, JSON.stringify(clamped));
    } catch {
      // Ignore quota / private-mode failures.
    }
  }, [applyTransform, clampToViewport, measureBase, storageKey]);

  /** Move the element back to its default position. */
  const resetPosition = useCallback(() => {
    positionRef.current = { x: 0, y: 0 };
    applyTransform(positionRef.current);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore.
    }
  }, [applyTransform, storageKey]);

  // Apply saved position on mount, then pull it back on-screen if it was stored
  // off-screen by a previous runaway drag.
  useEffect(() => {
    applyTransform(positionRef.current);
    const frame = requestAnimationFrame(() => enforceViewportBounds());
    return () => cancelAnimationFrame(frame);
  }, [applyTransform, enforceViewportBounds]);

  // Screen resolution / window size changes can strand the element off-screen too.
  useEffect(() => {
    const onResize = () => {
      if (isDraggingRef.current) return;
      enforceViewportBounds();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [enforceViewportBounds]);

  /**
   * Handle mouse enter event for pet mode
   * Notifies the electron main process about hover state
   */
  const handleMouseEnter = () => {
    if (isPet) {
      (window.api as any)?.updateComponentHover(componentId, true);
    }
  };

  /**
   * Handle mouse leave event for pet mode
   * Notifies the electron main process about hover state
   */
  const handleMouseLeave = () => {
    if (isPet && !isDraggingRef.current) {
      (window.api as any)?.updateComponentHover(componentId, false);
    }
  };

  /**
   * Handles the start of dragging operation
   * Sets up mouse move and mouse up listeners
   */
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only the primary button drags; right-click must stay available for the menu.
    if (e.button !== 0) return;
    // Clicking a control (input box, mic/interrupt/close button) is not a drag.
    const target = e.target as HTMLElement | null;
    if (target?.closest?.(INTERACTIVE_SELECTOR)) return;

    measureBase();
    setIsDragging(true);
    isDraggingRef.current = true;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    // Calculate the initial offset
    dragStartRef.current = {
      x: e.clientX - positionRef.current.x,
      y: e.clientY - positionRef.current.y,
    };

    /**
     * Updates element position during mouse movement
     */
    function handleMouseMove(moveEvent: MouseEvent) {
      // In pet mode setIgnoreMouseEvents({ forward: true }) forwards mousemove but
      // can swallow mouseup, which used to leave the box glued to the cursor until
      // it flew off-screen. buttons === 0 means the button is already released.
      if (moveEvent.buttons === 0) {
        stopDragging();
        return;
      }
      if (!elementRef.current) return;

      lastPointerRef.current = { x: moveEvent.clientX, y: moveEvent.clientY };

      // Calculate new position, kept inside the viewport
      const newPosition = clampToViewport({
        x: moveEvent.clientX - dragStartRef.current.x,
        y: moveEvent.clientY - dragStartRef.current.y,
      });

      // Update position ref for future calculations
      positionRef.current = newPosition;
      applyTransform(newPosition);
    }

    /**
     * Cleanup function for mouse events
     */
    function stopDragging() {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);
      try {
        localStorage.setItem(storageKey, JSON.stringify(positionRef.current));
      } catch {
        // Ignore.
      }

      // Clean up event listeners
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', stopDragging, true);
      document.removeEventListener('pointerup', stopDragging, true);
      document.removeEventListener('pointercancel', stopDragging, true);
      window.removeEventListener('blur', stopDragging);

      // The pointer may have ended up outside the element while dragging, in which
      // case mouseleave never fires and the window would stay focusable forever.
      if (isPet) {
        const rect = elementRef.current?.getBoundingClientRect();
        const { x, y } = lastPointerRef.current;
        const inside = !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        if (!inside) {
          (window.api as any)?.updateComponentHover(componentId, false);
        }
      }
    }

    // Add event listeners with capture phase
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mouseup', stopDragging, true);
    document.addEventListener('pointerup', stopDragging, true);
    document.addEventListener('pointercancel', stopDragging, true);
    window.addEventListener('blur', stopDragging);
  };

  return {
    elementRef,
    isDragging,
    handleMouseDown,
    handleMouseEnter,
    handleMouseLeave,
    resetPosition,
  };
}
