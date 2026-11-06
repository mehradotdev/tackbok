import { GitBranch } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import type { Entry } from '~/types';
import { useTranslation } from '~/lib/i18n';
import { Badge } from '~/components/ui/badge';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';

/** Marks an entry that sync kept as a second version after a two-device edit. */
export function OtherVersionBadge({
  entry,
  className,
}: {
  entry: Pick<Entry, 'conflict_origin_id'>;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!entry.conflict_origin_id) return null;
  return (
    <Badge variant="secondary" className={cn('self-start px-2 py-0.5', className)}>
      <Icon as={GitBranch} className="text-secondary-foreground" size={12} />
      <Text>{t('entry.otherVersion')}</Text>
    </Badge>
  );
}
