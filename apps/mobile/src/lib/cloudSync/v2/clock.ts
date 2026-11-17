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

const DAY = 24 * 60 * 60 * 1000;

/**
 * How far ahead of this device's wall clock another state's clock may be.
 * Further ahead, `assertNotAhead` refuses the state rather than letting one
 * bad clock drag every HLC (and, near the cap, stop all writes). Generous on
 * purpose: a refused state does not sync until the clocks agree, while a
 * small drag is harmless.
 */
export const MAX_CONTEXT_AHEAD_MS = 7 * DAY;

/** A device that has not written or published for this long leaves the active roster. */
export const ROSTER_EXPIRY_MS = 180 * DAY;

/** The highest time a state claims: its context and its roster. */
export function highestTime(state: {
  ctx: VersionVector;
  roster: Readonly<Record<string, number>>;
}): number {
  return Math.max(highestHlc(state.ctx), highestHlc(state.roster));
}

export class ClockAheadError extends Error {
  readonly code = 'context-ahead';
  constructor(
    readonly aheadMs: number,
    message: string,
  ) {
    super(message);
    this.name = 'ClockAheadError';
  }
}

/**
 * Refuses a remote state whose clock is more than `MAX_CONTEXT_AHEAD_MS`
 * ahead of this device's wall clock. The engine skips that state (as it
 * would an unreadable head) and tells the user a clock is wrong:
 * - if this device's clock is behind, it still publishes (others accept
 *   older stamps) and receives again once its clock is fixed;
 * - if the other device's clock is ahead, its stamps stay ahead even after
 *   its clock is fixed, so that device must reset its sync identity (a new
 *   device ID) to publish again. That reset is engine work (P6/P8).
 */
export function assertNotAhead(
  remote: { ctx: VersionVector; roster: Readonly<Record<string, number>> },
  wallMs: number,
): void {
  const ahead = highestTime(remote) - wallMs;
  if (ahead > MAX_CONTEXT_AHEAD_MS)
    throw new ClockAheadError(
      ahead,
      `A device's clock is ${Math.round(ahead / DAY)} days ahead of this one`,
    );
}

/**
 * Hybrid logical clock: the wall clock, unless this state has already seen
 * that time or later; then one more than the highest HLC seen. A write made
 * after seeing another always gets a higher HLC, whatever the wall clocks say.
 * `assertNotAhead` bounds how far another device can push it.
 */
export function nextHlc(ctx: VersionVector, wallMs: number): number {
  const wall = Number.isFinite(wallMs) && wallMs > 0 ? Math.floor(wallMs) : 0;
  const next = Math.max(wall, highestHlc(ctx) + 1);
  // The codec's timestamp cap: a higher HLC could never be published.
  if (!Number.isSafeInteger(next) || next > SNAPSHOT_CAPS.timestamp)
    throw new RangeError('HLC overflow');
  return next;
}
