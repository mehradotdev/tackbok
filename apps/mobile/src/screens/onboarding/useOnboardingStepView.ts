import { useEffect } from 'react';
import { track } from '~/lib/analytics';

/** Emits `onboarding_step_viewed` once when the screen mounts. */
export function useOnboardingStepView(step: string) {
  useEffect(() => {
    track('onboarding_step_viewed', { step });
  }, [step]);
}
