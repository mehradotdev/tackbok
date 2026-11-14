import { View } from 'react-native';
import type { Asset, Entry } from '~/types';
import type { OtherVersionGroup } from '~/db/queries';
import { useTranslation, formatLocalizedDate } from '~/lib/i18n';
import type { useTagMapping } from '~/hooks/useGratitude';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { EntryItem } from '~/screens/dateEntries';
import { groupMembers } from './keepVersion';

interface OtherVersionGroupCardProps {
  group: OtherVersionGroup;
  tagMap: ReturnType<typeof useTagMapping>;
  onEntryPress: (entry: Entry) => void;
  onPhotoPress: (photos: Asset[], index: number) => void;
  onKeep: (entry: Entry) => void;
  disabled: boolean;
}

/** One entry's versions, one under the other, each with "Keep this one". */
export function OtherVersionGroupCard({
  group,
  tagMap,
  onEntryPress,
  onPhotoPress,
  onKeep,
  disabled,
}: OtherVersionGroupCardProps) {
  const { t } = useTranslation();
  const members = groupMembers(group);
  // A version alone has nothing to choose between.
  const canKeep = members.length > 1;
  const otherCount = members.length - 1;

  return (
    <View className="mx-3 mb-4 rounded-lg border border-border bg-card overflow-hidden">
      <View className="gap-1 px-3 pt-3">
        <Text role="heading" className="font-body-bold text-foreground">
          {t('cloud.conflicts.versionsOf', {
            date: formatLocalizedDate(members[0].created_at, t),
          })}
        </Text>
        {!group.original && (
          <Text className="text-sm text-muted-foreground">
            {t('cloud.conflicts.originalDeleted')}
          </Text>
        )}
      </View>
      {members.map((entry, index) => {
        const isOriginal = entry === group.original;
        const attachmentCount = entry.assets?.length ?? 0;
        return (
          <View
            key={entry.note_id}
            className={index < members.length - 1 ? 'border-b border-border' : undefined}>
            {isOriginal && (
              <Text className="px-3 pt-3 text-sm font-body-semibold text-muted-foreground">
                {t('cloud.conflicts.original')}
              </Text>
            )}
            <EntryItem
              entry={entry}
              onPress={() => onEntryPress(entry)}
              tagMap={tagMap}
              onPhotoPress={onPhotoPress}
              showDate
              // The screen already insets for the safe area.
              safeAreaPadding={false}
              className="border-b-0"
            />
            {(attachmentCount > 0 || canKeep) && (
              <View className="gap-2 px-3 pb-3">
                {attachmentCount > 0 && (
                  <Text className="text-sm text-muted-foreground">
                    {t('cloud.conflicts.attachmentCount', { count: attachmentCount })}
                  </Text>
                )}
                {canKeep && (
                  // Several lines at large text sizes rather than clipped.
                  <Button
                    variant="outline"
                    className="h-auto min-h-10 max-w-full self-start py-2"
                    accessibilityLabel={
                      isOriginal
                        ? t('cloud.conflicts.keepOriginal')
                        : t('cloud.conflicts.keepOtherVersion')
                    }
                    accessibilityHint={t('cloud.conflicts.keepThisOneMessage', {
                      count: otherCount,
                    })}
                    disabled={disabled}
                    onPress={() => onKeep(entry)}>
                    <Text className="shrink text-center">
                      {t('cloud.conflicts.keepThisOne')}
                    </Text>
                  </Button>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
