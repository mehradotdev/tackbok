import React from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import { useTranslation, formatLocalizedNumber } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import { getTitleFont, resolveTitleFontId } from '~/lib/theme/typography';
import { useAchievementDialogStore } from '~/lib/achievement-dialog';
import { getSharePalette } from '~/lib/sharing/share-palettes';
import { ACHIEVEMENT_SHARE_OUTPUT } from '~/lib/sharing/share-layouts';
import { useShareImage } from '~/lib/sharing/use-share-image';
import { AchievementShareCard } from '~/components/sharing/achievement-share-card';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '~/components/ui/dialog';

/** Time the iOS full-window overlay needs to finish its exit transition. */
const OVERLAY_EXIT_MS = 200;

export function AchievementDialogHost() {
  const { t, locale } = useTranslation();
  const theme = useSettingsStore((state) => state.theme);
  const titleFont = useSettingsStore((state) => state.titleFont);
  const pendingAchievement = useSettingsStore((state) => state.pendingAchievement);
  const setPendingAchievement = useSettingsStore((state) => state.setPendingAchievement);
  const manualAchievement = useAchievementDialogStore((state) => state.manualAchievement);
  const closeManualAchievement = useAchievementDialogStore(
    (state) => state.closeManualAchievement,
  );
  const achievement = manualAchievement ?? pendingAchievement;
  const isManual = manualAchievement !== null;
  const palette = getSharePalette(theme);
  const titleFontFamily = getTitleFont(resolveTitleFontId(theme, titleFont)).fontFamily;
  const captureRef = React.useRef<View>(null);
  const [visible, setVisible] = React.useState(false);
  const [captureReady, setCaptureReady] = React.useState(false);
  const lastHapticAchievement = React.useRef<string | null>(null);
  // The host is mounted for the whole session; only probe once it has something
  // to show.
  const {
    isAvailable: sharingAvailable,
    isSharing,
    share,
  } = useShareImage({ enabled: visible });

  React.useEffect(() => {
    let idleHandle: ReturnType<typeof requestIdleCallback> | null = null;
    const transitionTimer = setTimeout(
      () => {
        idleHandle = requestIdleCallback(() => setVisible(Boolean(achievement)), {
          timeout: 500,
        });
      },
      achievement ? 250 : 0,
    );
    return () => {
      clearTimeout(transitionTimer);
      if (idleHandle !== null) cancelIdleCallback(idleHandle);
    };
  }, [achievement]);

  React.useEffect(() => {
    if (!visible) return;
    if (
      Platform.OS === 'ios' &&
      !isManual &&
      achievement &&
      lastHapticAchievement.current !== achievement.id
    ) {
      lastHapticAchievement.current = achievement.id;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [achievement, isManual, visible]);

  const clearAchievement = React.useCallback(() => {
    setVisible(false);
    setCaptureReady(false);
    if (isManual) closeManualAchievement();
    else setPendingAchievement(null);
  }, [closeManualAchievement, isManual, setPendingAchievement]);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (!open && visible) clearAchievement();
    },
    [clearAchievement, visible],
  );

  const handleReadyChange = React.useCallback((ready: boolean) => {
    setCaptureReady(ready);
  }, []);

  const handleShare = React.useCallback(async () => {
    if (!achievement) return;
    let hiddenForNativeShare = false;

    const result = await share({
      ref: captureRef,
      dialogTitle: t('Share achievement'),
      filenamePrefix: 'tackbok-achievement',
      width: ACHIEVEMENT_SHARE_OUTPUT.width,
      height: ACHIEVEMENT_SHARE_OUTPUT.height,
      isReady: captureReady,
      logLabel: 'Achievement image sharing failed',
      beforePresentShareSheet:
        Platform.OS === 'ios'
          ? async () => {
              // The activity controller would otherwise present behind this
              // dialog's full-window overlay.
              hiddenForNativeShare = true;
              setVisible(false);
              await new Promise<void>((resolve) => setTimeout(resolve, OVERLAY_EXIT_MS));
            }
          : undefined,
    });

    if (result === 'shared') clearAchievement();
    // Sharing failed after the handoff already hid the dialog — bring it back so
    // the celebration is still there to retry.
    else if (hiddenForNativeShare) setVisible(true);
  }, [achievement, captureReady, clearAchievement, share, t]);

  if (!achievement) return null;

  const isFirstDay = achievement.variant === 'first-day';
  const numberLabel = formatLocalizedNumber(achievement.journaledDays, locale);
  const title = isFirstDay
    ? t('Day one complete!')
    : t('{count} days of gratitude!', { count: numberLabel });
  const message = isFirstDay
    ? t('A beautiful beginning. Keep noticing the good.')
    : t('Congratulations on making gratitude part of your journey.');

  return (
    <Dialog open={visible} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="w-[92%] max-w-sm gap-4 p-4">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{message}</DialogDescription>
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 z-10 rounded-full bg-background/80"
          accessibilityLabel={t('Close')}
          onPress={clearAchievement}>
          <Icon as={X} size={18} />
        </Button>

        <AchievementShareCard
          ref={captureRef}
          achievement={achievement}
          palette={palette}
          numberLabel={numberLabel}
          title={title}
          message={message}
          titleFontFamily={titleFontFamily}
          onReadyChange={handleReadyChange}
        />

        <Button
          variant="primary"
          size="lg"
          disabled={!captureReady || isSharing || sharingAvailable !== true}
          onPress={() => void handleShare()}>
          {isSharing ? <ActivityIndicator size="small" /> : null}
          <Text>{t('Share achievement')}</Text>
        </Button>
        {sharingAvailable === false ? (
          <Text className="text-center text-sm text-destructive">
            {t('Sharing is not available on this device')}
          </Text>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
