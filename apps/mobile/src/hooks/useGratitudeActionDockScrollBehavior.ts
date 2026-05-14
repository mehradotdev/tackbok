import { useCallback, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/** Downward distance required to hide the dock while reading through the timeline. */
const SCROLL_COLLAPSE_THRESHOLD = 30;
/** Upward distance required to reopen the dock after an auto-collapse. */
const SCROLL_EXPAND_THRESHOLD = 48;

type ScrollDirection = 'up' | 'down' | null;

interface UseGratitudeActionDockScrollBehaviorResult {
  /** Controlled dock state consumed by the home screen. */
  isExpanded: boolean;
  /** Manual dock toggle that opts out of immediate scroll-driven reopening. */
  onToggle: () => void;
  /** Resets cumulative tracking at the start of a fresh drag interaction. */
  onScrollBeginDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Expands or collapses the dock from cumulative directional scroll distance. */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

/**
 * Applies scroll-driven expand/collapse rules for the gratitude action dock.
 *
 * The hook tracks cumulative scroll distance within the current direction,
 * resets its baseline on direction changes, and uses separate thresholds for
 * collapsing and reopening. Auto-expand is allowed only after a scroll-driven
 * collapse so manual user toggles are not immediately undone by the next
 * upward drag.
 */
export function useGratitudeActionDockScrollBehavior(): UseGratitudeActionDockScrollBehaviorResult {
  const [isExpanded, setIsExpanded] = useState(true);

  const autoCollapsed = useRef(false);
  const baselineScrollY = useRef(0);
  const currentScrollY = useRef(0);
  const lastDirection = useRef<ScrollDirection>(null);
  const lastScrollY = useRef(0);

  const resetScrollTracking = useCallback((scrollY: number) => {
    const normalizedY = Math.max(0, scrollY);
    baselineScrollY.current = normalizedY;
    currentScrollY.current = normalizedY;
    lastDirection.current = null;
    lastScrollY.current = normalizedY;
  }, []);

  const handleScrollBeginDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      resetScrollTracking(event.nativeEvent.contentOffset.y);
    },
    [resetScrollTracking],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const currentY = Math.max(0, event.nativeEvent.contentOffset.y);
      currentScrollY.current = currentY;

      const deltaFromLast = currentY - lastScrollY.current;
      if (deltaFromLast === 0) {
        return;
      }

      const direction: ScrollDirection = deltaFromLast > 0 ? 'down' : 'up';
      if (lastDirection.current !== direction) {
        baselineScrollY.current = lastScrollY.current;
        lastDirection.current = direction;
      }

      const distanceFromBaseline = currentY - baselineScrollY.current;

      if (direction === 'down') {
        if (isExpanded && distanceFromBaseline >= SCROLL_COLLAPSE_THRESHOLD) {
          autoCollapsed.current = true;
          setIsExpanded(false);
          resetScrollTracking(currentY);
        }
      } else if (
        !isExpanded &&
        autoCollapsed.current &&
        baselineScrollY.current - currentY >= SCROLL_EXPAND_THRESHOLD
      ) {
        autoCollapsed.current = false;
        setIsExpanded(true);
        resetScrollTracking(currentY);
      }

      lastScrollY.current = currentY;
    },
    [isExpanded, resetScrollTracking],
  );

  const handleToggle = useCallback(() => {
    autoCollapsed.current = false;
    setIsExpanded((prev) => !prev);
    resetScrollTracking(currentScrollY.current);
  }, [resetScrollTracking]);

  return {
    isExpanded,
    onToggle: handleToggle,
    onScroll: handleScroll,
    onScrollBeginDrag: handleScrollBeginDrag,
  };
}
