import type { Asset } from '~/types';

/**
 * The attachments an edited entry saves. Attachments it keeps stay in their
 * original order, including ones whose files are still downloading; removed
 * ones are dropped and newly added ones follow.
 */
export function attachmentsToSave(
  original: Asset[] | null | undefined,
  visible: Asset[],
  unavailable: Asset[],
): Asset[] {
  const keep = new Set([...visible, ...unavailable].map((asset) => asset.uri));
  const kept = (original ?? []).filter((asset) => keep.has(asset.uri));
  const keptUris = new Set(kept.map((asset) => asset.uri));
  return [...kept, ...visible.filter((asset) => !keptUris.has(asset.uri))];
}
