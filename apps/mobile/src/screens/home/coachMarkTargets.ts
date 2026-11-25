import { useEffect, useRef } from 'react';
import type { View } from 'react-native';

type ViewHandle = React.ComponentRef<typeof View>;

/** Home controls the coach marks point at. */
export type CoachMarkTarget = 'dock' | 'entry' | 'search';

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const targets = new Map<CoachMarkTarget, { current: ViewHandle | null }>();

/**
 * Registers a control so the Home coach marks can find it on screen. Put the
 * returned ref on a host view that layout won't flatten (`collapsable={false}`).
 * Only one view holds a key at a time; pass `enabled: false` from the others.
 */
export function useCoachMarkTarget(key: CoachMarkTarget, enabled = true) {
  const ref = useRef<ViewHandle>(null);
  useEffect(() => {
    if (!enabled) return;
    targets.set(key, ref);
    return () => {
      if (targets.get(key) === ref) targets.delete(key);
    };
  }, [key, enabled]);
  return ref;
}

/** Where a registered control is now, in window coordinates; null if absent. */
export function measureCoachMarkTarget(key: CoachMarkTarget): Promise<TargetRect | null> {
  const view = targets.get(key)?.current;
  if (!view) return Promise.resolve(null);
  return new Promise((resolve) => {
    view.measureInWindow((x, y, width, height) =>
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null),
    );
  });
}
