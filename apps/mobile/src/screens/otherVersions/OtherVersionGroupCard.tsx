import { View } from 'react-native';
import { cn } from 'tailwind-variants';
import type { Asset, Entry } from '~/types';
import type { OtherVersionGroup } from '~/db/queries';
import { useTranslation, formatLocalizedDate } from '~/lib/i18n';
import type { useTagMapping } from '~/hooks/useGratitude';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { EntryItem } from '~/screens/dateEntries';
import { groupMembers, keepMessage } from './keepVersion';
import { versionDifferences } from './versionDifferences';

interface OtherVersionGroupCardProps {
  group: OtherVersionGroup;
  tagMap: ReturnType<typeof useTagMapping>;
  onEntryPress: (entry: Entry) => void;
  onPhotoPress: (photos: Asset[], index: number) => void;
  onKeep: (entry: Entry) => void;
  /** "Keep both" under another version: it becomes a new entry. */
  onKeepBoth: (entry: Entry) => void;
  disabled: boolean;
  /** The group the user came to compare, e.g. from an entry's banner. */
  highlighted?: boolean;
}

/**
 * One entry's versions, one under the other, each with "Keep this one";
 * the other versions also offer "Keep both".
 */
export function OtherVersionGroupCard({
  group,
  tagMap,
  onEntryPress,
  onPhotoPress,
  onKeep,
  onKeepBoth,
  disabled,
  highlighted = false,
}: OtherVersionGroupCardProps) {
  const { t } = useTranslation();
  const members = groupMembers(group);
  // A version alone has nothing to choose between.
  const canKeep = members.length > 1;
  const differences = versionDifferences(members);

  return (
    <View
      className={cn(
        'mx-3 mb-4 rounded-lg bg-card overflow-hidden',
        // A calm accent, as on the Cloud backup conflicts card; twice as thick,
        // since primary is fainter than the usual border in some themes.
        highlighted ? 'border-2 border-primary' : 'border border-border',
      )}>
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
        {differences.length > 0 && (
          <View className="flex-row flex-wrap gap-x-3 gap-y-1">
            {differences.map((key) => (
              <Text key={key} className="text-sm text-muted-foreground">
                {t(key)}
              </Text>
            ))}
          </View>
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
              // Versions can differ at the end of a long title or text.
              fullText
              // The screen already insets for the safe area.
              safeAreaPadding={false}
              // The whole card is about other versions.
              showVersionBadge={false}
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
                  <View className="flex-row flex-wrap gap-2">
                    {/* Several lines at large text sizes rather than clipped. */}
                    <Button
                      variant="outline"
                      className="h-auto min-h-10 max-w-full self-start py-2"
                      accessibilityLabel={
                        isOriginal
                          ? t('cloud.conflicts.keepOriginal')
                          : t('cloud.conflicts.keepOtherVersion')
                      }
                      accessibilityHint={keepMessage(
                        t,
                        members.filter((member) => member !== entry),
                      )}
                      disabled={disabled}
                      onPress={() => onKeep(entry)}>
                      <Text className="shrink text-center">
                        {t('cloud.conflicts.keepThisOne')}
                      </Text>
                    </Button>
                    {!isOriginal && (
                      <Button
                        variant="ghost"
                        className="h-auto min-h-10 max-w-full py-2"
                        accessibilityHint={t('cloud.conflicts.keepBothHint')}
                        disabled={disabled}
                        onPress={() => onKeepBoth(entry)}>
                        <Text className="shrink text-center">
                          {t('cloud.conflicts.keepBoth')}
                        </Text>
                      </Button>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
