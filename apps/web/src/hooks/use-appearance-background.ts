import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

const LONG_PRESS_MS = 420;
const MOVE_CANCEL_PX = 10;

export interface MenuPosition {
  readonly x: number;
  readonly y: number;
}

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return true;
  }
  return Boolean(
    target.closest(
      '[data-content-card="true"], [data-appearance-menu="true"], [role="menu"], [role="dialog"], button, a, input, select, textarea, label, table, tr',
    ),
  );
}

function clampMenuPosition(clientX: number, clientY: number): MenuPosition {
  if (typeof window === 'undefined') {
    return { x: clientX, y: clientY };
  }
  const width = 264;
  const height = 220;
  return {
    x: Math.max(12, Math.min(clientX, window.innerWidth - width - 12)),
    y: Math.max(12, Math.min(clientY, window.innerHeight - height - 12)),
  };
}

export function useAppearanceBackgroundHandlers() {
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{ readonly x: number; readonly y: number } | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartRef.current = null;
  }, []);

  const closeMenu = useCallback(() => {
    setMenuPos(null);
  }, []);

  const onContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (event.defaultPrevented || shouldIgnoreTarget(event.target)) {
        return;
      }
      event.preventDefault();
      clearLongPress();
      setMenuPos(clampMenuPosition(event.clientX, event.clientY));
    },
    [clearLongPress],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
        return;
      }
      if (shouldIgnoreTarget(event.target)) {
        return;
      }
      clearLongPress();
      const startX = event.clientX;
      const startY = event.clientY;
      pointerStartRef.current = { x: startX, y: startY };
      longPressTimerRef.current = setTimeout(() => {
        setMenuPos(clampMenuPosition(startX, startY));
        longPressTimerRef.current = null;
        pointerStartRef.current = null;
      }, LONG_PRESS_MS);
    },
    [clearLongPress],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!pointerStartRef.current) {
        return;
      }
      const dx = Math.abs(event.clientX - pointerStartRef.current.x);
      const dy = Math.abs(event.clientY - pointerStartRef.current.y);
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
        clearLongPress();
      }
    },
    [clearLongPress],
  );

  useEffect(() => {
    return () => {
      clearLongPress();
    };
  }, [clearLongPress]);

  return {
    menuPos,
    closeMenu,
    backgroundHandlers: {
      onContextMenu,
      onPointerDown,
      onPointerMove,
      onPointerUp: clearLongPress,
      onPointerCancel: clearLongPress,
    },
  };
}
