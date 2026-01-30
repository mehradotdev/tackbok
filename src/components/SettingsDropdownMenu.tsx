import React from 'react';
import { reloadAppAsync } from 'expo';
import { useRouter } from 'expo-router';
import { EllipsisVertical } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Text } from '~/components/ui/text';
import { Icon } from '~/components/ui/icon';

export function SettingsDropdownMenu() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger hitSlop={12} className="py-2 active:bg-accent">
        <Icon as={EllipsisVertical} className="text-primary-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onPress={() => router.navigate('/settings')}>
          <Text>{t('Settings')}</Text>
        </DropdownMenuItem>
        <DropdownMenuItem>
          {/* TODO: Open email client with pre-filled subject and body */}
          <Text>{t('Contact Us')}</Text>
        </DropdownMenuItem>
        {/* TODO: Remove this before production */}
        <DropdownMenuItem onPress={() => reloadAppAsync()}>
          <Text>{t('Reload App')}</Text>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
