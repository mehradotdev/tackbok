/**
 * The async snapshot codec (#185 P14) against the sync one: the same
 * snapshot ID, header and body for the same state, readable both ways, and
 * the same refusals for damaged bytes. The app uses the async one so a large
 * journal does not freeze it.
 */
import { describe, expect, test } from 'bun:test';
import { gunzipSync } from 'node:zlib';

import { SnapshotValidationError } from '../../src/lib/cloudSync/snapshot/caps';
import { sha256Bytes } from '../../src/lib/cloudSync/snapshot/sha256';
import {
  type CodecWork,
  SnapshotHashUnavailableError,
  canonicalState,
  decodeEnvelope,
  decodeEnvelopeAsync,
  encodeEnvelope,
  encodeEnvelopeAsync,
} from '../../src/lib/cloudSync/v2/codec';
import type { SyncState } from '../../src/lib/cloudSync/v2/types';
import { buildJournal } from './v2-measure';

function countingWork() {
  const work = { pauses: 0, hashed: [] as number[] };
  const codec: CodecWork = {
    hashBytes: async (bytes) => {
      work.hashed.push(bytes.length);
      return sha256Bytes(bytes);
    },
    pause: async () => {
      work.pauses += 1;
    },
  };
  return { work, codec };
}

const publication = (state: SyncState) => ({
  authorDeviceId: Object.keys(state.roster)[0],
  deviceSequence: 7,
  createdAt: 1_790_000_000_000,
});

const errorCode = async (run: () => unknown) => {
  try {
    await run();
  } catch (error) {
    return error instanceof SnapshotValidationError ? error.code : String(error);
  }
  return 'no error';
};

describe('async snapshot codec', () => {
  // 0 and 1 entries, around a pause boundary (500), and a larger journal.
  for (const count of [0, 1, 499, 500, 501, 2_500]) {
    test(`encodes ${count} entries as the sync codec does`, async () => {
      const state = buildJournal(count, count + 11);
      const sync = encodeEnvelope(state, publication(state));
      const { work, codec } = countingWork();
      const async = await encodeEnvelopeAsync(state, publication(state), codec);

      expect(async.snapshotId).toBe(sync.snapshotId);
      expect(async.header).toEqual(sync.header);
      expect(
        Buffer.from(async.bodyCanonical).equals(Buffer.from(sync.bodyCanonical)),
      ).toBe(true);
      // Read back by both decoders and by zlib.
      const header = async.bytes.indexOf(0x0a);
      expect(
        Buffer.from(gunzipSync(async.bytes.subarray(header + 1))).equals(
          Buffer.from(sync.bodyCanonical),
        ),
      ).toBe(true);
      const decoded = decodeEnvelope(async.bytes, sync.snapshotId);
      expect(canonicalState(decoded.state)).toBe(canonicalState(state));
      const roundTrip = await decodeEnvelopeAsync(async.bytes, sync.snapshotId, codec);
      expect(canonicalState(roundTrip.state)).toBe(canonicalState(state));
      const decodedAsync = await decodeEnvelopeAsync(sync.bytes, sync.snapshotId, codec);
      expect(canonicalState(decodedAsync.state)).toBe(canonicalState(state));
      expect(decodedAsync.header).toEqual(sync.header);

      // The body is hashed by the given hasher: once to encode, once per decode.
      expect(work.hashed).toEqual([
        sync.bodyCanonical.length,
        sync.bodyCanonical.length,
        sync.bodyCanonical.length,
      ]);
      if (count >= 2_500) expect(work.pauses).toBeGreaterThan(10);
      // Pure-JS hashing of every body: slow on a busy CI runner.
    }, 60_000);
  }

  test('refuses damaged bytes as the sync decoder does', async () => {
    const state = buildJournal(50, 3);
    const { bytes, snapshotId } = encodeEnvelope(state, publication(state));
    const { codec } = countingWork();
    const header = bytes.indexOf(0x0a);
    const flipped = (at: number) => {
      const copy = bytes.slice();
      copy[at] ^= 0x01;
      return copy;
    };
    const damaged = [
      { name: 'wrong ID', bytes, id: 'f'.repeat(64) },
      { name: 'header byte', bytes: flipped(5), id: snapshotId },
      { name: 'body byte', bytes: flipped(header + 40), id: snapshotId },
      { name: 'gzip trailer', bytes: flipped(bytes.length - 2), id: snapshotId },
      { name: 'truncated', bytes: bytes.slice(0, bytes.length - 20), id: snapshotId },
    ];
    for (const { name, bytes: input, id } of damaged) {
      const expected = await errorCode(() => decodeEnvelope(input, id));
      expect(expected).not.toBe('no error');
      expect({
        name,
        code: await errorCode(() => decodeEnvelopeAsync(input, id, codec)),
      }).toEqual({ name, code: expected });
    }
  });

  test('a hasher that fails is not a damaged snapshot', async () => {
    const state = buildJournal(10, 6);
    const { bytes, snapshotId } = encodeEnvelope(state, publication(state));
    const failing: CodecWork = {
      hashBytes: async () => {
        throw new Error('digest unavailable');
      },
      pause: async () => {},
    };
    for (const run of [
      () => decodeEnvelopeAsync(bytes, snapshotId, failing),
      () => encodeEnvelopeAsync(state, publication(state), failing),
    ]) {
      const error = await run().then(
        () => null,
        (failure: unknown) => failure,
      );
      expect(error).toBeInstanceOf(SnapshotHashUnavailableError);
      expect(error).not.toBeInstanceOf(SnapshotValidationError);
    }
  });

  test('refuses a body whose hash does not match, whatever the hasher says', async () => {
    const state = buildJournal(10, 5);
    const { bytes, snapshotId } = encodeEnvelope(state, publication(state));
    const lying: CodecWork = {
      hashBytes: async () => '0'.repeat(64),
      pause: async () => {},
    };
    expect(await errorCode(() => decodeEnvelopeAsync(bytes, snapshotId, lying))).toBe(
      'hash-mismatch',
    );
  });
});
