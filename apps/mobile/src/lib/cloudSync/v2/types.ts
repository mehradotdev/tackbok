/**
 * Cloud sync v2 data model (issue #185, Phase 0). Pure data: not wired into
 * storage, the engine or the UI.
 *
 * In memory, stamps and version vectors name devices by ID. The codec maps
 * IDs to indexes into the snapshot's roster, so stamps stay small on Drive.
 */
import type { AssetKind, Mood } from '../snapshot/types';

export type { AssetKind, Mood };

export type DeviceId = string;

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
}

export type TextField = 'title' | 'text';

export interface EntryRecord extends RecordBase {
  readonly id: string;
  readonly title: MultiValue<string | null>;
  readonly text: MultiValue<string | null>;
  readonly mood: LastWriter<Mood | null>;
  /** The editable journal date. */
  readonly date: LastWriter<number>;
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
}

export interface SyncState {
  readonly vaultId: string;
  /** Highest HLC seen per device across the whole state. */
  readonly ctx: VersionVector;
  /** Device -> last time it wrote (its HLC). Joined by maximum. */
  readonly roster: Readonly<Record<DeviceId, number>>;
  /** Compaction floor; null until tombstone compaction ships. */
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
    floor: null,
    entries: new Map(),
    tags: new Map(),
    prompts: new Map(),
    profile: { vv: {}, name: [], photo: [] },
    media: new Map(),
  };
}
