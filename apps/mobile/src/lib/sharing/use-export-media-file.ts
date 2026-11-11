import React from 'react';
import { Platform } from 'react-native';
import { Download, Share2 } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import type { TranslationKey } from '~/lib/i18n/types';
import { toast } from '~/components/ui/toast';
import { SharingUnavailableError } from './share-image';
import { exportMediaFile } from './export-media-file';

type MediaKind = 'image' | 'voiceNote';

const MESSAGES: Record<
  MediaKind,
  Record<'save' | 'share', { label: TranslationKey; failure: TranslationKey }>
> = {
  image: {
    save: { label: 'sharing.saveImage', failure: 'sharing.couldNotSavePleaseTryAgain' },
    share: {
      label: 'sharing.shareImage',
      failure: 'sharing.couldNotShareImagePleaseTryAgain',
    },
  },
  voiceNote: {
    save: {
      label: 'sharing.saveVoiceNote',
      failure: 'sharing.couldNotSavePleaseTryAgain',
    },
    share: {
      label: 'sharing.shareVoiceNote',
      failure: 'sharing.couldNotShareVoiceNotePleaseTryAgain',
    },
  },
};

type UseExportMediaFileOptions = {
  kind: MediaKind;
  /** Set when exporting from inside a React Native `<Modal>` so Android toasts stay visible. */
  toastInModal?: boolean;
};

/**
 * Wraps `exportMediaFile` with the busy flag, localized error toasts, and the
 * platform's button: "Save" with a download icon on Android, "Share" on iOS.
 */
export function useExportMediaFile({ kind, toastInModal }: UseExportMediaFileOptions) {
  const { t } = useTranslation();
  const mountedRef = React.useRef(true);
  // Synchronous guard: a second tap can land before `isExporting` disables the button,
  // and must not clear the busy state while the first export is still open.
  const inFlightRef = React.useRef(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const mode = Platform.OS === 'android' ? 'save' : 'share';
  const messages = MESSAGES[kind][mode];

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const exportFile = React.useCallback(
    async (fileUri: string) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setIsExporting(true);
      const toastOptions = toastInModal ? { useModal: true } : undefined;
      try {
        const result = await exportMediaFile({
          fileUri,
          filenamePrefix: kind === 'image' ? 'tackbok-photo' : 'tackbok-voice-note',
          dialogTitle: t(messages.label),
        });
        // Only Android's save dialog confirms the outcome; the iOS share sheet
        // resolves the same way whether the user picked a target or dismissed it.
        if (result === 'saved') toast.success(t('sharing.saved'), toastOptions);
      } catch (error) {
        if (error instanceof SharingUnavailableError) {
          toast.error(t('sharing.sharingIsNotAvailableOnThisDevice'), toastOptions);
        } else {
          // Content-free label; never log file paths.
          console.error('Failed to export media file');
          toast.error(t(messages.failure), toastOptions);
        }
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setIsExporting(false);
      }
    },
    [kind, messages, t, toastInModal],
  );

  return {
    isExporting,
    exportFile,
    label: t(messages.label),
    icon: mode === 'save' ? Download : Share2,
  };
}
