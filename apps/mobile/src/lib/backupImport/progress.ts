import type {
  BackupImportPhase,
  BackupImportProgress,
  BackupImportProgressMetrics,
  BackupImportSource,
} from './types';
import {
  IMPORT_PHASE_ORDER,
  PRESENTLY_IMPORT_PHASE_ORDER,
} from './types';

export type ImportProgressCallback = (progress: BackupImportProgress) => void;

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function createBackupImportProgress<TSource extends string>(
  source: TSource,
  phase: BackupImportPhase,
  phaseProgress: number,
  metrics?: Partial<BackupImportProgressMetrics>,
  phaseOrder: readonly BackupImportPhase[] = IMPORT_PHASE_ORDER,
): Omit<BackupImportProgress, 'source'> & { source: TSource } {
  const phaseIndex = phaseOrder.indexOf(phase);
  const safePhaseProgress = clampRatio(phaseProgress);
  const overallProgress =
    phaseIndex === -1
      ? safePhaseProgress
      : clampRatio((phaseIndex + safePhaseProgress) / phaseOrder.length);

  return {
    source,
    phase,
    progress: overallProgress,
    phaseProgress: safePhaseProgress,
    totalEntries: metrics?.totalEntries ?? 0,
    processedEntries: metrics?.processedEntries ?? 0,
    totalTags: metrics?.totalTags ?? 0,
    totalPrompts: metrics?.totalPrompts ?? 0,
    importedPhotos: metrics?.importedPhotos ?? 0,
    importedAudio: metrics?.importedAudio ?? 0,
    importedTags: metrics?.importedTags ?? 0,
    importedPrompts: metrics?.importedPrompts ?? 0,
    failedEntries: metrics?.failedEntries ?? 0,
    failedAssets: metrics?.failedAssets ?? 0,
    failedProfileAssets: metrics?.failedProfileAssets ?? 0,
  };
}

export function getImportPhaseOrder(
  source: BackupImportSource,
): readonly BackupImportPhase[] {
  return source === 'presently' ? PRESENTLY_IMPORT_PHASE_ORDER : IMPORT_PHASE_ORDER;
}

export function reportImportProgress(
  onProgress: ImportProgressCallback | undefined,
  source: BackupImportSource,
  phase: BackupImportPhase,
  phaseProgress: number,
  metrics?: Partial<BackupImportProgressMetrics>,
  phaseOrder?: readonly BackupImportPhase[],
): void {
  if (!onProgress) return;

  onProgress(
    createBackupImportProgress(
      source,
      phase,
      phaseProgress,
      metrics,
      phaseOrder ?? getImportPhaseOrder(source),
    ),
  );
}
