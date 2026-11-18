/**
 * Runs the simulation against the standalone v2 model. `pairwise`: a sync
 * takes in one peer's state. `drive`: as on Drive, a sync takes in every
 * published head, then publishes this device's state.
 *
 * A sync does what the engine will: refuse a state whose clock is too far
 * ahead, `absorb` the rest, acknowledge (`markSeen`) when the device holds
 * something it has not acknowledged, and `compact`. It fails the case if
 * compaction changes what the device shows.
 */
import { sha256Text } from '../../../src/lib/cloudSync/snapshot/sha256';
import {
  MAX_CONTEXT_AHEAD_MS,
  assertNotAhead,
} from '../../../src/lib/cloudSync/v2/clock';
import { canonicalState } from '../../../src/lib/cloudSync/v2/codec';
import {
  absorb,
  compact,
  isCompacted,
  type Absorbed,
} from '../../../src/lib/cloudSync/v2/compact';
import { normalizeTitle } from '../../../src/lib/cloudSync/v2/ids';
import * as ops from '../../../src/lib/cloudSync/v2/ops';
import {
  emptyState,
  type Item,
  type MediaDescriptor,
  type SyncState,
} from '../../../src/lib/cloudSync/v2/types';
import {
  attachmentIds,
  isReturned,
  liveEntries,
  memberIds,
  shownItems,
  shownNamed,
} from '../../../src/lib/cloudSync/v2/view';
import type {
  KeepEffect,
  KeepTarget,
  LocalEvent,
  SimAdapter,
  SyncOutcome,
  View,
} from './driver';

export const V2_VAULT = 'vault-sim';

export function mediaFor(
  assetId: string,
  owner: { type: 'entry'; entryId: string } | { type: 'profile' },
  createdAt: number,
): MediaDescriptor {
  return {
    assetId,
    ownerType: owner.type,
    ownerId: owner.type === 'entry' ? owner.entryId : 'profile',
    kind: owner.type === 'entry' ? 'photo' : 'profile-photo',
    blobHash: sha256Text(`blob:${assetId}`),
    mimeType: 'image/jpeg',
    byteSize: 1000,
    width: 10,
    height: 10,
    durationMs: null,
    createdAt,
    ext: {},
  };
}

/** Every item showing the same value as the shown one: an edit replaces them all. */
function sameAsShown<T>(items: readonly Item<T>[]) {
  const shown = shownItems(items)[0];
  if (!shown) return [];
  return items
    .filter((item) => JSON.stringify(item.v) === JSON.stringify(shown.v))
    .map((i) => i.s);
}

/** How a device takes in another state; replaced only by negative controls. */
export type Merge = (local: SyncState, remote: SyncState, writer: ops.Writer) => Absorbed;

/** A plain (possibly broken) join for the negative controls. */
export const plainMerge =
  (joinStates: (left: SyncState, right: SyncState) => SyncState): Merge =>
  (local, remote) => ({ state: joinStates(local, remote), revived: [] });

export const EXT_FEATURE = 'sim-note';

/** What a device holding `state` shows. */
export function viewOfState(state: SyncState): View {
  return {
    entries: liveEntries(state).map((entry) => ({
      id: entry.id,
      titles: shownItems(entry.title).map((item) => item.v),
      contents: shownItems(entry.text).map((item) => item.v),
      mood: entry.mood?.v ?? null,
      date: entry.date?.v ?? 0,
      tagIds: memberIds(entry.tags),
      attachmentIds: attachmentIds(entry),
      returned: isReturned(entry),
    })),
    // Merged on display: one per normalised title.
    tags: shownNamed(state, 'tag').map(({ id, title }) => ({ id, title })),
    prompts: shownNamed(state, 'prompt').map(({ id, title }) => ({ id, title })),
    profileNames: shownItems(state.profile.name).map((item) => item.v),
    profilePhotos: shownItems(state.profile.photo).map((item) => item.v),
  };
}

export class V2Adapter implements SimAdapter {
  readonly name: string;
  readonly maxAheadMs = MAX_CONTEXT_AHEAD_MS;
  readonly states: SyncState[];
  /** Syncs that refused a state whose clock was too far ahead. */
  refusedPulls = 0;
  /** Entries an unseen edit brought back after some device compacted them. */
  readonly revivedEntries: string[] = [];
  private readonly heads = new Map<number, SyncState>();

  constructor(
    count: number,
    readonly topology: 'pairwise' | 'drive' = 'pairwise',
    private readonly merge: Merge = absorb,
    /** Called with every state a device holds; property tests sample them. */
    private readonly record?: (state: SyncState) => void,
    /** Off only to compare a run against the same events without compaction. */
    private readonly compaction = true,
    /** Replaced only by a negative control. */
    private readonly compactState: (state: SyncState) => SyncState = compact,
  ) {
    this.name = `v2-${topology}`;
    this.states = Array.from({ length: count }, () => emptyState(V2_VAULT));
  }

  private writer(device: number, wall: number): ops.Writer {
    return { device: `device-${device}`, wallMs: wall };
  }

  normalizeTitle(kind: 'tag' | 'prompt', title: string): string {
    return normalizeTitle(kind, title);
  }

  view(device: number): View {
    return this.viewOf(this.states[device]);
  }

  private viewOf(state: SyncState): View {
    return viewOfState(state);
  }

  apply(device: number, event: LocalEvent, wall: number): boolean {
    try {
      const before = this.states[device];
      this.states[device] = this.next(before, event, this.writer(device, wall));
      this.record?.(this.states[device]);
      // A no-op (e.g. adding a tag the entry already has) wrote nothing.
      return this.states[device] !== before;
    } catch (error) {
      if (error instanceof ops.SyncOpError) return false;
      throw error;
    }
  }

  private next(state: SyncState, event: LocalEvent, writer: ops.Writer): SyncState {
    const entry = 'entryId' in event ? state.entries.get(event.entryId) : undefined;
    switch (event.kind) {
      case 'createEntry':
        return ops.createEntry(state, writer, {
          id: event.entryId,
          title: event.title,
          text: event.content,
          mood: event.mood,
          date: writer.wallMs,
        });
      case 'setTitle':
      case 'setContent': {
        const field = event.kind === 'setTitle' ? 'title' : 'text';
        if (!entry) throw new ops.SyncOpError('missing-entry', event.entryId);
        return ops.editText(
          state,
          writer,
          event.entryId,
          field,
          event.value,
          sameAsShown(entry[field]),
        );
      }
      case 'setMood':
        return ops.setMood(state, writer, event.entryId, event.mood);
      case 'setDate':
        if (!entry) throw new ops.SyncOpError('missing-entry', event.entryId);
        return ops.setDate(
          state,
          writer,
          event.entryId,
          Math.max(0, (entry.date?.v ?? 0) - event.offset),
        );
      case 'deleteEntry':
        return ops.deleteEntry(state, writer, event.entryId);
      case 'addTag':
        return ops.addTag(state, writer, event.entryId, event.tagId);
      case 'removeTag':
        return ops.removeTag(state, writer, event.entryId, event.tagId);
      case 'attach':
        return ops.attach(
          state,
          writer,
          event.entryId,
          mediaFor(
            event.assetId,
            { type: 'entry', entryId: event.entryId },
            writer.wallMs,
          ),
        );
      case 'detach':
        return ops.detach(state, writer, event.entryId, event.assetId);
      case 'createTag':
      case 'createPrompt':
        return ops.createNamed(
          state,
          writer,
          event.kind === 'createTag' ? 'tag' : 'prompt',
          event.title,
        ).state;
      case 'renameTag':
      case 'renamePrompt':
        return ops.renameNamed(
          state,
          writer,
          event.kind === 'renameTag' ? 'tag' : 'prompt',
          event.id,
          event.title,
        );
      case 'deleteTag':
      case 'deletePrompt':
        return ops.deleteNamed(
          state,
          writer,
          event.kind === 'deleteTag' ? 'tag' : 'prompt',
          event.id,
        );
      case 'setProfileName':
        return ops.setProfileName(
          state,
          writer,
          event.value,
          sameAsShown(state.profile.name),
        );
      case 'setProfilePhoto':
        return ops.setProfilePhoto(
          state,
          writer,
          event.assetId === null
            ? null
            : mediaFor(event.assetId, { type: 'profile' }, writer.wallMs),
          sameAsShown(state.profile.photo),
        );
      case 'reorder': {
        if (!entry) throw new ops.SyncOpError('missing-entry', event.entryId);
        const ids = attachmentIds(entry);
        if (ids.length < 2) throw new ops.SyncOpError('nothing-to-order', event.entryId);
        return ops.setAttachmentOrder(state, writer, event.entryId, [...ids].reverse());
      }
      case 'acknowledge':
        return ops.acknowledgeReturn(state, writer, event.entryId);
      case 'setExt':
        return ops.writeExt(
          state,
          writer,
          { kind: 'entry', id: event.entryId },
          EXT_FEATURE,
          event.value,
          'all',
        );
      case 'keep':
      case 'keepBoth':
        throw new ops.SyncOpError('use-keep', 'keep goes through keep()');
    }
  }

  keepTargets(device: number): KeepTarget[] {
    const state = this.states[device];
    const targets: KeepTarget[] = [];
    for (const entry of liveEntries(state)) {
      for (const field of ['title', 'text'] as const) {
        const options = shownItems(entry[field]).length;
        if (options > 1)
          targets.push({
            entryId: entry.id,
            field: field === 'text' ? 'content' : 'title',
            options,
          });
      }
    }
    const names = shownItems(state.profile.name).length;
    if (names > 1)
      targets.push({ entryId: 'profile', field: 'profileName', options: names });
    const photos = shownItems(state.profile.photo).length;
    if (photos > 1)
      targets.push({ entryId: 'profile', field: 'profilePhoto', options: photos });
    return targets;
  }

  keep(
    device: number,
    event: Extract<LocalEvent, { kind: 'keep' | 'keepBoth' }>,
    wall: number,
  ): KeepEffect | null {
    const state = this.states[device];
    const writer = this.writer(device, wall);
    const { target } = event;
    try {
      if (target.field === 'profileName' || target.field === 'profilePhoto') {
        if (event.kind !== 'keep') return null;
        const field = target.field === 'profileName' ? 'name' : 'photo';
        const shown = shownItems(state.profile[field]);
        if (shown.length < 2) return null;
        const chosen = shown[event.index % shown.length];
        this.states[device] = ops.keepProfile(state, writer, field, chosen.s);
        this.record?.(this.states[device]);
        if (field === 'photo')
          return { removed: [], affirmed: [], writes: [], deletes: [] };
        return {
          removed: shown
            .filter((item) => item !== chosen)
            .map((item) => ({ value: item.v, entryId: 'profile' })),
          affirmed: [{ value: chosen.v, entryId: 'profile' }],
          writes: [],
          deletes: [],
        };
      }
      const entry = state.entries.get(target.entryId);
      const field = target.field === 'content' ? 'text' : 'title';
      if (!entry) return null;
      const shown = shownItems(entry[field]);
      if (shown.length < 2) return null;
      const chosen = shown[event.index % shown.length];
      if (event.kind === 'keep') {
        this.states[device] = ops.keepValue(state, writer, entry.id, field, chosen.s);
        this.record?.(this.states[device]);
        return {
          removed: shown
            .filter((item) => item !== chosen)
            .map((item) => ({ value: item.v, entryId: entry.id })),
          affirmed: [{ value: chosen.v, entryId: entry.id }],
          writes: [entry.id],
          deletes: [],
        };
      }
      const moved = shown[(event.index + 1) % shown.length];
      const result = ops.keepBoth(state, writer, entry.id, field, chosen.s, moved.s);
      // A split entry compacted meanwhile is filled again from this entry, and
      // one made from an entry brought back after compaction copies its values.
      const prior = state.entries.get(result.newEntryId);
      if ((prior && isCompacted(prior)) || this.revivedEntries.includes(entry.id))
        this.revivedEntries.push(result.newEntryId);
      this.states[device] = result.state;
      this.record?.(result.state);
      return {
        // The moved value leaves the original; a third version stays open.
        removed: [{ value: moved.v, entryId: entry.id }],
        // The moved value and a copy of the shown title or text go to the new entry.
        affirmed: [
          { value: chosen.v, entryId: entry.id },
          { value: moved.v, entryId: result.newEntryId },
          {
            value: shownItems(entry[field === 'title' ? 'text' : 'title'])[0]?.v ?? null,
            entryId: result.newEntryId,
          },
        ],
        writes: [entry.id, result.newEntryId],
        deletes: [],
      };
    } catch (error) {
      if (error instanceof ops.SyncOpError) return null;
      throw error;
    }
  }

  async sync(device: number, peer: number | null, wall: number): Promise<SyncOutcome> {
    const before = this.states[device];
    const writer = this.writer(device, wall);
    const sources =
      this.topology === 'pairwise' ? [this.states[peer!]] : [...this.heads.values()];
    // All or nothing, so the oracle's record of what the device has seen holds.
    let pulled = true;
    try {
      for (const source of sources) assertNotAhead(source, wall);
    } catch {
      pulled = false;
      this.refusedPulls++;
    }
    let next = before;
    const revived: string[] = [];
    if (pulled)
      for (const source of sources) {
        const absorbed = this.merge(next, source, writer);
        next = absorbed.state;
        revived.push(...absorbed.revived);
        this.revivedEntries.push(...absorbed.revived);
      }
    if (ops.needsAck(next, writer.device)) next = ops.markSeen(next, writer);
    if (this.compaction) {
      const shown = JSON.stringify(this.viewOf(next));
      const compacted = this.compactState(next);
      if (JSON.stringify(this.viewOf(compacted)) !== shown)
        return { ok: false, reason: 'compaction changed what the device shows' };
      next = compacted;
    }
    this.record?.(next);
    const changed = canonicalState(next) !== canonicalState(before);
    this.states[device] = next;
    if (this.topology === 'drive') {
      const head = this.heads.get(device);
      const published = !head || canonicalState(head) !== canonicalState(next);
      this.heads.set(device, next);
      return { ok: true, changed: changed || published, pulled, revived };
    }
    return { ok: true, changed, pulled, revived };
  }

  fingerprint(device: number): string {
    return canonicalState(this.states[device]);
  }
}
