import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Lets a step's buttons move on only once, so a fast double tap can't push
 * the next screen twice. It frees up again when the step regains focus (the
 * user came back) or when the action reports it didn't navigate by
 * returning false or rejecting.
 */
export function useNavigateOnce() {
  const busy = useRef(false);

  useFocusEffect(
    useCallback(() => {
      busy.current = false;
    }, []),
  );

  return useCallback((action: () => void | boolean | Promise<void | boolean>) => {
    if (busy.current) return;
    busy.current = true;
    void Promise.resolve(action()).then(
      (result) => {
        if (result === false) busy.current = false;
      },
      (error: unknown) => {
        busy.current = false;
        throw error;
      },
    );
  }, []);
}
