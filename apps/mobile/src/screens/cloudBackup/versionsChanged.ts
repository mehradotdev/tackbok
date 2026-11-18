import { AccessibilityInfo } from 'react-native';
import type { TranslationFunction } from '~/lib/i18n';
import { toast } from '~/components/ui/toast';

/**
 * A conflict choice was refused because the versions changed while it was
 * open (`VersionsChangedError`): say so on screen and to screen readers,
 * whose focus stays where the choice was while the list refreshes.
 */
export function reportVersionsChanged(t: TranslationFunction): void {
  const message = t('cloud.conflicts.versionsChanged');
  // As long as an error's: it explains why nothing was saved.
  toast.info(message, { duration: 8000 });
  AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
}
