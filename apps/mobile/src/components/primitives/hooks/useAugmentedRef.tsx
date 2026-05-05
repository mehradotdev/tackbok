import * as React from 'react';

interface AugmentRefProps<T> {
  ref: React.Ref<T>;
  methods?: Record<string, (...args: unknown[]) => unknown>;
}

/**
 * @deprecated Use useComposedRefs for new code. This hook remains only for
 * backwards compatibility with the older imperative ref augmentation pattern.
 */
export function useAugmentedRef<T>({ ref, methods }: AugmentRefProps<T>) {
  const augmentedRef = React.useRef<T>(null);

  React.useImperativeHandle(ref, () => {
    if (typeof augmentedRef === 'function' || !augmentedRef?.current) {
      return {} as T;
    }
    return {
      ...augmentedRef.current,
      ...methods,
    };
  }, [methods]);

  return augmentedRef;
}
