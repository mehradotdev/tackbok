import React from 'react';
import type { View } from 'react-native';
import { useTranslation } from '~/lib/i18n';
import { toast } from '~/components/ui/toast';
import {
  isNativeSharingAvailable,
  shareViewAsPng,
  SharingUnavailableError,
} from './share-image';

export type ShareResult = 'shared' | 'busy' | 'unavailable' | 'failed';

type ShareRequest = {
  ref: React.RefObject<View | null>;
  dialogTitle: string;
  filenamePrefix: string;
  width: number;
  height: number;
  isReady: boolean;
  beforePresentShareSheet?: () => Promise<void>;
  /** Content-free console label; never pass entry text, ids, or file paths. */
  logLabel: string;
};

/**
 * Owns everything both share surfaces need around `shareViewAsPng`: the native
 * availability probe, the busy flag, and localized error reporting. Keeping it
 * in one place stops the achievement dialog and the entry composer from
 * drifting apart on guards and error handling.
 */
export function useShareImage({ enabled = true }: { enabled?: boolean } = {}) {
  const { t } = useTranslation();
  const mountedRef = React.useRef(true);
  const [isSharing, setIsSharing] = React.useState(false);
  const [isAvailable, setIsAvailable] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    let active = true;
    void isNativeSharingAvailable()
      .then((available) => {
        if (active) setIsAvailable(available);
      })
      .catch(() => {
        if (active) setIsAvailable(false);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  const share = React.useCallback(
    async ({ logLabel, ...options }: ShareRequest): Promise<ShareResult> => {
      if (isSharing) return 'busy';
      if (isAvailable === false) {
        toast.error(t('Sharing is not available on this device'));
        return 'unavailable';
      }

      setIsSharing(true);
      try {
        return await shareViewAsPng(options);
      } catch (error) {
        if (error instanceof SharingUnavailableError) {
          if (mountedRef.current) setIsAvailable(false);
          toast.error(t('Sharing is not available on this device'));
          return 'unavailable';
        }
        console.error(logLabel);
        toast.error(t('Could not share image. Please try again.'));
        return 'failed';
      } finally {
        if (mountedRef.current) setIsSharing(false);
      }
    },
    [isAvailable, isSharing, t],
  );

  return { isAvailable, isSharing, share };
}
