import {
  DAY_MS,
  SNAPSHOT_RETENTION_MS,
  backupHistory,
  snapshotsToDelete,
} from './retention';
import type { SnapshotObject } from './types';

const DAY0 = 20_000 * DAY_MS; // a UTC midnight
const HOUR = 60 * 60 * 1000;

const snap = (snapshotId: string, createdAt: number): SnapshotObject => ({
  snapshotId,
  createdAt,
  byteCount: 1,
});

function plan(
  snapshots: SnapshotObject[],
  now: number,
  options: { referenced?: string[]; blobs?: Record<string, string[]> } = {},
) {
  const blobs = new Map(
    Object.entries(
      options.blobs ??
        Object.fromEntries(snapshots.map((snapshot) => [snapshot.snapshotId, []])),
    ),
  );
  return snapshotsToDelete({
    snapshots,
    referenced: new Set(options.referenced ?? []),
    blobs,
    now,
  });
}

describe('backupHistory', () => {
  it('keeps the newest snapshot of each UTC day of the last 30, newest first', () => {
    const history = backupHistory(
      [
        snap('a', DAY0 + HOUR),
        snap('b', DAY0 + 20 * HOUR),
        snap('c', DAY0 + DAY_MS + HOUR),
        // A day with no snapshot (day 2) leaves no gap filler.
        snap('d', DAY0 + 3 * DAY_MS + 23 * HOUR),
      ],
      DAY0 + 4 * DAY_MS,
    );
    expect(history.map((snapshot) => snapshot.snapshotId)).toEqual(['d', 'c', 'b']);
  });

  it('leaves out snapshots 30 days old and those with no known upload time', () => {
    const now = DAY0 + 40 * DAY_MS;
    const history = backupHistory(
      [
        snap('old', now - SNAPSHOT_RETENTION_MS),
        snap('young', now - SNAPSHOT_RETENTION_MS + 1),
        snap('unknown', 0),
      ],
      now,
    );
    expect(history.map((snapshot) => snapshot.snapshotId)).toEqual(['young']);
  });

  it('breaks a tie in upload time by snapshot ID, the same on every device', () => {
    const snapshots = [snap('b', DAY0 + HOUR), snap('a', DAY0 + HOUR)];
    expect(backupHistory(snapshots, DAY0 + DAY_MS)[0].snapshotId).toBe('b');
    expect(backupHistory([...snapshots].reverse(), DAY0 + DAY_MS)[0].snapshotId).toBe(
      'b',
    );
  });
});

describe('snapshotsToDelete', () => {
  it('deletes snapshots no head points to once 30 days old, never a head', () => {
    const now = DAY0 + 31 * DAY_MS;
    expect(
      plan([snap('old', DAY0), snap('head', DAY0 + HOUR), snap('new', now - HOUR)], now, {
        referenced: ['head'],
      }),
    ).toEqual(['old']);
  });

  it('thins a past day to its newest snapshot, keeping the whole current day', () => {
    const now = DAY0 + DAY_MS + 2 * HOUR;
    const snapshots = [
      snap('d0-early', DAY0 + HOUR),
      snap('d0-mid', DAY0 + 2 * HOUR),
      snap('d0-last', DAY0 + 3 * HOUR),
      snap('d1-early', DAY0 + DAY_MS),
      snap('d1-last', DAY0 + DAY_MS + HOUR),
    ];
    expect(plan(snapshots, now)).toEqual(['d0-early', 'd0-mid']);
  });

  it('keeps a snapshot from just before midnight, whose head may not point to it yet', () => {
    const now = DAY0 + DAY_MS + 5_000;
    const snapshots = [
      snap('late', DAY0 + DAY_MS - 20_000),
      snap('newest-of-day', DAY0 + DAY_MS - 10_000),
    ];
    expect(plan(snapshots, now)).toEqual([]);
    expect(plan(snapshots, DAY0 + 2 * DAY_MS)).toEqual(['late']);
  });

  it('keeps one snapshot for each of 30 days, missing days included', () => {
    const snapshots: SnapshotObject[] = [];
    for (let day = 0; day < 40; day++) {
      if (day % 3 === 1) continue; // Days with no snapshot.
      for (let hour = 1; hour <= 3; hour++)
        snapshots.push(snap(`d${day}-h${hour}`, DAY0 + day * DAY_MS + hour * HOUR));
    }
    const now = DAY0 + 40 * DAY_MS + 4 * HOUR;
    const deleted = new Set(plan(snapshots, now));
    const left = snapshots.filter((snapshot) => !deleted.has(snapshot.snapshotId));
    expect(left.map((snapshot) => snapshot.snapshotId)).toEqual(
      backupHistory(snapshots, now)
        .map((snapshot) => snapshot.snapshotId)
        .reverse(),
    );
    expect(left.length).toBe(20);
    expect(left.every((snapshot) => snapshot.snapshotId.endsWith('-h3'))).toBe(true);
  });

  it('thins a snapshot only when a newer one that stays refers to all its media', () => {
    const now = DAY0 + 2 * DAY_MS + 3 * HOUR;
    const snapshots = [
      snap('photo-added', DAY0 + HOUR),
      snap('photo-removed', DAY0 + 2 * HOUR),
      snap('kept-photo', DAY0 + DAY_MS + HOUR),
      snap('day-1-last', DAY0 + DAY_MS + 2 * HOUR),
    ];
    // The photo is referred to only by the earliest snapshot: it stays, so
    // media garbage collection still sees the reference for 30 days.
    expect(
      plan(snapshots, now, {
        blobs: {
          'photo-added': ['p'],
          'photo-removed': [],
          'kept-photo': ['q'],
          'day-1-last': ['q'],
        },
      }),
    ).toEqual(['kept-photo']);
  });

  it('an older snapshot never covers a newer one; one that stays covers older ones', () => {
    const now = DAY0 + 2 * DAY_MS;
    const snapshots = [
      snap('older', DAY0 + HOUR),
      snap('middle', DAY0 + 2 * HOUR),
      snap('newest', DAY0 + 3 * HOUR),
    ];
    // Nothing newer refers to `p`, so `middle` stays and covers `older`.
    expect(
      plan(snapshots, now, {
        blobs: { older: ['p'], middle: ['p'], newest: [] },
      }),
    ).toEqual(['older']);
  });

  it('a head or a recent snapshot covers older ones', () => {
    const now = DAY0 + DAY_MS + 5 * HOUR;
    const snapshots = [
      snap('a', DAY0 + HOUR),
      snap('head', DAY0 + 2 * HOUR),
      snap('b', DAY0 + 3 * HOUR),
      snap('today', DAY0 + DAY_MS + HOUR),
    ];
    expect(
      plan(snapshots, now, {
        referenced: ['head'],
        blobs: { a: ['p'], head: ['p'], b: ['q'], today: ['q', 'r'] },
      }),
    ).toEqual(['a']);
    // Now `c` is the newest of day 0; `b` is covered by the current day's.
    expect(
      plan([...snapshots, snap('c', DAY0 + 4 * HOUR)], now, {
        referenced: ['head'],
        blobs: { a: ['p'], head: ['p'], b: ['q'], c: [], today: ['q'] },
      }),
    ).toEqual(['a', 'b']);
  });

  it('does not thin a snapshot whose media has not been recorded', () => {
    const now = DAY0 + 2 * DAY_MS;
    expect(
      plan([snap('unread', DAY0 + HOUR), snap('last', DAY0 + 2 * HOUR)], now, {
        blobs: { last: [] },
      }),
    ).toEqual([]);
  });

  it('keeps a snapshot with no known upload time', () => {
    expect(plan([snap('unknown', 0)], DAY0 + 100 * DAY_MS)).toEqual([]);
  });

  it('counts time by the clock it is given: uploads after it are the current day', () => {
    // Drive's Date header is whole seconds; a snapshot uploaded "after" now
    // must not be thinned, even across midnight.
    const now = DAY0 + DAY_MS - 1;
    expect(plan([snap('a', DAY0 + HOUR), snap('b', DAY0 + DAY_MS + 500)], now)).toEqual(
      [],
    );
  });
});

/**
 * Seeded simulation of the guarantee media garbage collection relies on:
 * every blob a snapshot refers to stays referred to by some listed snapshot
 * until 30 days after that snapshot's upload, whatever order and pace the
 * uploads, head moves and cleanups come in. Also checks the daily history:
 * every day of the last 30 that had a snapshot keeps its newest one.
 */
describe('retention under random histories', () => {
  function random(seed: number) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
  }

  it.each(Array.from({ length: 40 }, (_, index) => 9100 + index))('seed %i', (seed) => {
    const next = random(seed);
    const devices = ['A', 'B', 'C'];
    const heads = new Map<string, string>();
    const listed = new Map<string, SnapshotObject>();
    const blobsOf = new Map<string, string[]>();
    const uploaded: { snapshot: SnapshotObject; blobs: string[] }[] = [];
    const actual = new Map<string, string[]>();
    let now = DAY0 + Math.floor(next() * DAY_MS);
    let counter = 0;
    for (let step = 0; step < 400; step++) {
      now += Math.floor(next() * 10 * HOUR);
      if (next() < 0.6) {
        const device = devices[Math.floor(next() * devices.length)];
        const blobs = ['p1', 'p2', 'p3', 'p4'].filter(() => next() < 0.3);
        const snapshot = snap(`s${String(++counter).padStart(4, '0')}`, now);
        listed.set(snapshot.snapshotId, snapshot);
        // Some snapshots are never read by the cleaning device.
        if (next() < 0.9) blobsOf.set(snapshot.snapshotId, blobs);
        heads.set(device, snapshot.snapshotId);
        uploaded.push({ snapshot, blobs });
        actual.set(snapshot.snapshotId, blobs);
      } else {
        for (const snapshotId of snapshotsToDelete({
          snapshots: [...listed.values()],
          referenced: new Set(heads.values()),
          blobs: blobsOf,
          now,
        }).slice(0, 10))
          listed.delete(snapshotId);
      }
      const referred = new Set(
        [...listed.keys()].flatMap((snapshotId) => actual.get(snapshotId)!),
      );
      const lost = uploaded.flatMap(({ snapshot, blobs }) =>
        now - snapshot.createdAt < SNAPSHOT_RETENTION_MS
          ? blobs.filter((blob) => !referred.has(blob))
          : [],
      );
      const missingDays = backupHistory(
        uploaded.map((item) => item.snapshot),
        now,
      ).filter((daily) => !listed.has(daily.snapshotId));
      expect({ step, lost, missingDays }).toEqual({ step, lost: [], missingDays: [] });
    }
  });
});
