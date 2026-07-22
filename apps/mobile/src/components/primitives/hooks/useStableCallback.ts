import * as React from 'react';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

/**
 * Stable callback that always calls the latest version of `callback`.
 *
 * Unlike React's `useEffectEvent`, this is safe to call from anywhere
 * (event handlers, imperative methods), so it must not share that name —
 * the react-hooks lint enforces `useEffectEvent`'s stricter contract by name.
 */
export function useStableCallback<TArgs extends readonly unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const callbackRef = React.useRef(callback);

  useIsomorphicLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return React.useCallback((...args: TArgs): TResult => {
    return callbackRef.current(...args);
  }, []);
}
