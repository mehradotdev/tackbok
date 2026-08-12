import React from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CloudCheck,
  CloudOff,
  CloudUpload,
  Search,
} from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useTranslation } from '~/lib/i18n';
import { useTags } from '~/hooks/useGratitude';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { SpinningRefreshIcon } from '~/components/ui/spinning-refresh-icon';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { SettingsBottomSheet } from '~/components/SettingsBottomSheet';
import { useCloudSyncSnapshot } from '~/lib/cloudSync/ui';

interface IHeaderProps {
  isSearchMode?: boolean;
  onSearchPress: () => void;
  onBackPress: () => void;
  searchQuery?: string;
  onSearchQueryChange: (text: string) => void;
  selectedTagIds?: string[];
  onTagsChange?: (tagIds: string[]) => void;
}

export const Header: React.FC<IHeaderProps> = ({
  isSearchMode = false,
  onSearchPress,
  onBackPress,
  searchQuery = '',
  onSearchQueryChange,
  selectedTagIds = [],
  onTagsChange,
}) => {
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const { snapshot } = useCloudSyncSnapshot();
  const { data: allTags } = useTags();
  const safeTags = allTags || [];
  const showTagFilter = isSearchMode && safeTags.length > 0;
  const syncIsActive =
    snapshot.status === 'syncing' || snapshot.status === 'restoring';

  if (isSearchMode) {
    return (
      <View className="w-full bg-primary">
        {/* Search Input Row */}
        <View className="flex-row w-full items-center justify-between px-safe-or-4 py-2">
          {/* Back Button */}
          <Button className="p-1" onPress={onBackPress} variant="ghost">
            <Icon
              as={isRTL ? ArrowRight : ArrowLeft}
              className="text-primary-foreground"
            />
          </Button>

          {/* Search Input */}
          <View className="flex-1 mx-3">
            <Input
              className="bg-background rounded-lg px-3 py-2 text-foreground"
              placeholder={t('Search gratitude logs...')}
              value={searchQuery}
              onChangeText={onSearchQueryChange}
              autoFocus
              returnKeyType="search"
            />
          </View>

          {/* Search Icon (decorative) */}
          <View className="p-1">
            <Icon as={Search} className="text-primary-foreground" />
          </View>
        </View>

        {/* Tag Filter using ToggleGroup */}
        {showTagFilter && (
          <View className="pb-2 px-safe-or-4">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2">
              <ToggleGroup
                type="multiple"
                layout="pills"
                variant="outline"
                size="xs"
                value={selectedTagIds}
                onValueChange={(value) => onTagsChange?.(value)}>
                {safeTags.map((tag) => (
                  <ToggleGroupItem
                    key={tag.tag_id}
                    value={tag.tag_id}
                    className={cn(
                      'border',
                      selectedTagIds.includes(tag.tag_id)
                        ? 'bg-primary-foreground border-primary-foreground'
                        : 'bg-primary/20 border-primary-foreground/30',
                    )}>
                    <Text
                      className={cn(
                        'text-sm font-body-medium',
                        selectedTagIds.includes(tag.tag_id)
                          ? 'text-primary'
                          : 'text-primary-foreground',
                      )}>
                      #{tag.title}
                    </Text>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </ScrollView>
          </View>
        )}
      </View>
    );
  }

  return (
    <View className="relative flex-row w-full items-center justify-between px-safe-or-4 py-2 bg-primary">
      {/* Search Button */}
      <Button className="p-1" onPress={onSearchPress} variant="ghost">
        <Icon as={Search} className="text-primary-foreground" />
      </Button>

      <View pointerEvents="none" className="absolute left-0 right-0 items-center">
        <Text
          variant="h2"
          numberOfLines={1}
          adjustsFontSizeToFit
          className="text-primary-foreground font-heading max-w-[42%]">
          {t('Tackbok')}
        </Text>
      </View>

      <View className="flex-row items-center gap-1">
        {(snapshot.configured || snapshot.status === 'warning') && (
          <Button
            className="p-1"
            variant="ghost"
            onPress={() => router.push('/cloud-backup' as Href)}
            accessibilityLabel={
              syncIsActive
                ? t('Cloud sync: syncing')
                : snapshot.status === 'queued'
                  ? t('Cloud sync: changes safely queued')
                  : snapshot.status === 'paused'
                    ? t('Cloud sync: paused')
                    : snapshot.status === 'warning'
                      ? t('Cloud sync: attention needed')
                      : t('Cloud sync: up to date')
            }>
            {syncIsActive ? (
              <SpinningRefreshIcon className="text-primary-foreground size-5" />
            ) : (
              <Icon
                as={snapshot.status === 'warning'
                  ? AlertTriangle
                  : snapshot.status === 'paused'
                    ? CloudOff
                    : snapshot.status === 'queued' || snapshot.queuedCount > 0
                      ? CloudUpload
                      : CloudCheck}
                className="text-primary-foreground size-5"
              />
            )}
            {snapshot.queuedCount > 0 && (
              <View className="absolute -right-0.5 -top-0.5 min-w-4 h-4 rounded-full bg-destructive items-center justify-center px-0.5">
                <Text className="text-[10px] leading-none text-destructive-foreground font-body-bold">
                  {snapshot.queuedCount > 9 ? '9+' : snapshot.queuedCount}
                </Text>
              </View>
            )}
          </Button>
        )}
        <SettingsBottomSheet />
      </View>
    </View>
  );
};
