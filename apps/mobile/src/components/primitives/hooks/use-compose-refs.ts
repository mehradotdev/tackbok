import * as React from 'react';

export function useComposedRefs<T>(
  ...refs: (React.Ref<T> | undefined)[]
): React.RefCallback<T> {
  const refsRef = React.useRef(refs);
  const cleanupsRef = React.useRef<((() => void) | undefined)[]>([]);

  refsRef.current = refs;

  return React.useCallback((node: T | null) => {
    const previousCleanups = cleanupsRef.current;
    previousCleanups.forEach((cleanup) => cleanup?.());
    cleanupsRef.current = [];

    if (node == null) {
      refsRef.current.forEach((ref, index) => {
        if (typeof ref === 'function') {
          if (previousCleanups[index] == null) {
            ref(null);
          }
        } else if (ref != null) {
          ref.current = null;
        }
      });
      return;
    }

    cleanupsRef.current = refsRef.current.map((ref) => setRef(ref, node));
  }, []);
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
