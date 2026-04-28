import type {
  BackupImportProgressMetrics,
  BackupImportSummary,
  BackupImportWarning,
} from './types';

const MAX_BACKUP_IMPORT_WARNINGS = 25;

export function createBackupImportSummary(): BackupImportSummary {
  return {
    importedEntries: 0,
    updatedEntries: 0,
    skippedEntries: 0,
    importedPrompts: 0,
    importedTags: 0,
    importedPhotos: 0,
    importedAudio: 0,
    failedEntries: 0,
    failedAssets: 0,
    failedProfileAssets: 0,
    warnings: [],
    warningsTruncated: false,
  };
}

export function createSummaryCounterMetrics(
  summary: BackupImportSummary,
): Partial<BackupImportProgressMetrics> {
  return {
    importedPhotos: summary.importedPhotos,
    importedAudio: summary.importedAudio,
    importedTags: summary.importedTags,
    importedPrompts: summary.importedPrompts,
    failedEntries: summary.failedEntries,
    failedAssets: summary.failedAssets,
    failedProfileAssets: summary.failedProfileAssets,
  };
}

export function createSummaryProgressMetrics(
  summary: BackupImportSummary,
): Partial<BackupImportProgressMetrics> {
  const totalEntries =
    summary.importedEntries +
    summary.updatedEntries +
    summary.skippedEntries +
    summary.failedEntries;

  return {
    totalEntries,
    processedEntries: totalEntries,
    ...createSummaryCounterMetrics(summary),
  };
}

export function recordImportWarning(
  summary: BackupImportSummary,
  warning: BackupImportWarning,
): void {
  switch (warning.kind) {
    case 'entry-asset':
      summary.failedAssets++;
      break;
    case 'entry-skipped':
      summary.failedEntries++;
      break;
    case 'profile-asset':
      summary.failedProfileAssets++;
      break;
    case 'profile-settings':
      break;
    default: {
      const exhaustiveWarning: never = warning;
      return exhaustiveWarning;
    }
  }

  if (summary.warnings.length < MAX_BACKUP_IMPORT_WARNINGS) {
    summary.warnings.push(warning);
    return;
  }

  summary.warningsTruncated = true;
}
