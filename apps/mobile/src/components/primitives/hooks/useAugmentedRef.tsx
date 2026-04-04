import * as React from 'react';

interface AugmentRefProps<T> {
  ref?: React.Ref<T>;
  methods?: Record<string, (...args: any[]) => any>;
}

export function useAugmentedRef<T>({ ref, methods }: AugmentRefProps<T>) {
  const augmentedRef = React.useRef<T>(null);

  React.useImperativeHandle(
    ref,
    () => {
      if (!augmentedRef.current) {
        return {} as T;
      }

      return {
        ...augmentedRef.current,
        ...methods,
      };
    },
  );

  return augmentedRef;
}
