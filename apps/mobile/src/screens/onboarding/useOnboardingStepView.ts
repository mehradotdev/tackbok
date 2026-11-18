import { useEffect } from 'react';
import { track } from '~/lib/analytics';
import type { OnboardingStep } from '~/lib/analytics/events';

/** Emits `onboarding_step_viewed` once when the screen mounts. */
export function useOnboardingStepView(step: OnboardingStep) {
  useEffect(() => {
    track('onboarding_step_viewed', { step });
  }, [step]);
}
