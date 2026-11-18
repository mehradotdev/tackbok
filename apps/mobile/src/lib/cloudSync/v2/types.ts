/**
 * Cloud sync v2 data model (issue #185).
 *
 * In memory, stamps and version vectors name devices by ID. The codec maps
 * IDs to indexes into the snapshot's roster, so stamps stay small on Drive.
 */
export type Mood = 'AMAZING' | 'HAPPY' | 'OKAY' | 'SAD' | 'AWFUL';
export type AssetKind = 'photo' | 'voice' | 'profile-photo';

export type DeviceId = string;

/** JSON a snapshot can carry (canonical: no floats, no negative numbers). */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** One write: hybrid logical clock value and the device that wrote it. */
export type Stamp = readonly [hlc: number, device: DeviceId];

/** Highest HLC seen per device. A missing device means "nothing seen". */
export type VersionVector = Readonly<Record<DeviceId, number>>;

export interface Item<T> {
  readonly s: Stamp;
  readonly v: T;
}

/** Multi-value register: concurrent values all survive. Sorted by stamp. */
export type MultiValue<T> = readonly Item<T>[];

/** Last-writer-wins register: the highest stamp wins. */
export type LastWriter<T> = Item<T>;

/**
 * Per-record extension data, keyed by the feature that defines it (see
 * `features` in the envelope). Each value is a set of stamped items joined by
 * the observed-remove rule against the record's version vector, like a
 * multi-value register: a feature reads it as a register (newest item), a
 * multi-value register (all items) or a set. Devices that do not know a
 * feature keep and join its items unchanged. Empty lists are not stored.
 */
export type Ext = Readonly<Record<string, MultiValue<Json>>>;

/** Observed-remove set membership. Sorted by ID, then stamp. */
export interface Member {
  readonly id: string;
  readonly s: Stamp;
}

export interface Tombstone {
  /** The newest delete. */
  readonly at: Stamp;
  /** What the deleters had seen of this record. */
  readonly seen: VersionVector;
  /**
   * "Got it" on a returned record: the deletes it acknowledged (`seen` at the
   * time). A later delete grows `seen`, so its return shows a notice again.
   */
  readonly ackSeen: VersionVector | null;
  /** Joined against `seen`; stamps must be inside it. */
  readonly ext: Ext;
}

/**
 * Every record carries its own version vector: every write to it, including
 * values since replaced. Joining uses it to tell "replaced" from "not seen
 * yet", so a snapshot that lacks the record says nothing about it.
 */
interface RecordBase {
  readonly vv: VersionVector;
  /** A deleted record keeps its values: an unseen edit brings it back whole. */
  readonly del: Tombstone | null;
  readonly ext: Ext;
}

/**
 * A set of writes: every write of device d up to `vv[d]`, plus the stamps in
 * `extra` (sorted, none inside `vv`). A write to an entry brought back after
 * compaction is known exactly, without claiming the writer's older writes the
 * entry no longer holds.
 */
export interface Known {
  readonly vv: VersionVector;
  readonly extra: readonly Stamp[];
}

export type TextField = 'title' | 'text';

export interface EntryRecord extends RecordBase {
  readonly id: string;
  /**
   * The writes whose values this record holds, when that is less than `vv`:
   * nothing once compaction dropped a deleted entry's values (`compact.ts`),
   * or what one side knew after a compacted copy met one with values. Null
   * means "the same as `vv`". The join judges values (items, members, `ext`)
   * against it, so a compacted copy never removes values another copy has.
   */
  readonly known: Known | null;
  readonly title: MultiValue<string | null>;
  readonly text: MultiValue<string | null>;
  /** Null only while compacted (no value known). */
  readonly mood: LastWriter<Mood | null> | null;
  /** The editable journal date. Null only while compacted. */
  readonly date: LastWriter<number> | null;
  readonly tags: readonly Member[];
  readonly attachments: readonly Member[];
  readonly order: LastWriter<readonly string[]> | null;
  /** Set on an entry made by "Keep both"; immutable. */
  readonly split: {
    readonly from: string;
    readonly field: TextField;
    readonly s: Stamp;
  } | null;
}

export interface NamedRecord extends RecordBase {
  readonly id: string;
  readonly title: LastWriter<string>;
}

export interface ProfileRecord {
  readonly vv: VersionVector;
  /** Also the place for vault-wide extension data: the profile is a singleton. */
  readonly ext: Ext;
  readonly name: MultiValue<string | null>;
  /** Asset IDs of `profile-photo` media, or null for "no photo". */
  readonly photo: MultiValue<string | null>;
}

/** Immutable once published; identified by `assetId`. */
export interface MediaDescriptor {
  readonly assetId: string;
  readonly ownerType: 'entry' | 'profile';
  readonly ownerId: string;
  readonly kind: AssetKind;
  readonly blobHash: string;
  readonly mimeType: string | null;
  readonly byteSize: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly createdAt: number;
  /** Feature-keyed, immutable like the rest of the descriptor. */
  readonly ext: Readonly<Record<string, Json>>;
}

export interface SyncState {
  readonly vaultId: string;
  /** Highest HLC seen per device across the whole state. */
  readonly ctx: VersionVector;
  /** Device -> last time it wrote or published (its HLC). Joined by maximum. */
  readonly roster: Readonly<Record<DeviceId, number>>;
  /**
   * Device -> its context when it last published (`markSeen`). Only that
   * device sets its own entry, so a state holding `acks[d]` holds everything
   * `d` had then. Joined per device by maximum. Compaction reads it.
   */
  readonly acks: Readonly<Record<DeviceId, VersionVector>>;
  /**
   * Highest compaction floor any device used: deleted records whose vector
   * is inside it may have lost their values. Null until the first compaction.
   */
  readonly floor: VersionVector | null;
  readonly entries: ReadonlyMap<string, EntryRecord>;
  readonly tags: ReadonlyMap<string, NamedRecord>;
  readonly prompts: ReadonlyMap<string, NamedRecord>;
  readonly profile: ProfileRecord;
  readonly media: ReadonlyMap<string, MediaDescriptor>;
}

export function emptyState(vaultId: string): SyncState {
  return {
    vaultId,
    ctx: {},
    roster: {},
    acks: {},
    floor: null,
    entries: new Map(),
    tags: new Map(),
    prompts: new Map(),
    profile: { vv: {}, name: [], photo: [], ext: {} },
    media: new Map(),
  };
}
