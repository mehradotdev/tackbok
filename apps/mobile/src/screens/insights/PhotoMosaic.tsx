import { useMemo } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getFullPhotoUri } from '~/lib/photoUtils';
import { formatLocalizedDate, useTranslation } from '~/lib/i18n';
import type { InsightsStats } from '~/lib/insights';
import { InsightsSection } from './shared';

/** 3-column grid of the most recent photos; each links to its entry. Self-gating. */
export function PhotoMosaic({ stats }: { stats: InsightsStats }) {
  const router = useRouter();
  const { t } = useTranslation();

  const photos = useMemo(
    () =>
      stats.recentPhotos.flatMap((photo, index) => {
        try {
          return [{ ...photo, fullUri: getFullPhotoUri(photo.uri), key: `${photo.noteId}-${index}` }];
        } catch {
          // Legacy/invalid URIs (e.g. pre-migration absolute paths) — skip.
          return [];
        }
      }),
    [stats.recentPhotos],
  );

  if (photos.length === 0) return null;

  return (
    <InsightsSection title={t('Your memories')}>
      <View className="flex-row flex-wrap -m-0.5">
      {photos.map((photo) => (
        <Pressable
          key={photo.key}
          className="w-1/3 p-0.5"
          accessibilityRole="imagebutton"
          accessibilityLabel={formatLocalizedDate(photo.dateMs, t)}
          onPress={() =>
            router.push({
              pathname: '/gratitudeEntry/[noteId]',
              params: { noteId: photo.noteId },
            })
          }>
          <Image
            source={{ uri: photo.fullUri }}
            className="w-full aspect-square rounded-md bg-muted/40"
            resizeMode="cover"
          />
        </Pressable>
      ))}
      </View>
    </InsightsSection>
  );
}
