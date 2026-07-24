import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { startPreConsentBuffering, stopPreConsentBuffering } from '~/lib/analytics';

export default function OnboardingLayout() {
  // Arm buffering in a lazy state initializer: it runs during the first render,
  // before child screens mount and emit their first onboarding_step_viewed
  // events (child effects run before parent effects, so an effect here would be
  // too late) — and exactly once per mount, because the layout re-renders on
  // every navigation change and re-arming after the Privacy screen drained the
  // buffer would swallow post-consent events.
  useState(() => {
    startPreConsentBuffering();
    return null;
  });

  useEffect(() => {
    return () => {
      // Non-accept exits evaporate the buffer. After an accept it has already
      // been drained into the SDK, so this is a harmless no-op.
      stopPreConsentBuffering();
    };
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
