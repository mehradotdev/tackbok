import type { TranslationKey } from '~/lib/i18n';
import type { Entry } from '~/types';

type VersionFields = Pick<Entry, 'text_title' | 'text_content' | 'mood' | 'created_at'>;

/**
 * What differs between the versions of one entry, in words. Covers the fields
 * sync merges per entry (title, text, mood and date). A version never carries
 * the other versions' attachments or anything else, so those are not compared:
 * each version shows its own attachment count instead.
 */
export function versionDifferences(members: readonly VersionFields[]): TranslationKey[] {
  const differs = (value: (entry: VersionFields) => string | number) =>
    new Set(members.map(value)).size > 1;
  const day = (ms: number) => new Date(ms).toDateString();
  const differences: TranslationKey[] = [];
  if (differs((entry) => entry.text_title ?? '')) {
    differences.push('cloud.conflicts.titleDiffers');
  }
  if (differs((entry) => entry.text_content ?? '')) {
    differences.push('cloud.conflicts.textDiffers');
  }
  if (differs((entry) => entry.mood ?? '')) {
    differences.push('cloud.conflicts.moodDiffers');
  }
  // The journal day, in local time, or else only the time of day.
  if (differs((entry) => day(entry.created_at))) {
    differences.push('cloud.conflicts.dateDiffers');
  } else if (differs((entry) => entry.created_at)) {
    differences.push('cloud.conflicts.timeDiffers');
  }
  return differences;
}
