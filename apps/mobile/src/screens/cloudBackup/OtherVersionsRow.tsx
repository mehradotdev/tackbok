import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { GitBranch } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { useOpenConflictGroups } from '~/hooks/useGratitude';
import { SettingsRow } from '~/components/SettingsRow';

/**
 * Opens Other versions while any entry still has more than one live version,
 * whether or not the conflict was dismissed or its Home notice hidden.
 */
export function OtherVersionsRow() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: openGroups } = useOpenConflictGroups();
  if (!openGroups?.length) return null;

  return (
    <View className="rounded-lg border border-border bg-card overflow-hidden">
      <SettingsRow
        icon={GitBranch}
        label={t('cloud.conflicts.otherVersionsTitle')}
        description={t('cloud.conflicts.otherVersionsRow')}
        onPress={() => router.push('/other-versions' as Href)}
        accessibilityLabel={t('cloud.conflicts.otherVersionsTitle')}
        accessibilityHint={t('cloud.conflicts.otherVersionsRow')}
        className="rounded-none px-4"
        showChevron
        isLast
      />
    </View>
  );
}
