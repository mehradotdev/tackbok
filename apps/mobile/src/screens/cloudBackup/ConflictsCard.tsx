import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { FileClock } from 'lucide-react-native';
import { formatLocalizedDate, useTranslation } from '~/lib/i18n';
import { getFullPhotoUri } from '~/lib/photoUtils';
import {
  acknowledgeCloudConflicts,
  resolveNameConflict,
  resolvePhotoConflict,
  type CloudConflictItem,
} from '~/lib/cloudSync/ui';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { toast } from '~/components/ui/toast';
import { activeConflictItems, useCloudConflictItems } from './useCloudConflictItems';

type NameItem = Extract<CloudConflictItem, { kind: 'name' }>;
type ReturnedEntryItem = Extract<CloudConflictItem, { kind: 'returnedEntry' }>;

/**
 * Returned entries listed one by one. Beyond this, e.g. after joining with
 * many entries another device deleted, one row covers them all.
 */
const MAX_RETURNED_ENTRY_ROWS = 3;

/**
 * Conflicts this device can act on. Each row is dismissed by its own action;
 * records with nothing to act on are not listed (see `deriveConflictItems`).
 * The list reloads whenever `refreshToken` changes (see `useCloudConflictItems`).
 */
export function ConflictsCard({ refreshToken }: { refreshToken: unknown }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { items, loadFailed, refresh } = useCloudConflictItems(refreshToken);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      try {
        await action();
      } catch {
        toast.error(t('cloud.cloudBackupCouldNotBeUpdated'));
      } finally {
        await refresh();
        if (mountedRef.current) setBusy(false);
      }
    },
    [busy, refresh, t],
  );

  const archivedNames = items.filter(
    (item): item is NameItem => item.kind === 'name' && item.archived,
  );
  const activeItems = activeConflictItems(items);
  const returnedItems = activeItems.filter(
    (item): item is ReturnedEntryItem => item.kind === 'returnedEntry',
  );
  const collapseReturned = returnedItems.length > MAX_RETURNED_ENTRY_ROWS;
  if (!loadFailed && items.length === 0) return null;

  const nameMessage = (item: NameItem) =>
    item.other === null
      ? t('cloud.conflicts.nameRemoved', { current: item.current ?? '' })
      : item.current === null
        ? t('cloud.conflicts.nameChangedNoCurrent', { other: item.other })
        : t('cloud.conflicts.nameChanged', { current: item.current, other: item.other });

  const nameRow = (item: NameItem) => {
    const useLabel =
      item.other === null
        ? t('cloud.conflicts.removeName')
        : t('cloud.conflicts.useName', { name: item.other });
    return (
      <View key={item.conflictIds.join(',')} className="gap-2">
        <Text className="text-sm text-foreground">{nameMessage(item)}</Text>
        <View className="flex-row flex-wrap gap-2">
          {/* A name can be long: let the button wrap within the card. */}
          <Button
            variant="outline"
            className="h-auto min-h-10 max-w-full py-2"
            accessibilityLabel={useLabel}
            disabled={busy}
            onPress={() => void run(() => resolveNameConflict(item, 'use'))}>
            <Text className="shrink text-center" numberOfLines={3}>
              {useLabel}
            </Text>
          </Button>
          <Button
            variant="ghost"
            className="h-auto min-h-10 max-w-full py-2"
            disabled={busy}
            onPress={() => void run(() => resolveNameConflict(item, 'keep'))}>
            <Text className="shrink text-center">{t('cloud.conflicts.keepCurrent')}</Text>
          </Button>
        </View>
      </View>
    );
  };

  const returnedEntryRow = (item: ReturnedEntryItem) => {
    const { entry } = item;
    const date = formatLocalizedDate(entry.createdAt, t);
    return (
      <View key={item.conflictIds.join(',')} className="gap-2">
        <Text className="text-sm text-foreground">
          {item.edited
            ? t('cloud.conflicts.entryReturned')
            : t('cloud.conflicts.entryKept')}
        </Text>
        {/* One stop for screen readers: which entry this is. */}
        <View
          accessible
          accessibilityLabel={[date, entry.title, entry.preview]
            .filter(Boolean)
            .join(', ')}
          className="gap-1 rounded-md border border-border p-3">
          <Text className="text-sm text-muted-foreground">{date}</Text>
          {entry.title ? (
            <Text className="font-body-semibold text-foreground" numberOfLines={2}>
              {entry.title}
            </Text>
          ) : null}
          {entry.preview ? (
            <Text className="text-sm text-foreground" numberOfLines={2}>
              {entry.preview}
            </Text>
          ) : null}
        </View>
        <View className="flex-row flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-auto min-h-10 max-w-full py-2"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await acknowledgeCloudConflicts(item.conflictIds);
                router.push({
                  pathname: '/gratitudeEntry/[noteId]',
                  params: { noteId: entry.entryId },
                });
              })
            }>
            <Text className="shrink text-center">{t('cloud.conflicts.openEntry')}</Text>
          </Button>
          <Button
            variant="ghost"
            className="h-auto min-h-10 max-w-full py-2"
            disabled={busy}
            onPress={() => void run(() => acknowledgeCloudConflicts(item.conflictIds))}>
            <Text className="shrink text-center">{t('cloud.conflicts.gotIt')}</Text>
          </Button>
        </View>
      </View>
    );
  };

  return (
    <View className="rounded-lg border border-border bg-card p-4 gap-4">
      <View className="flex-row items-center gap-2">
        <Icon as={FileClock} className="text-foreground size-5" />
        <Text role="heading" className="font-body-bold text-foreground">
          {t('cloud.conflicts.title')}
        </Text>
      </View>
      {loadFailed && (
        <View className="gap-2">
          <Text className="text-sm text-foreground">
            {t('cloud.conflicts.loadFailed')}
          </Text>
          <Button variant="outline" className="self-start" onPress={() => void refresh()}>
            <Text>{t('common.retry')}</Text>
          </Button>
        </View>
      )}
      {activeItems.map((item) => {
        const key = item.conflictIds.join(',');
        if (item.kind === 'name') return nameRow(item);
        if (item.kind === 'returnedEntry') {
          return collapseReturned ? null : returnedEntryRow(item);
        }
        if (item.kind === 'photo') {
          return (
            <View key={key} className="gap-2">
              <View className="flex-row items-center gap-3">
                <Image
                  source={{ uri: getFullPhotoUri(item.otherUri) }}
                  className="w-12 h-12 rounded-full bg-muted"
                  accessibilityLabel={t('cloud.conflicts.otherPhoto')}
                />
                <Text className="flex-1 text-sm text-foreground">
                  {t('cloud.conflicts.photoChanged')}
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="h-auto min-h-10 max-w-full py-2"
                  disabled={busy}
                  onPress={() => void run(() => resolvePhotoConflict(item, 'use'))}>
                  <Text className="shrink text-center">
                    {t('cloud.conflicts.usePhoto')}
                  </Text>
                </Button>
                <Button
                  variant="ghost"
                  className="h-auto min-h-10 max-w-full py-2"
                  disabled={busy}
                  onPress={() => void run(() => resolvePhotoConflict(item, 'keep'))}>
                  <Text className="shrink text-center">
                    {t('cloud.conflicts.keepCurrent')}
                  </Text>
                </Button>
              </View>
            </View>
          );
        }
        return (
          <View key={key} className="gap-2">
            <Text className="text-sm text-foreground">
              {t('cloud.conflicts.entriesEdited', {
                count: item.recoveredEntryIds.length,
              })}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <Button
                variant="outline"
                className="h-auto min-h-10 max-w-full py-2"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await acknowledgeCloudConflicts(item.conflictIds);
                    router.push('/other-versions' as Href);
                  })
                }>
                <Text className="shrink text-center">
                  {t('cloud.conflicts.showThem')}
                </Text>
              </Button>
            </View>
          </View>
        );
      })}
      {collapseReturned && (
        <View className="gap-2">
          <Text className="text-sm text-foreground">
            {t('cloud.conflicts.entriesReturned', { count: returnedItems.length })}
          </Text>
          <Button
            variant="ghost"
            className="h-auto min-h-10 max-w-full self-start py-2"
            disabled={busy}
            onPress={() =>
              void run(() =>
                acknowledgeCloudConflicts(
                  returnedItems.flatMap((item) => item.conflictIds),
                ),
              )
            }>
            <Text className="shrink text-center">{t('cloud.conflicts.gotIt')}</Text>
          </Button>
        </View>
      )}
      {archivedNames.length > 0 && (
        <View className="gap-4">
          <Button
            variant="ghost"
            className="h-auto min-h-10 max-w-full self-start py-2"
            aria-expanded={showArchived}
            onPress={() => setShowArchived((shown) => !shown)}>
            <Text className="shrink text-center">
              {showArchived
                ? t('cloud.conflicts.hideOlderNames')
                : t('cloud.conflicts.showOlderNames')}
            </Text>
          </Button>
          {showArchived && (
            <>
              <Text className="text-sm text-muted-foreground">
                {t('cloud.conflicts.olderNamesDescription')}
              </Text>
              {archivedNames.map(nameRow)}
            </>
          )}
        </View>
      )}
    </View>
  );
}
