import { Text } from 'react-native';
import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Icon } from '~/components/ui/icon';
import { EllipsisVertical } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export function SettingsDropdownMenu() {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Icon as={EllipsisVertical} className="text-primary-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onPress={() => router.navigate('/settings')}>
          <Text>Settings</Text>
        </DropdownMenuItem>
        <DropdownMenuItem>
          {/* TODO: Open email client with pre-filled subject and body */}
          <Text>Contact Us</Text>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
