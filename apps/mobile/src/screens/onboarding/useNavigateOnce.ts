import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Lets a step's buttons move on only once, so a fast double tap can't push
 * the next screen twice. It frees up again when the step regains focus (the
 * user came back) or when the action reports it didn't navigate by
 * returning false, throwing or rejecting.
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
    let result: ReturnType<typeof action>;
    try {
      result = action();
    } catch (error) {
      busy.current = false;
      throw error;
    }
    void Promise.resolve(result).then(
      (value) => {
        if (value === false) busy.current = false;
      },
      (error: unknown) => {
        busy.current = false;
        console.error('[onboarding] Step action failed', error);
      },
    );
  }, []);
}
