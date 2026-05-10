import * as React from 'react';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

/**
 * Combines multiple refs into one stable callback ref.
 *
 * A stable callback avoids React detaching and re-attaching the same host node
 * on every render, but it also means React will not automatically re-run the
 * ref when the ref list itself changes. To keep the behavior correct, we:
 * 1. snapshot the refs that were attached to the current node
 * 2. remember any cleanup functions returned by callback refs
 * 3. re-sync the current node if the ref list changes while it is mounted
 */
export function useComposedRefs<T>(
  ...refs: (React.Ref<T> | undefined)[]
): React.RefCallback<T> {
  const refsRef = React.useRef(refs);
  const nodeRef = React.useRef<T | null>(null);
  const activeRefsRef = React.useRef<(React.Ref<T> | undefined)[]>([]);
  const cleanupsRef = React.useRef<((() => void) | undefined)[]>([]);

  refsRef.current = refs;

  const detachActiveRefs = React.useCallback(() => {
    const previousRefs = activeRefsRef.current;
    const previousCleanups = cleanupsRef.current;

    previousCleanups.forEach((cleanup) => cleanup?.());
    cleanupsRef.current = [];

    previousRefs.forEach((ref, index) => {
      if (typeof ref === 'function') {
        if (previousCleanups[index] == null) {
          ref(null);
        }
      } else if (ref != null) {
        ref.current = null;
      }
    });

    activeRefsRef.current = [];
  }, []);

  const attachActiveRefs = React.useCallback((node: T) => {
    const activeRefs = [...refsRef.current];

    activeRefsRef.current = activeRefs;
    cleanupsRef.current = activeRefs.map((ref) => setRef(ref, node));
  }, []);

  useIsomorphicLayoutEffect(() => {
    const node = nodeRef.current;

    if (node == null) return;

    const activeRefs = activeRefsRef.current;
    const nextRefs = refsRef.current;

    if (
      activeRefs.length === nextRefs.length &&
      activeRefs.every((ref, index) => ref === nextRefs[index])
    ) {
      return;
    }

    detachActiveRefs();
    attachActiveRefs(node);
  }, [attachActiveRefs, detachActiveRefs, refs]);

  return React.useCallback((node: T | null) => {
    detachActiveRefs();
    nodeRef.current = node;

    if (node == null) return;

    attachActiveRefs(node);
  }, [attachActiveRefs, detachActiveRefs]);
}

function setRef<T>(
  ref: React.Ref<T> | undefined,
  value: T | null,
): (() => void) | undefined {
  if (typeof ref === 'function') {
    const cleanup = ref(value);

    if (typeof cleanup === 'function') {
      return cleanup;
    }

    return;
  }

  if (ref != null) {
    ref.current = value;
    return () => {
      ref.current = null;
    };
  }
}
