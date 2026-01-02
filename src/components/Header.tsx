import React from 'react';
import { View, Pressable } from 'react-native';
import { Search } from 'lucide-react-native';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { SettingsDropdownMenu } from '~/components/SettingsDropdownMenu';

export const Header = () => {
  return (
    <View className="flex-row w-full items-center justify-between px-4 py-2 bg-primary">
      <Pressable className="p-1">
        <Icon as={Search} />
      </Pressable>

      <Text variant="h2">Tackbok</Text>

      <SettingsDropdownMenu />
    </View>
  );
};
