export interface QueueGenerationCheckpoint {
  queuedGeneration: number;
  durableOutboxGeneration: number | null;
  durableEntityGeneration: number;
}

/**
 * Decides whether a transactional Phase-1 queue row is newer than the atomic
 * engine checkpoint. Equal/older rows are settlement residue after a crash.
 */
export function shouldAdoptQueuedGeneration(checkpoint: QueueGenerationCheckpoint): boolean {
  const durableGeneration = checkpoint.durableOutboxGeneration
    ?? checkpoint.durableEntityGeneration;
  return checkpoint.queuedGeneration > durableGeneration;
}
