import React from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react-native';
import { useEntry } from '~/hooks/useGratitude';
import { MOOD_OPTIONS } from '~/constants';
import { filterExistingPhotos } from '~/lib/photoUtils';
import { formatLocalizedDate, useTranslation } from '~/lib/i18n';
import { useSettingsStore } from '~/lib/settings';
import {
  getSharePalette,
  isShareThemeId,
  type SharePalette,
} from '~/lib/sharing/share-palettes';
import { SHARE_OUTPUTS, type ShareOutput } from '~/lib/sharing/share-layouts';
import { useShareImage } from '~/lib/sharing/use-share-image';
import { SafeAreaView } from '~/components/ui/safe-area-view';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Switch } from '~/components/ui/switch';
import { Text } from '~/components/ui/text';
import { ThemeBackdrop } from '~/components/backdrops/ThemeBackdrop';
import { EntryShareCard } from '~/components/sharing/entry-share-card';
import { SharePaletteGrid } from '~/components/sharing/share-palette-grid';

export function EntryShareScreen({ noteId }: { noteId?: string }) {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const activeTheme = useSettingsStore((state) => state.theme);
  const { data: entry, isLoading, isError, refetch } = useEntry(noteId);
  const captureRef = React.useRef<View>(null);
  const [includeMood, setIncludeMood] = React.useState(false);
  const [includePhotos, setIncludePhotos] = React.useState(false);
  const [captureReady, setCaptureReady] = React.useState(false);
  const [output, setOutput] = React.useState<ShareOutput>(SHARE_OUTPUTS.square);
  const [palette, setPalette] = React.useState<SharePalette>(() =>
    getSharePalette(isShareThemeId(activeTheme) ? activeTheme : 'light'),
  );
  const { isAvailable: sharingAvailable, isSharing, share } = useShareImage();

  useFocusEffect(
    React.useCallback(() => {
      // Navigation may keep a previous composer mounted in the stack. Reset
      // sensitive inclusion choices on every focus, not just first mount.
      // Capture readiness belongs to the card — it re-reports whenever these
      // switches change what has to be measured.
      setIncludeMood(false);
      setIncludePhotos(false);
    }, []),
  );

  const handleReadyChange = React.useCallback((ready: boolean) => {
    setCaptureReady(ready);
  }, []);
  const handleOutputChange = React.useCallback((next: ShareOutput) => {
    setOutput(next);
  }, []);

  // The card enforces its own five-photo cap; this list only decides whether the
  // "Include photos" switch is offered at all.
  const photos = React.useMemo(
    () => filterExistingPhotos(entry?.assets ?? null),
    [entry?.assets],
  );
  const moodOption = entry?.mood
    ? MOOD_OPTIONS.find((option) => option.value === entry.mood)
    : null;

  const handleShare = React.useCallback(async () => {
    if (!entry) return;
    await share({
      ref: captureRef,
      dialogTitle: t('Share your gratitude'),
      filenamePrefix: 'tackbok-gratitude',
      width: output.width,
      height: output.height,
      isReady: captureReady,
      logLabel: 'Entry image sharing failed',
    });
  }, [captureReady, entry, output.height, output.width, share, t]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ThemeBackdrop />
      <View className="flex-row items-center border-b border-border px-4 py-2">
        <View className="w-12">
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel={t('Back')}
            onPress={() => router.back()}>
            <Icon as={isRTL ? ArrowRight : ArrowLeft} />
          </Button>
        </View>
        <Text className="flex-1 text-center text-lg font-body-bold text-foreground">
          {t('Share your gratitude')}
        </Text>
        <View className="w-12 items-end">
          <Button
            variant="ghost"
            size="icon"
            disabled={!entry || !captureReady || isSharing || sharingAvailable !== true}
            accessibilityLabel={t('Share image')}
            onPress={() => void handleShare()}>
            {isSharing ? <ActivityIndicator size="small" /> : <Icon as={Check} />}
          </Button>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="text-center text-muted-foreground">{t('Unknown error')}</Text>
          <Button onPress={() => refetch()}>
            <Text>{t('Retry')}</Text>
          </Button>
        </View>
      ) : !entry ? (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="text-center text-muted-foreground">
            {t('Entry not found')}
          </Text>
          <Button variant="outline" onPress={() => router.back()}>
            <Text>{t('Back')}</Text>
          </Button>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="gap-5 px-4 pt-4 pb-safe-or-12">
          <EntryShareCard
            ref={captureRef}
            dateLabel={formatLocalizedDate(entry.created_at, t, { relative: true })}
            title={entry.text_title?.trim() || t('I was grateful for')}
            body={entry.text_content}
            moodLabel={moodOption ? t(`Feeling ${moodOption.label}`) : null}
            moodEmoji={moodOption?.emoji}
            photos={photos}
            includeMood={includeMood}
            includePhotos={includePhotos}
            isRTL={isRTL}
            palette={palette}
            onReadyChange={handleReadyChange}
            onOutputChange={handleOutputChange}
          />

          <View className="self-center rounded-full border border-border bg-card px-3 py-1">
            <Text className="text-xs text-muted-foreground">{output.label}</Text>
          </View>

          {entry.mood && moodOption ? (
            <View className="flex-row items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
              <View className="flex-1 gap-1">
                <Text className="font-body-semibold text-foreground">
                  {t('Include mood')}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {t('Mood is hidden unless you include it')}
                </Text>
              </View>
              <Switch
                checked={includeMood}
                onCheckedChange={setIncludeMood}
                accessibilityLabel={t('Include mood')}
              />
            </View>
          ) : null}

          {photos.length > 0 ? (
            <View className="flex-row items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
              <View className="flex-1 gap-1">
                <Text className="font-body-semibold text-foreground">
                  {t('Include photos')}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {t('Up to the first five photos will be shared')}
                </Text>
              </View>
              <Switch
                checked={includePhotos}
                onCheckedChange={setIncludePhotos}
                accessibilityLabel={t('Include photos')}
              />
            </View>
          ) : null}

          <View className="gap-3">
            <Text className="text-lg font-body-bold text-foreground">
              {t('Choose a style')}
            </Text>
            <SharePaletteGrid selectedId={palette.id} onSelect={setPalette} />
          </View>

          {sharingAvailable === false ? (
            <Text className="text-center text-sm text-destructive">
              {t('Sharing is not available on this device')}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
