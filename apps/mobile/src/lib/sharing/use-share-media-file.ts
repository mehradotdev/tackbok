import React from 'react';
import { useTranslation } from '~/lib/i18n';
import type { TranslationKey } from '~/lib/i18n/types';
import { toast } from '~/components/ui/toast';
import { SharingUnavailableError } from './share-image';
import { shareMediaFile } from './share-media-file';

type UseShareMediaFileOptions = {
  failureMessage: TranslationKey;
  /** Set when sharing from inside a React Native `<Modal>` so Android toasts stay visible. */
  toastInModal?: boolean;
};

/** Wraps `shareMediaFile` with the busy flag and localized error toasts. */
export function useShareMediaFile({
  failureMessage,
  toastInModal,
}: UseShareMediaFileOptions) {
  const { t } = useTranslation();
  const mountedRef = React.useRef(true);
  const [isSharing, setIsSharing] = React.useState(false);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const share = React.useCallback(
    async (options: Parameters<typeof shareMediaFile>[0]) => {
      setIsSharing(true);
      try {
        await shareMediaFile(options);
      } catch (error) {
        const toastOptions = toastInModal ? { useModal: true } : undefined;
        if (error instanceof SharingUnavailableError) {
          toast.error(t('sharing.sharingIsNotAvailableOnThisDevice'), toastOptions);
        } else {
          // Content-free label; never log file paths.
          console.error('Failed to share media file');
          toast.error(t(failureMessage), toastOptions);
        }
      } finally {
        if (mountedRef.current) setIsSharing(false);
      }
    },
    [failureMessage, t, toastInModal],
  );

  return { isSharing, share };
}
