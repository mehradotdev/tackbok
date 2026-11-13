import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { GitBranch } from 'lucide-react-native';
import { useTranslation } from '~/lib/i18n';
import { useOtherVersionCount } from '~/hooks/useGratitude';
import { SettingsRow } from '~/components/SettingsRow';

/**
 * Opens Other versions for as long as any entry is another version, whether or
 * not the conflict that made it was dismissed on the conflicts card.
 */
export function OtherVersionsRow() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: count } = useOtherVersionCount();
  if (!count) return null;

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
