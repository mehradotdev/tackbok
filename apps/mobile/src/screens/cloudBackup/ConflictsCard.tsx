import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { FileClock } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { getFullPhotoUri } from '~/lib/photoUtils';
import {
  acknowledgeCloudConflicts,
  listCloudConflictItems,
  resolveNameConflict,
  resolvePhotoConflict,
  type CloudConflictItem,
} from '~/lib/cloudSync/ui';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { toast } from '~/components/ui/toast';

type NameItem = Extract<CloudConflictItem, { kind: 'name' }>;

/**
 * Conflicts this device can act on. Each row is dismissed by its own action;
 * records with nothing to act on are not listed (see `deriveConflictItems`).
 */
export function ConflictsCard({ refreshKey }: { refreshKey: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<CloudConflictItem[]>([]);
  const [busy, setBusy] = useState(false);
  const sequenceRef = useRef(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const sequence = ++sequenceRef.current;
    const next = await listCloudConflictItems();
    if (mountedRef.current && sequence === sequenceRef.current) setItems(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh, refreshKey]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      try {
        await action();
      } catch {
        toast.error(t('cloud.cloudBackupCouldNotBeUpdated'));
      } finally {
        await refresh().catch(() => {});
        if (mountedRef.current) setBusy(false);
      }
    },
    [busy, refresh, t],
  );

  if (items.length === 0) return null;

  const nameMessage = (item: NameItem) =>
    item.other === null
      ? t('cloud.conflicts.nameRemoved', { current: item.current ?? '' })
      : item.current === null
        ? t('cloud.conflicts.nameChangedNoCurrent', { other: item.other })
        : t('cloud.conflicts.nameChanged', { current: item.current, other: item.other });

  return (
    <View className="rounded-lg border border-border bg-card p-4 gap-4">
      <View className="flex-row items-center gap-2">
        <Icon as={FileClock} className="text-foreground size-5" />
        <Text role="heading" className="font-body-bold text-foreground">
          {t('cloud.conflicts.title')}
        </Text>
      </View>
      {items.map((item) => {
        const key = item.conflictIds.join(',');
        if (item.kind === 'name') {
          return (
            <View key={key} className="gap-2">
              <Text className="text-sm text-foreground">{nameMessage(item)}</Text>
              <View className="flex-row flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onPress={() => void run(() => resolveNameConflict(item, 'use'))}>
                  <Text>
                    {item.other === null
                      ? t('cloud.conflicts.removeName')
                      : t('cloud.conflicts.useName', { name: item.other })}
                  </Text>
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onPress={() => void run(() => resolveNameConflict(item, 'keep'))}>
                  <Text>{t('cloud.conflicts.keepCurrent')}</Text>
                </Button>
              </View>
            </View>
          );
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
                  disabled={busy}
                  onPress={() => void run(() => resolvePhotoConflict(item, 'use'))}>
                  <Text>{t('cloud.conflicts.usePhoto')}</Text>
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onPress={() => void run(() => resolvePhotoConflict(item, 'keep'))}>
                  <Text>{t('cloud.conflicts.keepCurrent')}</Text>
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
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await acknowledgeCloudConflicts(item.conflictIds);
                    router.push('/other-versions' as Href);
                  })
                }>
                <Text>{t('cloud.conflicts.showThem')}</Text>
              </Button>
            </View>
          </View>
        );
      })}
    </View>
  );
}
