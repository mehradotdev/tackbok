import { GitBranch } from 'lucide-react-native';
import { cn } from 'tailwind-variants';
import type { Entry } from '~/types';
import { useTranslation } from '~/lib/i18n';
import { useOpenConflictGroups } from '~/hooks/useGratitude';
import { Badge } from '~/components/ui/badge';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';

type BadgeEntry = Pick<Entry, 'note_id'>;

/**
 * Marks an entry whose title or text has another version from a two-device
 * edit. Once one is kept (on any device, after it syncs) the badge goes.
 */
export function OtherVersionBadge({
  entry,
  className,
}: {
  entry: BadgeEntry;
  className?: string;
}) {
  return <OpenVersionBadge entryId={entry.note_id} className={className} />;
}

function OpenVersionBadge({
  entryId,
  className,
}: {
  entryId: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { data: openGroups } = useOpenConflictGroups();
  // Hidden until loaded, so a lone survivor never flashes the badge.
  if (!openGroups?.some((members) => members.includes(entryId))) return null;
  return (
    <Badge variant="secondary" className={cn('self-start px-2 py-0.5', className)}>
      <Icon as={GitBranch} className="text-secondary-foreground" size={12} />
      <Text>{t('entry.otherVersion')}</Text>
    </Badge>
  );
}
