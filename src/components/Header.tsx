import React from 'react';
import { View, Pressable } from 'react-native';
import { Search, ArrowLeft, ArrowRight } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { Input } from '~/components/ui/input';
import { SettingsDropdownMenu } from '~/components/SettingsDropdownMenu';

interface IHeaderProps {
  isSearchMode?: boolean;
  onSearchPress: () => void;
  onBackPress: () => void;
  searchQuery?: string;
  onSearchQueryChange: (text: string) => void;
}

export const Header: React.FC<IHeaderProps> = ({
  isSearchMode = false,
  onSearchPress,
  onBackPress,
  searchQuery = '',
  onSearchQueryChange,
}) => {
  const { t, isRTL } = useTranslation();

  if (isSearchMode) {
    return (
      <View className="flex-row w-full items-center justify-between px-safe-or-4 py-2 bg-primary">
        {/* Back Button */}
        <Pressable className="p-1" onPress={onBackPress}>
          <Icon as={isRTL ? ArrowRight : ArrowLeft} />
        </Pressable>

        {/* TODO: use KeyboardAvoidingView? */}
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
          <Icon as={Search} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row w-full items-center justify-between px-safe-or-4 py-2 bg-primary">
      {/* Search Button */}
      <Pressable className="p-1" onPress={onSearchPress}>
        <Icon as={Search} />
      </Pressable>

      <Text variant="h2">{t('Tackbok')}</Text>

      <SettingsDropdownMenu />
    </View>
  );
};
