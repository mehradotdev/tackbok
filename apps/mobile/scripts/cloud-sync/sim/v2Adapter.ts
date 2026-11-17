/**
 * Runs the simulation against the standalone v2 model. `pairwise`: a sync
 * joins one peer's state into this device's. `drive`: as on Drive, a sync
 * joins every published head, then publishes this device's state.
 */
import { sha256Text } from '../../../src/lib/cloudSync/snapshot/sha256';
import { canonicalState } from '../../../src/lib/cloudSync/v2/codec';
import { normalizeTitle } from '../../../src/lib/cloudSync/v2/ids';
import { join } from '../../../src/lib/cloudSync/v2/join';
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
  livePrompts,
  liveTags,
  memberIds,
  shownItems,
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

export class V2Adapter implements SimAdapter {
  readonly name: string;
  readonly supportsKeepBoth = true;
  readonly states: SyncState[];
  private readonly heads = new Map<number, SyncState>();

  constructor(
    count: number,
    readonly topology: 'pairwise' | 'drive' = 'pairwise',
    /** Replaced only by the negative-control tests. */
    private readonly joinStates: (left: SyncState, right: SyncState) => SyncState = join,
    /** Called with every state a device holds; property tests sample them. */
    private readonly record?: (state: SyncState) => void,
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
    const state = this.states[device];
    return {
      entries: liveEntries(state).map((entry) => ({
        id: entry.id,
        titles: shownItems(entry.title).map((item) => item.v),
        contents: shownItems(entry.text).map((item) => item.v),
        mood: entry.mood.v,
        date: entry.date.v,
        tagIds: memberIds(entry.tags),
        attachmentIds: attachmentIds(entry),
        returned: isReturned(entry),
      })),
      tags: liveTags(state).map((tag) => ({ id: tag.id, title: tag.title.v })),
      prompts: livePrompts(state).map((prompt) => ({
        id: prompt.id,
        title: prompt.title.v,
      })),
      profileNames: shownItems(state.profile.name).map((item) => item.v),
      profilePhotos: shownItems(state.profile.photo).map((item) => item.v),
    };
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
          Math.max(0, entry.date.v - event.offset),
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

  async sync(device: number, peer: number | null, _wall: number): Promise<SyncOutcome> {
    const before = this.states[device];
    let next = before;
    if (this.topology === 'pairwise') next = this.joinStates(before, this.states[peer!]);
    else for (const head of this.heads.values()) next = this.joinStates(next, head);
    this.record?.(next);
    const changed = canonicalState(next) !== canonicalState(before);
    this.states[device] = next;
    if (this.topology === 'drive') {
      const head = this.heads.get(device);
      const published = !head || canonicalState(head) !== canonicalState(next);
      this.heads.set(device, next);
      return { ok: true, changed: changed || published };
    }
    return { ok: true, changed };
  }

  fingerprint(device: number): string {
    return canonicalState(this.states[device]);
  }
}
