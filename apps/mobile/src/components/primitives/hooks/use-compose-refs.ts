import * as React from 'react';

export function useComposedRefs<T>(
  ...refs: (React.Ref<T> | undefined)[]
): React.RefCallback<T> {
  const refsRef = React.useRef(refs);
  const cleanupsRef = React.useRef<(() => void)[]>([]);

  refsRef.current = refs;

  return React.useCallback((node: T | null) => {
    cleanupsRef.current.forEach((cleanup) => cleanup());
    cleanupsRef.current = [];

    if (node == null) {
      refsRef.current.forEach((ref) => {
        if (typeof ref === 'function') {
          ref(null);
        } else if (ref != null) {
          ref.current = null;
        }
      });
      return;
    }

    cleanupsRef.current = refsRef.current
      .map((ref) => setRef(ref, node))
      .filter((cleanup): cleanup is () => void => cleanup != null);
  }, []);
}

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null): (() => void) | void {
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
