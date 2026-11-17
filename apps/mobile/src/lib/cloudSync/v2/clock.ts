import { SNAPSHOT_CAPS } from '../snapshot/caps';
import type { Stamp, VersionVector } from './types';

/** Total order: HLC first, then device ID. Equal only for the same write. */
export function compareStamps(left: Stamp, right: Stamp): number {
  if (left[0] !== right[0]) return left[0] < right[0] ? -1 : 1;
  return left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0;
}

export function maxStamp(left: Stamp, right: Stamp): Stamp {
  return compareStamps(left, right) >= 0 ? left : right;
}

/** Whether `vv` includes the write `stamp`. */
export function covers(vv: VersionVector, stamp: Stamp): boolean {
  const seen = vv[stamp[1]];
  return seen !== undefined && seen >= stamp[0];
}

export function joinVectors(left: VersionVector, right: VersionVector): VersionVector {
  if (left === right) return left;
  const result: Record<string, number> = { ...left };
  for (const [device, hlc] of Object.entries(right)) {
    const current = result[device];
    if (current === undefined || hlc > current) result[device] = hlc;
  }
  return result;
}

/** Whether every write in `left` is also in `right`. */
export function vectorIncluded(left: VersionVector, right: VersionVector): boolean {
  for (const [device, hlc] of Object.entries(left)) {
    const other = right[device];
    if (other === undefined || other < hlc) return false;
  }
  return true;
}

export function withStamp(vv: VersionVector, stamp: Stamp): VersionVector {
  return covers(vv, stamp) ? vv : { ...vv, [stamp[1]]: stamp[0] };
}

export function highestHlc(vv: VersionVector): number {
  let highest = -1;
  for (const hlc of Object.values(vv)) if (hlc > highest) highest = hlc;
  return highest;
}

/**
 * Hybrid logical clock: the wall clock, unless this state has already seen
 * that time or later; then one more than the highest HLC seen. A write made
 * after seeing another always gets a higher HLC, whatever the wall clocks say.
 *
 * shortcut: a device whose clock is years ahead drags every HLC with it
 * (still correct, but "newest" then means causal order, not wall time), and
 * one near the timestamp cap would stop all writes. The engine must decide
 * how far ahead of local time a snapshot's context may be (Phase 0 report).
 */
export function nextHlc(ctx: VersionVector, wallMs: number): number {
  const wall = Number.isFinite(wallMs) && wallMs > 0 ? Math.floor(wallMs) : 0;
  const next = Math.max(wall, highestHlc(ctx) + 1);
  // The codec's timestamp cap: a higher HLC could never be published.
  if (!Number.isSafeInteger(next) || next > SNAPSHOT_CAPS.timestamp)
    throw new RangeError('HLC overflow');
  return next;
}
