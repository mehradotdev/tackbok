import { canonicalize } from '../canonical';
import type {
  JournalSnapshotPayload,
  ObservedDeviceHead,
  SnapshotDomain,
} from '../types';
import type { BaseShadow, DeviceHead } from './types';
import { AttentionError } from './errors';

export interface RemoteHeadSnapshot {
  head: DeviceHead;
  snapshotId: string;
  payload: JournalSnapshotPayload;
}

export function domainOf(payload: JournalSnapshotPayload): SnapshotDomain {
  return {
    entries: payload.entries,
    tags: payload.tags,
    entryTags: payload.entryTags,
    prompts: payload.prompts,
    profile: payload.profile,
    media: payload.media,
    tombstones: payload.tombstones,
    conflicts: payload.conflicts,
  };
}

function observationMap(values: ObservedDeviceHead[]): Map<string, ObservedDeviceHead> {
  const result = new Map<string, ObservedDeviceHead>();
  for (const value of values) {
    const existing = result.get(value.deviceId);
    if (!existing || value.deviceSequence > existing.deviceSequence ||
        (value.deviceSequence === existing.deviceSequence && value.snapshotId < existing.snapshotId)) {
      result.set(value.deviceId, { ...value });
    }
  }
  return result;
}

export function normalizeObservations(values: ObservedDeviceHead[]): ObservedDeviceHead[] {
  const grouped = new Map<string, ObservedDeviceHead[]>();
  for (const value of values) {
    const candidates = grouped.get(value.deviceId) ?? [];
    candidates.push(value);
    grouped.set(value.deviceId, candidates);
  }
  const result: ObservedDeviceHead[] = [];
  for (const [deviceId, candidates] of grouped) {
    const greatest = Math.max(...candidates.map((candidate) => candidate.deviceSequence));
    const atGreatest = candidates.filter((candidate) => candidate.deviceSequence === greatest);
    const snapshotIds = [...new Set(atGreatest.map((candidate) => candidate.snapshotId))];
    if (snapshotIds.length !== 1) {
      throw new AttentionError('ambiguous-device-head', 'same-sequence-different-snapshot');
    }
    result.push({ deviceId, deviceSequence: greatest, snapshotId: snapshotIds[0] });
  }
  return result.sort((left, right) =>
    left.deviceId < right.deviceId ? -1 : left.deviceId > right.deviceId ? 1 : 0);
}

export function isHeadShapeValid(head: DeviceHead): boolean {
  return head.format === 'tackbok-device-head' &&
    typeof head.vaultId === 'string' && typeof head.deviceId === 'string' &&
    Number.isSafeInteger(head.deviceSequence) && head.deviceSequence >= 0 &&
    /^[0-9a-f]{64}$/.test(head.snapshotId) &&
    Number.isSafeInteger(head.updatedAt) && head.updatedAt >= 0;
}

export function activeFrontier(heads: RemoteHeadSnapshot[]): RemoteHeadSnapshot[] {
  return heads.filter((candidate) => !heads.some((observer) => {
    if (observer === candidate) return false;
    if (observer.payload.authorDeviceId === candidate.head.deviceId) {
      if (observer.payload.deviceSequence > candidate.head.deviceSequence) return true;
      if (observer.payload.deviceSequence === candidate.head.deviceSequence &&
          observer.snapshotId === candidate.snapshotId) return true;
    }
    const seen = observer.payload.observedDeviceHeads.find((value) =>
      value.deviceId === candidate.head.deviceId);
    return Boolean(seen && (seen.deviceSequence > candidate.head.deviceSequence ||
      (seen.deviceSequence === candidate.head.deviceSequence &&
       seen.snapshotId === candidate.snapshotId)));
  }));
}

export function remoteContainsBase(remote: RemoteHeadSnapshot, base: BaseShadow): boolean {
  if (remote.snapshotId === base.snapshotId ||
      remote.payload.parentSnapshotIds.includes(base.snapshotId)) return true;
  const baseAuthor = base.payload.authorDeviceId;
  const baseSequence = base.payload.deviceSequence;
  if (remote.payload.authorDeviceId === baseAuthor &&
      remote.payload.deviceSequence > baseSequence) return true;
  const observed = remote.payload.observedDeviceHeads.find((value) =>
    value.deviceId === baseAuthor);
  return Boolean(observed && (observed.deviceSequence > baseSequence ||
    (observed.deviceSequence === baseSequence &&
     observed.snapshotId === base.snapshotId)));
}

export function headsCovered(
  heads: RemoteHeadSnapshot[],
  accepted: ObservedDeviceHead[],
): boolean {
  const known = observationMap(accepted);
  return heads.every((candidate) => {
    const value = known.get(candidate.head.deviceId);
    return Boolean(value && (value.deviceSequence > candidate.head.deviceSequence ||
      (value.deviceSequence === candidate.head.deviceSequence &&
       value.snapshotId === candidate.snapshotId)));
  });
}

export function headSignature(heads: RemoteHeadSnapshot[]): string {
  return canonicalize(heads.map(({ head }) => ({
    deviceId: head.deviceId,
    deviceSequence: head.deviceSequence,
    snapshotId: head.snapshotId,
  })));
}
