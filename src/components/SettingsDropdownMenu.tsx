import React from 'react';
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
      <DropdownMenuTrigger hitSlop={12}>
        <Icon as={EllipsisVertical} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-background border-0">
        <DropdownMenuItem onPress={() => router.navigate('/settings')}>
          <Text>{t('Settings')}</Text>
        </DropdownMenuItem>
        <DropdownMenuItem>
          {/* TODO: Open email client with pre-filled subject and body */}
          <Text>{t('Contact Us')}</Text>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
