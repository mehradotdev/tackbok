import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { GitBranch } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import { useTranslation } from '~/lib/i18n';
import { useEntriesWithOtherVersions } from '~/hooks/useGratitude';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';

/**
 * On an entry with another version of its title or text, a calm note with a
 * way to compare them.
 */
export function OtherVersionBanner({
  entryId,
  className,
}: {
  entryId: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: withVersions } = useEntriesWithOtherVersions();
  // Hidden until loaded, so it never flashes on an entry with one version.
  if (!withVersions?.includes(entryId)) return null;

  return (
    <View className={cn('gap-2 rounded-lg border border-border bg-card p-3', className)}>
      <View className="flex-row items-center gap-3">
        <Icon as={GitBranch} className="text-foreground size-5" />
        <Text className="flex-1 text-sm text-foreground">
          {t('entry.otherVersionBanner')}
        </Text>
      </View>
      {/* Several lines at large text sizes rather than clipped. */}
      <Button
        variant="outline"
        size="sm"
        className="h-auto min-h-10 max-w-full self-start py-2"
        accessibilityHint={t('entry.compareVersionsHint')}
        onPress={() =>
          router.push({
            pathname: '/other-versions',
            params: { focus: entryId },
          })
        }>
        <Text className="shrink text-center text-sm">{t('entry.compareVersions')}</Text>
      </Button>
    </View>
  );
}
