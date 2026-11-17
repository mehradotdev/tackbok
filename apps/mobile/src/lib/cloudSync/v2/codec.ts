/**
 * v2 envelope: a small plaintext header, then the body.
 *
 *   bytes      = canonical header JSON, one "\n" (0x0A), stored body bytes
 *   snapshotId = SHA-256 of the canonical header bytes
 *   header     = format, major version, features (required / optional),
 *                kind (full | delta), since, codec, encryption, body hash and
 *                size, vault, author, sequence, time, roster, context, floor
 *   body       = gzip of the canonical body JSON (entries, tags, prompts,
 *                profile, media)
 *
 * The body hash is over the canonical, uncompressed body, so the identity
 * does not depend on one gzip implementation. Canonical JSON never contains a
 * raw newline, so the first 0x0A ends the header. Stamps are [hlc, index] and
 * version vectors [[index, hlc], ...], where index points into the roster.
 *
 * Versioning: an unknown major version, required feature, codec, encryption
 * or kind throws `SnapshotUpdateRequiredError` ("pause and ask the user to
 * update; never write or delete"). These are read before the closed shape is
 * checked, so a newer layout always asks for an update. New fields arrive only
 * under `ext` (in the header and in the body), keyed by the feature that
 * defines them; data under an unknown optional feature is ignored.
 */
import { decodeGzipBounded, encodeGzip } from '~/lib/zip/core/gzip-codec';

import { canonicalize } from '../snapshot/canonical';
import { SNAPSHOT_CAPS, SnapshotValidationError, invalid } from '../snapshot/caps';
import { sha256Bytes, sha256Text } from '../snapshot/sha256';
import { decodeUtf8Strict, parseJsonStrict } from '../snapshot/strictJson';
import { compareStamps, covers, vectorIncluded } from './clock';
import { NAMED_ID, splitEntryId } from './ids';
import { referencedAssets } from './join';
import type {
  EntryRecord,
  Item,
  MediaDescriptor,
  Member,
  NamedRecord,
  ProfileRecord,
  Stamp,
  SyncState,
  Tombstone,
  VersionVector,
} from './types';

export const SNAPSHOT_FORMAT = 'tackbok-snapshot';
export const SNAPSHOT_MAJOR = 2;
/** Features this build understands. Empty in 2.0.0. */
export const KNOWN_REQUIRED_FEATURES: readonly string[] = [];

export const V2_CAPS = Object.freeze({
  roster: 1024,
  valuesPerRegister: 64,
  membersPerEntry: 4096,
  orderLength: 4096,
  headerBytes: 256 * 1024,
});

export class SnapshotUpdateRequiredError extends SnapshotValidationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'SnapshotUpdateRequiredError';
  }
}

const needsUpdate = (code: string, message: string): never => {
  throw new SnapshotUpdateRequiredError(code, message);
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type StampJson = [number, number];
type VectorJson = [number, number][];

export interface SnapshotHeader {
  format: typeof SNAPSHOT_FORMAT;
  major: number;
  features: { required: string[]; optional: string[] };
  kind: 'full' | 'delta';
  since: VectorJson | null;
  codec: 'gzip';
  encryption: 'none';
  bodyHash: string;
  bodyBytes: number;
  vaultId: string;
  authorDeviceId: string;
  deviceSequence: number;
  createdAt: number;
  roster: { deviceId: string; lastSeenAt: number }[];
  ctx: VectorJson;
  floor: VectorJson | null;
  /** Feature-keyed extension data; none is defined in 2.0.0. */
  ext: Record<string, Json>;
}

export interface Publication {
  authorDeviceId: string;
  deviceSequence: number;
  createdAt: number;
  /** Optional features this snapshot carries; unknown ones are ignored on read. */
  optionalFeatures?: string[];
}

const MOODS = new Set(['AMAZING', 'HAPPY', 'OKAY', 'SAD', 'AWFUL']);
const KINDS = new Set(['photo', 'voice', 'profile-photo']);
const HASH = /^[0-9a-f]{64}$/;
const ID = /^[\x20-\x7e]+$/;
const FEATURE = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const encoder = new TextEncoder();
const utf8Length = (value: string) => encoder.encode(value).length;

// ---------------------------------------------------------------- encoding

function rosterOf(state: SyncState): string[] {
  return Object.keys(state.roster).sort();
}

class Indexer {
  readonly index = new Map<string, number>();
  constructor(readonly devices: string[]) {
    devices.forEach((device, position) => this.index.set(device, position));
  }
  of(device: string): number {
    const position = this.index.get(device);
    if (position === undefined)
      invalid('unknown-device', `Device ${device} is not on the roster`);
    return position;
  }
  stamp(stamp: Stamp): StampJson {
    return [stamp[0], this.of(stamp[1])];
  }
  vector(vv: VersionVector): VectorJson {
    return Object.entries(vv)
      .map(([device, hlc]): [number, number] => [this.of(device), hlc])
      .sort((a, b) => a[0] - b[0]);
  }
}

const byKey = <T>(values: Iterable<T>, key: (value: T) => string) =>
  [...values].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

function itemsJson<T extends Json>(ix: Indexer, items: readonly Item<T>[]): Json {
  return [...items]
    .sort((a, b) => compareStamps(a.s, b.s))
    .map((item) => [ix.stamp(item.s), item.v]);
}

function membersJson(ix: Indexer, members: readonly Member[]): Json {
  return [...members]
    .sort((a, b) => (a.id !== b.id ? (a.id < b.id ? -1 : 1) : compareStamps(a.s, b.s)))
    .map((member) => [member.id, ix.stamp(member.s)]);
}

function tombJson(ix: Indexer, del: Tombstone | null): Json {
  if (!del) return null;
  return {
    at: ix.stamp(del.at),
    seen: ix.vector(del.seen),
    ack: del.ackSeen ? ix.vector(del.ackSeen) : null,
  };
}

function entryJson(ix: Indexer, entry: EntryRecord): Json {
  return {
    id: entry.id,
    vv: ix.vector(entry.vv),
    del: tombJson(ix, entry.del),
    title: itemsJson(ix, entry.title),
    text: itemsJson(ix, entry.text),
    mood: [ix.stamp(entry.mood.s), entry.mood.v],
    date: [ix.stamp(entry.date.s), entry.date.v],
    tags: membersJson(ix, entry.tags),
    media: membersJson(ix, entry.attachments),
    order: entry.order ? [ix.stamp(entry.order.s), [...entry.order.v]] : null,
    split: entry.split
      ? [entry.split.from, entry.split.field, ix.stamp(entry.split.s)]
      : null,
  };
}

function namedJson(ix: Indexer, record: NamedRecord): Json {
  return {
    id: record.id,
    vv: ix.vector(record.vv),
    del: tombJson(ix, record.del),
    title: [ix.stamp(record.title.s), record.title.v],
  };
}

function mediaJson(media: MediaDescriptor): Json {
  return { ...media };
}

function bodyJson(ix: Indexer, state: SyncState): Json {
  return {
    entries: byKey(state.entries.values(), (entry) => entry.id).map((entry) =>
      entryJson(ix, entry),
    ),
    tags: byKey(state.tags.values(), (tag) => tag.id).map((tag) => namedJson(ix, tag)),
    prompts: byKey(state.prompts.values(), (prompt) => prompt.id).map((prompt) =>
      namedJson(ix, prompt),
    ),
    profile: {
      vv: ix.vector(state.profile.vv),
      name: itemsJson(ix, state.profile.name),
      photo: itemsJson(ix, state.profile.photo),
    },
    media: byKey(state.media.values(), (media) => media.assetId).map(mediaJson),
    ext: {},
  };
}

function stateHeaderJson(ix: Indexer, state: SyncState) {
  return {
    roster: ix.devices.map((deviceId) => ({
      deviceId,
      lastSeenAt: state.roster[deviceId],
    })),
    ctx: ix.vector(state.ctx),
    floor: state.floor ? ix.vector(state.floor) : null,
  };
}

/**
 * Canonical bytes of the synced state: everything in a snapshot except who
 * published it, when, and the codec. Two devices with the same state have the
 * same bytes; the property tests compare these.
 */
export function canonicalState(state: SyncState): string {
  validateState(state);
  const ix = new Indexer(rosterOf(state));
  return canonicalize({
    vaultId: state.vaultId,
    ...stateHeaderJson(ix, state),
    body: bodyJson(ix, state),
  } as Json);
}

export interface EncodedEnvelope {
  snapshotId: string;
  header: SnapshotHeader;
  bodyCanonical: Uint8Array;
  bytes: Uint8Array;
}

export function encodeEnvelope(
  state: SyncState,
  publication: Publication,
): EncodedEnvelope {
  validateState(state);
  const ix = new Indexer(rosterOf(state));
  ix.of(publication.authorDeviceId);
  const bodyCanonical = encoder.encode(canonicalize(bodyJson(ix, state)));
  if (bodyCanonical.length > SNAPSHOT_CAPS.uncompressedBytes)
    invalid('uncompressed-size-cap', 'Snapshot body exceeds 64 MiB');
  const stored = encodeGzip(bodyCanonical, { level: 6 });
  if (stored.length > SNAPSHOT_CAPS.compressedBytes)
    invalid('compressed-size-cap', 'Compressed snapshot body exceeds 16 MiB');
  const header: SnapshotHeader = {
    format: SNAPSHOT_FORMAT,
    major: SNAPSHOT_MAJOR,
    features: {
      required: [],
      optional: [...new Set(publication.optionalFeatures ?? [])].sort(),
    },
    kind: 'full',
    since: null,
    codec: 'gzip',
    encryption: 'none',
    bodyHash: sha256Bytes(bodyCanonical),
    bodyBytes: bodyCanonical.length,
    vaultId: state.vaultId,
    authorDeviceId: publication.authorDeviceId,
    deviceSequence: publication.deviceSequence,
    createdAt: publication.createdAt,
    ...stateHeaderJson(ix, state),
    ext: {},
  };
  validateHeader(header);
  const headerText = canonicalize(header);
  const headerBytes = encoder.encode(headerText);
  const bytes = new Uint8Array(headerBytes.length + 1 + stored.length);
  bytes.set(headerBytes);
  bytes[headerBytes.length] = 0x0a;
  bytes.set(stored, headerBytes.length + 1);
  return { snapshotId: sha256Text(headerText), header, bodyCanonical, bytes };
}

// ---------------------------------------------------------------- decoding

function object(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid('invalid-shape', `${path} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i]))
    invalid('closed-shape', `${path} has missing or unknown keys`);
  return value as Record<string, unknown>;
}

function array(value: unknown, cap: number, path: string): unknown[] {
  if (!Array.isArray(value)) invalid('invalid-shape', `${path} must be an array`);
  if (value.length > cap) invalid('collection-cap', `${path} exceeds its cap`);
  return value;
}

function string(value: unknown, path: string, maxBytes: number): string {
  if (typeof value !== 'string') invalid('invalid-shape', `${path} must be a string`);
  if (utf8Length(value) > maxBytes) invalid('string-cap', `${path} is too long`);
  return value;
}

function id(value: unknown, path: string): string {
  const text = string(value, path, SNAPSHOT_CAPS.idBytes);
  if (!ID.test(text)) invalid('invalid-id', `${path} is not a valid ID`);
  return text;
}

function integer(
  value: unknown,
  path: string,
  max: number = SNAPSHOT_CAPS.timestamp,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  )
    invalid('invalid-number', `${path} is out of range`);
  return value;
}

function nullable<T>(value: unknown, read: (value: unknown) => T): T | null {
  return value === null ? null : read(value);
}

class Reader {
  constructor(readonly devices: string[]) {}
  device(value: unknown, path: string): string {
    const index = integer(value, path, this.devices.length - 1);
    return this.devices[index];
  }
  stamp(value: unknown, path: string): Stamp {
    const pair = array(value, 2, path);
    if (pair.length !== 2) invalid('invalid-shape', `${path} must be [hlc, device]`);
    return [integer(pair[0], `${path}[0]`), this.device(pair[1], `${path}[1]`)];
  }
  vector(value: unknown, path: string): VersionVector {
    const result: Record<string, number> = {};
    let last = -1;
    for (const [i, raw] of array(value, this.devices.length, path).entries()) {
      const pair = array(raw, 2, `${path}[${i}]`);
      if (pair.length !== 2)
        invalid('invalid-shape', `${path}[${i}] must be [device, hlc]`);
      const index = integer(pair[0], `${path}[${i}][0]`, this.devices.length - 1);
      if (index <= last) invalid('unsorted', `${path} must be sorted and unique`);
      last = index;
      result[this.devices[index]] = integer(pair[1], `${path}[${i}][1]`);
    }
    return result;
  }
  items<T>(
    value: unknown,
    path: string,
    read: (value: unknown, path: string) => T,
  ): Item<T>[] {
    const items = array(value, V2_CAPS.valuesPerRegister, path).map((raw, i) => {
      const pair = array(raw, 2, `${path}[${i}]`);
      if (pair.length !== 2)
        invalid('invalid-shape', `${path}[${i}] must be [stamp, value]`);
      return {
        s: this.stamp(pair[0], `${path}[${i}][0]`),
        v: read(pair[1], `${path}[${i}][1]`),
      };
    });
    for (let i = 1; i < items.length; i++)
      if (compareStamps(items[i - 1].s, items[i].s) >= 0)
        invalid('unsorted', `${path} must be sorted by stamp and unique`);
    return items;
  }
  item<T>(
    value: unknown,
    path: string,
    read: (value: unknown, path: string) => T,
  ): Item<T> {
    const pair = array(value, 2, path);
    if (pair.length !== 2) invalid('invalid-shape', `${path} must be [stamp, value]`);
    return { s: this.stamp(pair[0], `${path}[0]`), v: read(pair[1], `${path}[1]`) };
  }
  members(value: unknown, path: string): Member[] {
    const members = array(value, V2_CAPS.membersPerEntry, path).map((raw, i) => {
      const pair = array(raw, 2, `${path}[${i}]`);
      if (pair.length !== 2)
        invalid('invalid-shape', `${path}[${i}] must be [id, stamp]`);
      return {
        id: id(pair[0], `${path}[${i}][0]`),
        s: this.stamp(pair[1], `${path}[${i}][1]`),
      };
    });
    for (let i = 1; i < members.length; i++) {
      const a = members[i - 1],
        b = members[i];
      if (a.id > b.id || (a.id === b.id && compareStamps(a.s, b.s) >= 0))
        invalid('unsorted', `${path} must be sorted by ID and stamp, unique`);
    }
    return members;
  }
  tomb(value: unknown, path: string): Tombstone | null {
    return nullable(value, (raw) => {
      const del = object(raw, ['at', 'seen', 'ack'], path);
      return {
        at: this.stamp(del.at, `${path}.at`),
        seen: this.vector(del.seen, `${path}.seen`),
        ackSeen: nullable(del.ack, (ack) => this.vector(ack, `${path}.ack`)),
      };
    });
  }
}

const nullableText = (maxBytes: number) => (value: unknown, path: string) =>
  value === null ? null : string(value, path, maxBytes);

function readEntry(reader: Reader, raw: unknown, path: string): EntryRecord {
  const value = object(
    raw,
    [
      'id',
      'vv',
      'del',
      'title',
      'text',
      'mood',
      'date',
      'tags',
      'media',
      'order',
      'split',
    ],
    path,
  );
  return {
    id: id(value.id, `${path}.id`),
    vv: reader.vector(value.vv, `${path}.vv`),
    del: reader.tomb(value.del, `${path}.del`),
    title: reader.items(
      value.title,
      `${path}.title`,
      nullableText(SNAPSHOT_CAPS.entryTitleBytes),
    ),
    text: reader.items(
      value.text,
      `${path}.text`,
      nullableText(SNAPSHOT_CAPS.entryBodyBytes),
    ),
    mood: reader.item(value.mood, `${path}.mood`, (mood, at) => {
      if (mood !== null && !MOODS.has(mood as string))
        invalid('invalid-mood', `${at} is invalid`);
      return mood as EntryRecord['mood']['v'];
    }),
    date: reader.item(value.date, `${path}.date`, (date, at) => integer(date, at)),
    tags: reader.members(value.tags, `${path}.tags`),
    attachments: reader.members(value.media, `${path}.media`),
    order: nullable(value.order, (order) =>
      reader.item(order, `${path}.order`, (ids, at) =>
        array(ids, V2_CAPS.orderLength, at).map((asset, i) => id(asset, `${at}[${i}]`)),
      ),
    ),
    split: nullable(value.split, (split) => {
      const triple = array(split, 3, `${path}.split`);
      const field = triple[1];
      if (triple.length !== 3 || (field !== 'title' && field !== 'text'))
        invalid('invalid-shape', `${path}.split must be [entryId, field, stamp]`);
      return {
        from: id(triple[0], `${path}.split[0]`),
        field,
        s: reader.stamp(triple[2], `${path}.split[2]`),
      };
    }),
  };
}

function readNamed(reader: Reader, raw: unknown, path: string): NamedRecord {
  const value = object(raw, ['id', 'vv', 'del', 'title'], path);
  return {
    id: id(value.id, `${path}.id`),
    vv: reader.vector(value.vv, `${path}.vv`),
    del: reader.tomb(value.del, `${path}.del`),
    title: reader.item(value.title, `${path}.title`, (title, at) =>
      string(title, at, SNAPSHOT_CAPS.shortTitleBytes),
    ),
  };
}

function readMedia(raw: unknown, path: string): MediaDescriptor {
  const value = object(
    raw,
    [
      'assetId',
      'ownerType',
      'ownerId',
      'kind',
      'blobHash',
      'mimeType',
      'byteSize',
      'width',
      'height',
      'durationMs',
      'createdAt',
    ],
    path,
  );
  if (value.ownerType !== 'entry' && value.ownerType !== 'profile')
    invalid('invalid-media', `${path}.ownerType is invalid`);
  if (!KINDS.has(value.kind as string))
    invalid('invalid-media', `${path}.kind is invalid`);
  const blobHash = string(value.blobHash, `${path}.blobHash`, 64);
  if (!HASH.test(blobHash)) invalid('invalid-hash', `${path}.blobHash is malformed`);
  return {
    assetId: id(value.assetId, `${path}.assetId`),
    ownerType: value.ownerType,
    ownerId: id(value.ownerId, `${path}.ownerId`),
    kind: value.kind as MediaDescriptor['kind'],
    blobHash,
    mimeType: nullable(value.mimeType, (mime) =>
      string(mime, `${path}.mimeType`, SNAPSHOT_CAPS.mimeTypeBytes),
    ),
    byteSize: integer(value.byteSize, `${path}.byteSize`, SNAPSHOT_CAPS.mediaByteSize),
    width: nullable(value.width, (w) =>
      integer(w, `${path}.width`, SNAPSHOT_CAPS.imageDimension),
    ),
    height: nullable(value.height, (h) =>
      integer(h, `${path}.height`, SNAPSHOT_CAPS.imageDimension),
    ),
    durationMs: nullable(value.durationMs, (d) =>
      integer(d, `${path}.durationMs`, SNAPSHOT_CAPS.audioDurationMs),
    ),
    createdAt: integer(value.createdAt, `${path}.createdAt`),
  };
}

function sortedMap<T>(
  values: T[],
  key: (value: T) => string,
  path: string,
): Map<string, T> {
  const map = new Map<string, T>();
  let last: string | null = null;
  for (const value of values) {
    const current = key(value);
    if (last !== null && current <= last)
      invalid('unsorted', `${path} must be sorted and unique`);
    last = current;
    map.set(current, value);
  }
  return map;
}

/** Feature-keyed extensions: every key names a declared feature. */
function extensions(value: unknown, features: Set<string>, path: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid('invalid-shape', `${path} must be an object`);
  for (const key of Object.keys(value))
    if (!features.has(key))
      invalid('undeclared-extension', `${path}.${key} has no feature`);
}

function headerFeatures(header: unknown): Set<string> {
  const features = (header as { features: { required: string[]; optional: string[] } })
    .features;
  return new Set([...features.required, ...features.optional]);
}

/** The checks a newer snapshot must fail with "update", before any shape check. */
function checkVersion(header: unknown): void {
  if (header === null || typeof header !== 'object' || Array.isArray(header))
    invalid('invalid-shape', '$header must be an object');
  const value = header as Record<string, unknown>;
  if (value.format !== SNAPSHOT_FORMAT)
    needsUpdate('unsupported-format', 'Unknown format');
  if (value.major !== SNAPSHOT_MAJOR)
    needsUpdate('unsupported-version', 'Snapshot needs a newer Tackbok');
  const features = value.features as { required?: unknown } | null;
  const required =
    features && typeof features === 'object' && Array.isArray(features.required)
      ? features.required
      : [];
  for (const feature of required)
    if (typeof feature === 'string' && !KNOWN_REQUIRED_FEATURES.includes(feature))
      needsUpdate('unsupported-feature', `Snapshot requires ${feature}`);
  if (value.codec !== undefined && value.codec !== 'gzip')
    needsUpdate('unsupported-codec', 'Unknown body codec');
  if (value.encryption !== undefined && value.encryption !== 'none')
    needsUpdate('unsupported-encryption', 'Encrypted body');
  if (value.kind === 'delta')
    needsUpdate('unsupported-kind', 'Delta snapshots need an update');
}

function validateHeader(header: unknown): SnapshotHeader {
  checkVersion(header);
  const value = object(
    header,
    [
      'format',
      'major',
      'features',
      'kind',
      'since',
      'codec',
      'encryption',
      'bodyHash',
      'bodyBytes',
      'vaultId',
      'authorDeviceId',
      'deviceSequence',
      'createdAt',
      'roster',
      'ctx',
      'floor',
      'ext',
    ],
    '$header',
  );
  // Repeated after the shape check, which also validates the feature lists.
  if (value.format !== SNAPSHOT_FORMAT)
    needsUpdate('unsupported-format', 'Unknown format');
  if (value.major !== SNAPSHOT_MAJOR)
    needsUpdate('unsupported-version', 'Snapshot needs a newer Tackbok');
  const features = object(value.features, ['required', 'optional'], '$header.features');
  const required = array(features.required, 64, '$header.features.required');
  const optional = array(features.optional, 64, '$header.features.optional');
  for (const [i, feature] of [...required, ...optional].entries()) {
    if (typeof feature !== 'string' || !FEATURE.test(feature))
      invalid('invalid-feature', `Feature ${i} is malformed`);
  }
  for (const list of [required, optional] as string[][])
    for (let i = 1; i < list.length; i++)
      if (list[i - 1] >= list[i])
        invalid('unsorted', 'Features must be sorted and unique');
  for (const feature of required as string[])
    if (!KNOWN_REQUIRED_FEATURES.includes(feature))
      needsUpdate('unsupported-feature', `Snapshot requires ${feature}`);
  if (value.codec !== 'gzip') needsUpdate('unsupported-codec', 'Unknown body codec');
  if (value.encryption !== 'none')
    needsUpdate('unsupported-encryption', 'Encrypted body');
  if (value.kind !== 'full') {
    if (value.kind === 'delta')
      needsUpdate('unsupported-kind', 'Delta snapshots need an update');
    invalid('invalid-kind', 'Unknown snapshot kind');
  }
  if (value.since !== null) invalid('invalid-since', 'A full snapshot has no since');
  const bodyHash = string(value.bodyHash, '$header.bodyHash', 64);
  if (!HASH.test(bodyHash)) invalid('invalid-hash', 'Body hash is malformed');
  integer(value.bodyBytes, '$header.bodyBytes', SNAPSHOT_CAPS.uncompressedBytes);
  id(value.vaultId, '$header.vaultId');
  const roster = array(value.roster, V2_CAPS.roster, '$header.roster').map((raw, i) => {
    const entry = object(raw, ['deviceId', 'lastSeenAt'], `$header.roster[${i}]`);
    integer(entry.lastSeenAt, `$header.roster[${i}].lastSeenAt`);
    return id(entry.deviceId, `$header.roster[${i}].deviceId`);
  });
  for (let i = 1; i < roster.length; i++)
    if (roster[i - 1] >= roster[i])
      invalid('unsorted', 'Roster must be sorted and unique');
  const author = id(value.authorDeviceId, '$header.authorDeviceId');
  if (!roster.includes(author)) invalid('unknown-device', 'Author is not on the roster');
  integer(value.deviceSequence, '$header.deviceSequence');
  integer(value.createdAt, '$header.createdAt');
  const reader = new Reader(roster);
  reader.vector(value.ctx, '$header.ctx');
  if (value.floor !== null) reader.vector(value.floor, '$header.floor');
  extensions(value.ext, headerFeatures(value), '$header.ext');
  return value as unknown as SnapshotHeader;
}

function readState(header: SnapshotHeader, body: unknown): SyncState {
  const devices = header.roster.map((device) => device.deviceId);
  const reader = new Reader(devices);
  const value = object(
    body,
    ['entries', 'tags', 'prompts', 'profile', 'media', 'ext'],
    '$body',
  );
  extensions(value.ext, headerFeatures(header), '$body.ext');
  const entries = array(value.entries, SNAPSHOT_CAPS.entries, '$body.entries').map(
    (raw, i) => readEntry(reader, raw, `$body.entries[${i}]`),
  );
  const tags = array(value.tags, SNAPSHOT_CAPS.tags, '$body.tags').map((raw, i) =>
    readNamed(reader, raw, `$body.tags[${i}]`),
  );
  const prompts = array(value.prompts, SNAPSHOT_CAPS.prompts, '$body.prompts').map(
    (raw, i) => readNamed(reader, raw, `$body.prompts[${i}]`),
  );
  const rawProfile = object(value.profile, ['vv', 'name', 'photo'], '$body.profile');
  const profile: ProfileRecord = {
    vv: reader.vector(rawProfile.vv, '$body.profile.vv'),
    name: reader.items(
      rawProfile.name,
      '$body.profile.name',
      nullableText(SNAPSHOT_CAPS.profileNameBytes),
    ),
    photo: reader.items(rawProfile.photo, '$body.profile.photo', (photo, at) =>
      photo === null ? null : id(photo, at),
    ),
  };
  const media = array(value.media, SNAPSHOT_CAPS.media, '$body.media').map((raw, i) =>
    readMedia(raw, `$body.media[${i}]`),
  );
  const state: SyncState = {
    vaultId: header.vaultId,
    ctx: reader.vector(header.ctx, '$header.ctx'),
    roster: Object.fromEntries(header.roster.map((d) => [d.deviceId, d.lastSeenAt])),
    floor: header.floor ? reader.vector(header.floor, '$header.floor') : null,
    entries: sortedMap(entries, (entry) => entry.id, '$body.entries'),
    tags: sortedMap(tags, (tag) => tag.id, '$body.tags'),
    prompts: sortedMap(prompts, (prompt) => prompt.id, '$body.prompts'),
    profile,
    media: sortedMap(media, (asset) => asset.assetId, '$body.media'),
  };
  validateState(state);
  return state;
}

function splitEnvelope(bytes: Uint8Array): { header: Uint8Array; body: Uint8Array } {
  const limit = Math.min(bytes.length, V2_CAPS.headerBytes + 1);
  for (let i = 0; i < limit; i++)
    if (bytes[i] === 0x0a)
      return { header: bytes.subarray(0, i), body: bytes.subarray(i + 1) };
  return invalid('invalid-envelope', 'Snapshot header is missing or too large');
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
  return true;
}

/** Reads only the header: enough to decide "update needed" before any download of the rest. */
export function decodeHeader(bytes: Uint8Array): {
  snapshotId: string;
  header: SnapshotHeader;
} {
  const parts = splitEnvelope(bytes);
  const text = decodeUtf8Strict(parts.header);
  const header = validateHeader(parseJsonStrict(text));
  if (canonicalize(header) !== text)
    invalid('non-canonical-bytes', 'Snapshot header is not canonical JSON');
  return { snapshotId: sha256Text(text), header };
}

export function decodeEnvelope(
  bytes: Uint8Array,
  expectedSnapshotId?: string,
): { snapshotId: string; header: SnapshotHeader; state: SyncState } {
  const { snapshotId, header } = decodeHeader(bytes);
  if (expectedSnapshotId !== undefined && snapshotId !== expectedSnapshotId)
    invalid('hash-mismatch', 'Snapshot ID does not match its header');
  const stored = splitEnvelope(bytes).body;
  const body = decodeGzipBounded(stored, {
    maxCompressedBytes: SNAPSHOT_CAPS.compressedBytes,
    maxUncompressedBytes: Math.min(header.bodyBytes, SNAPSHOT_CAPS.uncompressedBytes),
  });
  if (body.length !== header.bodyBytes)
    invalid('body-size-mismatch', 'Body size differs');
  if (sha256Bytes(body) !== header.bodyHash)
    invalid('hash-mismatch', 'Snapshot body does not match its hash');
  const parsed = parseJsonStrict(decodeUtf8Strict(body));
  if (!equalBytes(encoder.encode(canonicalize(parsed)), body))
    invalid('non-canonical-bytes', 'Snapshot body is not canonical JSON');
  return { snapshotId, header, state: readState(header, parsed) };
}

// ---------------------------------------------------------------- semantics

/** The join walks items and members in this order. */
function assertSorted(items: readonly { s: Stamp; id?: string }[], path: string): void {
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1],
      b = items[i];
    const byId =
      a.id === undefined || b.id === undefined || a.id === b.id
        ? 0
        : a.id < b.id
          ? -1
          : 1;
    if (byId > 0 || (byId === 0 && compareStamps(a.s, b.s) >= 0))
      invalid('unsorted', `${path} must be sorted and unique`);
  }
}

function assertCovered(vv: VersionVector, stamp: Stamp, path: string) {
  if (!covers(vv, stamp))
    invalid('uncovered-stamp', `${path} is outside its version vector`);
}

function validateRecord(
  record: { vv: VersionVector; del: Tombstone | null },
  ctx: VersionVector,
  stamps: Stamp[],
  path: string,
) {
  if (!vectorIncluded(record.vv, ctx))
    invalid('uncovered-stamp', `${path}.vv exceeds the context`);
  for (const stamp of stamps) assertCovered(record.vv, stamp, path);
  if (record.del) {
    if (!vectorIncluded(record.del.seen, record.vv))
      invalid('invalid-tombstone', `${path}.del saw writes the record lacks`);
    assertCovered(record.del.seen, record.del.at, `${path}.del.at`);
    if (record.del.ackSeen && !vectorIncluded(record.del.ackSeen, record.del.seen))
      invalid('invalid-tombstone', `${path}.del acknowledged deletes it lacks`);
  }
}

/**
 * Invariants of every valid state: stamps inside their record's version
 * vector, vectors inside the context, devices on the roster, references to
 * existing records and media, exactly the referenced media, and the caps.
 */
export function validateState(state: SyncState): void {
  id(state.vaultId, '$vaultId');
  const devices = rosterOf(state);
  if (devices.length > V2_CAPS.roster)
    invalid('collection-cap', 'Roster exceeds its cap');
  for (const device of devices) {
    id(device, '$roster');
    integer(state.roster[device], `$roster.${device}`);
  }
  const onRoster = (vv: VersionVector, path: string) => {
    for (const [device, hlc] of Object.entries(vv)) {
      if (!(device in state.roster)) invalid('unknown-device', `${path} names ${device}`);
      integer(hlc, `${path}.${device}`);
    }
  };
  onRoster(state.ctx, '$ctx');
  if (state.floor) {
    onRoster(state.floor, '$floor');
    if (!vectorIncluded(state.floor, state.ctx))
      invalid('invalid-floor', 'The compaction floor is ahead of the context');
  }
  if (state.entries.size > SNAPSHOT_CAPS.entries)
    invalid('collection-cap', 'Too many entries');
  let textBytes = 0;
  const count = (value: string | null) => {
    if (value !== null) textBytes += utf8Length(value);
  };
  for (const [key, entry] of state.entries) {
    const path = `entry ${key}`;
    if (entry.id !== key) invalid('invalid-id', `${path} is stored under another key`);
    onRoster(entry.vv, `${path}.vv`);
    const stamps = [
      ...entry.title.map((item) => item.s),
      ...entry.text.map((item) => item.s),
      entry.mood.s,
      entry.date.s,
      ...entry.tags.map((member) => member.s),
      ...entry.attachments.map((member) => member.s),
      ...(entry.order ? [entry.order.s] : []),
    ];
    validateRecord(entry, state.ctx, stamps, path);
    assertSorted(entry.title, `${path}.title`);
    assertSorted(entry.text, `${path}.text`);
    assertSorted(entry.tags, `${path}.tags`);
    assertSorted(entry.attachments, `${path}.attachments`);
    if (
      entry.title.length > V2_CAPS.valuesPerRegister ||
      entry.text.length > V2_CAPS.valuesPerRegister
    )
      invalid('collection-cap', `${path} has too many open versions`);
    for (const item of entry.title) {
      if (item.v !== null) string(item.v, `${path}.title`, SNAPSHOT_CAPS.entryTitleBytes);
      count(item.v);
    }
    for (const item of entry.text) {
      if (item.v !== null) string(item.v, `${path}.text`, SNAPSHOT_CAPS.entryBodyBytes);
      count(item.v);
    }
    if (entry.mood.v !== null && !MOODS.has(entry.mood.v)) invalid('invalid-mood', path);
    integer(entry.date.v, `${path}.date`);
    for (const member of entry.tags)
      if (!state.tags.has(member.id))
        invalid('dangling-reference', `${path} tag ${member.id}`);
    for (const member of entry.attachments) {
      const asset = state.media.get(member.id);
      if (
        !asset ||
        asset.ownerType !== 'entry' ||
        asset.ownerId !== entry.id ||
        asset.kind === 'profile-photo'
      )
        invalid('dangling-reference', `${path} attachment ${member.id}`);
    }
    if (entry.split) {
      if (entry.id !== splitEntryId(entry.split.from, entry.split.field, entry.split.s))
        invalid('invalid-split', `${path} does not match its split source`);
      if (!(entry.split.s[1] in state.roster)) invalid('unknown-device', `${path}.split`);
    }
  }
  for (const [kind, records] of [
    ['tag', state.tags],
    ['prompt', state.prompts],
  ] as const) {
    if (records.size > (kind === 'tag' ? SNAPSHOT_CAPS.tags : SNAPSHOT_CAPS.prompts))
      invalid('collection-cap', `Too many ${kind}s`);
    for (const [key, record] of records) {
      const path = `${kind} ${key}`;
      if (record.id !== key || !NAMED_ID.test(key) || !key.startsWith(`${kind}-`))
        invalid('invalid-id', `${path} has an invalid ID`);
      onRoster(record.vv, `${path}.vv`);
      validateRecord(record, state.ctx, [record.title.s], path);
      string(record.title.v, `${path}.title`, SNAPSHOT_CAPS.shortTitleBytes);
      count(record.title.v);
    }
  }
  const profile = state.profile;
  onRoster(profile.vv, '$profile.vv');
  validateRecord(
    { vv: profile.vv, del: null },
    state.ctx,
    [...profile.name.map((item) => item.s), ...profile.photo.map((item) => item.s)],
    'profile',
  );
  assertSorted(profile.name, 'profile.name');
  assertSorted(profile.photo, 'profile.photo');
  for (const item of profile.name) {
    if (item.v !== null) string(item.v, 'profile.name', SNAPSHOT_CAPS.profileNameBytes);
    count(item.v);
  }
  for (const item of profile.photo) {
    if (item.v === null) continue;
    const asset = state.media.get(item.v);
    if (
      !asset ||
      asset.ownerType !== 'profile' ||
      asset.ownerId !== 'profile' ||
      asset.kind !== 'profile-photo'
    )
      invalid('dangling-reference', `Profile photo ${item.v} is invalid`);
  }
  if (textBytes > SNAPSHOT_CAPS.authoredTextBytes)
    invalid('authored-text-cap', 'Authored text exceeds its cap');
  const referenced = referencedAssets(state.entries, profile);
  for (const [key, asset] of state.media) {
    if (asset.assetId !== key)
      invalid('invalid-id', `media ${key} is stored under another key`);
    if (!referenced.has(key))
      invalid('unreferenced-media', `media ${key} is not referenced`);
  }
}
