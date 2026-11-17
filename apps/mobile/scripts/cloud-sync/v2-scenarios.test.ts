/**
 * Phase 0 (#185): named v2 scenarios. Restates the `merge.test.ts` and #182
 * cases that still make sense in v2, the clock cases, the envelope rules, and
 * the two counterexamples that made v2 differ from the design report.
 */
import { describe, expect, test } from 'bun:test';

import { canonicalize } from '../../src/lib/cloudSync/snapshot/canonical';
import { SnapshotValidationError } from '../../src/lib/cloudSync/snapshot/caps';
import { sha256Bytes, sha256Text } from '../../src/lib/cloudSync/snapshot/sha256';
import {
  ClockAheadError,
  MAX_CONTEXT_AHEAD_MS,
  ROSTER_EXPIRY_MS,
  compareStamps,
  nextHlc,
} from '../../src/lib/cloudSync/v2/clock';
import {
  absorb,
  activeDevices,
  compact,
  compactionFloor,
  isCompacted,
} from '../../src/lib/cloudSync/v2/compact';
import {
  SnapshotUpdateRequiredError,
  canonicalState,
  decodeEnvelope,
  decodeHeader,
  encodeEnvelope,
} from '../../src/lib/cloudSync/v2/codec';
import { namedId, normalizeTitle } from '../../src/lib/cloudSync/v2/ids';
import { SyncJoinError, join, knows } from '../../src/lib/cloudSync/v2/join';
import * as ops from '../../src/lib/cloudSync/v2/ops';
import { emptyState, type SyncState } from '../../src/lib/cloudSync/v2/types';
import {
  attachmentIds,
  isLive,
  isReturned,
  liveEntries,
  livePrompts,
  liveTags,
  memberIds,
  shownItems,
  shownNamed,
  shownTagIds,
} from '../../src/lib/cloudSync/v2/view';
import { encodeGzip } from '../../src/lib/zip/core/gzip-codec';
import { mediaFor } from './sim/v2Adapter';

const VAULT = 'vault-scenarios';
const T0 = 1_800_000_000_000;
const HOUR = 3_600_000;
const YEAR = 365 * 24 * HOUR;
let clock = T0;
/** A writer on `device` whose wall clock is `offset` away from the shared time. */
const at = (device: string, offset = 0): ops.Writer => {
  clock += 1_000;
  return { device, wallMs: clock + offset };
};

const C = canonicalState;
const joinAll = (...states: SyncState[]) =>
  states.reduce((left, right) => join(left, right));

function permutations<T>(values: T[]): T[][] {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [
      value,
      ...rest,
    ]),
  );
}

/** Every order of folding the states gives the same bytes; returns that state. */
function convergeInEveryOrder(states: SyncState[]): SyncState {
  const results = permutations(states).map((order) => joinAll(...order));
  for (const result of results) expect(C(result)).toBe(C(results[0]));
  // Pairwise trees too, not only left folds.
  if (states.length === 3) {
    const [a, b, c] = states;
    expect(C(join(a, join(b, c)))).toBe(C(results[0]));
    expect(C(join(join(c, a), b))).toBe(C(results[0]));
  }
  return results[0];
}

const texts = (state: SyncState, entryId: string) =>
  shownItems(state.entries.get(entryId)!.text).map((item) => item.v);
const titles = (state: SyncState, entryId: string) =>
  shownItems(state.entries.get(entryId)!.title).map((item) => item.v);

function entryWith(text: string, device = 'device-a'): SyncState {
  return ops.createEntry(emptyState(VAULT), at(device), {
    id: 'e1',
    title: 'Title',
    text,
    mood: 'HAPPY',
    date: T0,
  });
}

function primaryStamp(state: SyncState, entryId: string, field: 'title' | 'text') {
  return shownItems(state.entries.get(entryId)![field])[0].s;
}

/** Edits the shown value, as the entry screen does. */
function edit(
  state: SyncState,
  writer: ops.Writer,
  field: 'title' | 'text',
  value: string,
) {
  return ops.editText(state, writer, 'e1', field, value, [
    primaryStamp(state, 'e1', field),
  ]);
}

describe('restated merge.test.ts scenarios', () => {
  test('a title edit, a text edit and a one-sided date edit merge without a conflict', () => {
    const base = entryWith('Text');
    const a = ops.setDate(
      edit(base, at('device-a'), 'title', 'New title'),
      at('device-a'),
      'e1',
      5,
    );
    const b = edit(base, at('device-b'), 'text', 'New text');
    const merged = convergeInEveryOrder([a, b]);
    expect(titles(merged, 'e1')).toEqual(['New title']);
    expect(texts(merged, 'e1')).toEqual(['New text']);
    expect(merged.entries.get('e1')!.date!.v).toBe(5);
  });

  test('concurrent text edits stay inside the entry as versions; no copy entry appears', () => {
    const base = entryWith('Original');
    const a = edit(base, at('device-a'), 'text', 'From A');
    const b = edit(base, at('device-b'), 'text', 'From B');
    const merged = convergeInEveryOrder([a, b]);
    expect(liveEntries(merged).map((entry) => entry.id)).toEqual(['e1']);
    expect([...texts(merged, 'e1')].sort()).toEqual(['From A', 'From B']);
    // The newest stamp is the one shown.
    expect(texts(merged, 'e1')[0]).toBe('From B');
  });

  test('attachments added and removed on two devices merge independently of their order', () => {
    let base = entryWith('Text');
    for (const id of ['a1', 'a2'])
      base = ops.attach(
        base,
        at('device-a'),
        'e1',
        mediaFor(id, { type: 'entry', entryId: 'e1' }, T0),
      );
    const a = ops.setAttachmentOrder(
      ops.detach(base, at('device-a'), 'e1', 'a1'),
      at('device-a'),
      'e1',
      ['a2'],
    );
    const b = ops.setAttachmentOrder(
      ops.attach(
        base,
        at('device-b'),
        'e1',
        mediaFor('b1', { type: 'entry', entryId: 'e1' }, T0),
      ),
      at('device-b'),
      'e1',
      ['b1', 'a2', 'a1'],
    );
    const merged = convergeInEveryOrder([a, b]);
    expect(attachmentIds(merged.entries.get('e1')!)).toEqual(['b1', 'a2']);
    expect([...merged.media.keys()].sort()).toEqual(['a2', 'b1']);
  });

  test('a delete that saw every write wins over an unchanged copy and hides it everywhere', () => {
    let base = entryWith('Text');
    base = ops.createNamed(base, at('device-a'), 'tag', 'Work').state;
    const tagId = namedId('tag', VAULT, 'Work');
    base = ops.addTag(base, at('device-a'), 'e1', tagId);
    const deleted = ops.deleteEntry(base, at('device-b'), 'e1');
    const merged = convergeInEveryOrder([base, deleted]);
    expect(liveEntries(merged)).toEqual([]);
    expect(isReturned(merged.entries.get('e1')!)).toBe(false);
    expect(liveTags(merged).map((tag) => tag.id)).toEqual([tagId]);
  });

  test('an edit the deleter had not seen brings the entry back whole, photos included', () => {
    let base = entryWith('Text');
    base = ops.attach(
      base,
      at('device-a'),
      'e1',
      mediaFor('p1', { type: 'entry', entryId: 'e1' }, T0),
    );
    base = ops.createNamed(base, at('device-a'), 'tag', 'Work').state;
    base = ops.addTag(base, at('device-a'), 'e1', namedId('tag', VAULT, 'Work'));
    const deleted = ops.deleteEntry(base, at('device-b'), 'e1');
    const edited = ops.setMood(base, at('device-a'), 'e1', 'SAD');
    const merged = convergeInEveryOrder([deleted, edited]);
    const entry = merged.entries.get('e1')!;
    expect(isLive(entry)).toBe(true);
    expect(isReturned(entry)).toBe(true);
    expect(texts(merged, 'e1')).toEqual(['Text']);
    expect(attachmentIds(entry)).toEqual(['p1']);
    expect(memberIds(entry.tags)).toEqual([namedId('tag', VAULT, 'Work')]);
    // "Got it" syncs and never brings an entry back by itself.
    const acknowledged = ops.acknowledgeReturn(merged, at('device-b'), 'e1');
    const after = convergeInEveryOrder([acknowledged, merged, edited]);
    expect(isReturned(after.entries.get('e1')!)).toBe(false);
    expect(isLive(after.entries.get('e1')!)).toBe(true);
  });

  test('a returned entry deleted again stays deleted', () => {
    const base = entryWith('Text');
    const returned = join(
      ops.deleteEntry(base, at('device-b'), 'e1'),
      ops.setMood(base, at('device-a'), 'e1', 'SAD'),
    );
    const again = ops.deleteEntry(returned, at('device-a'), 'e1');
    expect(isLive(convergeInEveryOrder([again, returned, base]).entries.get('e1')!)).toBe(
      false,
    );
  });

  test('a fresh device adopts a profile name; a clear and a rename stay as two versions', () => {
    const named = ops.setProfileName(emptyState(VAULT), at('device-a'), 'Mehra', []);
    const fresh = emptyState(VAULT);
    expect(
      shownItems(convergeInEveryOrder([named, fresh]).profile.name).map((i) => i.v),
    ).toEqual(['Mehra']);
    const cleared = ops.setProfileName(named, at('device-a'), null, 'all');
    const renamed = ops.setProfileName(named, at('device-b'), 'M.', 'all');
    const merged = convergeInEveryOrder([cleared, renamed]);
    expect(new Set(shownItems(merged.profile.name).map((i) => i.v))).toEqual(
      new Set([null, 'M.']),
    );
    // "Keep this one" settles it on every device.
    const chosen = shownItems(merged.profile.name).find((item) => item.v === 'M.')!;
    const kept = ops.keepProfile(merged, at('device-a'), 'name', chosen.s);
    expect(
      shownItems(convergeInEveryOrder([kept, cleared, renamed]).profile.name).map(
        (i) => i.v,
      ),
    ).toEqual(['M.']);
  });

  test('a replaced profile photo loses its descriptor; an open photo version keeps its own', () => {
    const p1 = mediaFor('p1', { type: 'profile' }, T0);
    const base = ops.setProfilePhoto(emptyState(VAULT), at('device-a'), p1, 'all');
    const a = ops.setProfilePhoto(
      base,
      at('device-a'),
      mediaFor('p2', { type: 'profile' }, T0),
      'all',
    );
    expect([...a.media.keys()]).toEqual(['p2']);
    const b = ops.setProfilePhoto(
      base,
      at('device-b'),
      mediaFor('p3', { type: 'profile' }, T0),
      'all',
    );
    const merged = convergeInEveryOrder([a, b, base]);
    expect([...merged.media.keys()].sort()).toEqual(['p2', 'p3']);
  });
});

describe('keeping versions (#182)', () => {
  function threeVersions() {
    const base = entryWith('Original');
    const a = edit(base, at('device-a'), 'text', 'X');
    const b = edit(base, at('device-b'), 'text', 'Y');
    const c = edit(base, at('device-c'), 'text', 'Z');
    const all = joinAll(a, b, c);
    const stampOf = (value: string) =>
      all.entries.get('e1')!.text.find((item) => item.v === value)!.s;
    return { all, stampOf };
  }

  test('two devices keeping different versions keep both open, in any order', () => {
    const { all, stampOf } = threeVersions();
    const a = ops.keepValue(all, at('device-a'), 'e1', 'text', stampOf('X'));
    const b = ops.keepValue(all, at('device-b'), 'e1', 'text', stampOf('Y'));
    expect([...texts(convergeInEveryOrder([a, b]), 'e1')].sort()).toEqual(['X', 'Y']);
  });

  test('two devices keeping the same version resolve the conflict', () => {
    const { all, stampOf } = threeVersions();
    const a = ops.keepValue(all, at('device-a'), 'e1', 'text', stampOf('X'));
    const b = ops.keepValue(all, at('device-b'), 'e1', 'text', stampOf('X'));
    expect(texts(convergeInEveryOrder([a, b, all]), 'e1')).toEqual(['X']);
  });

  test('limit 1: three devices, each keeping, editing or deleting a different version', () => {
    const { all, stampOf } = threeVersions();
    const a = ops.keepValue(all, at('device-a'), 'e1', 'text', stampOf('X'));
    const b = ops.keepValue(all, at('device-b'), 'e1', 'text', stampOf('Y'));
    const c = ops.editText(all, at('device-c'), 'e1', 'text', 'Z edited', [stampOf('Z')]);
    const merged = convergeInEveryOrder([a, b, c]);
    expect([...texts(merged, 'e1')].sort()).toEqual(['X', 'Y', 'Z edited']);
    // A device deleting the whole entry meanwhile does not remove the kept versions.
    const deleted = ops.deleteEntry(all, at('device-d'), 'e1');
    const withDelete = convergeInEveryOrder([a, b, deleted]);
    expect(isLive(withDelete.entries.get('e1')!)).toBe(true);
    expect([...texts(withDelete, 'e1')].sort()).toEqual(['X', 'Y']);
  });

  test('limit 2: a version dismissed long ago never returns; a late keep of it is kept', () => {
    const { all, stampOf } = threeVersions();
    // Device D last synced before A resolved; much later it keeps Y.
    const resolved = ops.keepValue(all, at('device-a'), 'e1', 'text', stampOf('X'));
    let later = resolved;
    for (let i = 0; i < 20; i++)
      later = edit(later, at('device-a'), 'title', `Title ${i}`);
    const lateKeep = ops.keepValue(
      all,
      at('device-d', -YEAR),
      'e1',
      'text',
      stampOf('Y'),
    );
    const merged = convergeInEveryOrder([later, lateKeep, all]);
    expect([...texts(merged, 'e1')].sort()).toEqual(['X', 'Y']);
    // Without that late keep, the dismissed versions stay gone.
    expect(texts(convergeInEveryOrder([later, all]), 'e1')).toEqual(['X']);
  });

  test('"Keep both" on two devices at once makes one new entry', () => {
    const base = entryWith('Original');
    const all = join(
      edit(base, at('device-a'), 'text', 'X'),
      edit(base, at('device-b'), 'text', 'Y'),
    );
    const sx = all.entries.get('e1')!.text.find((i) => i.v === 'X')!.s;
    const sy = all.entries.get('e1')!.text.find((i) => i.v === 'Y')!.s;
    const a = ops.keepBoth(all, at('device-a'), 'e1', 'text', sx, sy);
    const b = ops.keepBoth(all, at('device-b'), 'e1', 'text', sx, sy);
    expect(a.newEntryId).toBe(b.newEntryId);
    const merged = convergeInEveryOrder([a.state, b.state]);
    expect(
      liveEntries(merged)
        .map((e) => e.id)
        .sort(),
    ).toEqual(['e1', a.newEntryId].sort());
    expect(texts(merged, 'e1')).toEqual(['X']);
    expect(texts(merged, a.newEntryId)).toEqual(['Y']);
  });

  test('"Keep both" leaves a third version open and revives a deleted split entry', () => {
    const base = entryWith('Original');
    const all = joinAll(
      edit(base, at('device-a'), 'text', 'X'),
      edit(base, at('device-b'), 'text', 'Y'),
      edit(base, at('device-c'), 'text', 'Z'),
    );
    const stampOf = (value: string) =>
      all.entries.get('e1')!.text.find((i) => i.v === value)!.s;
    const first = ops.keepBoth(
      all,
      at('device-a'),
      'e1',
      'text',
      stampOf('X'),
      stampOf('Y'),
    );
    expect([...texts(first.state, 'e1')].sort()).toEqual(['X', 'Z']);
    // Device B holds the deleted split entry but not A's change to e1 (for
    // example a copy missing e1); it then keeps both Z and Y.
    const deleted = ops.deleteEntry(first.state, at('device-a'), first.newEntryId);
    const splitOnly: SyncState = {
      ...deleted,
      entries: new Map([[first.newEntryId, deleted.entries.get(first.newEntryId)!]]),
      media: new Map(),
    };
    const again = ops.keepBoth(
      join(all, splitOnly),
      at('device-b'),
      'e1',
      'text',
      stampOf('Z'),
      stampOf('Y'),
    );
    expect(texts(again.state, first.newEntryId)).toContain('Y');
    expect(isLive(again.state.entries.get(first.newEntryId)!)).toBe(true);
  });

  test('known wart: a keep concurrent with an edit of the kept version re-opens a conflict', () => {
    const base = entryWith('Original');
    const all = join(
      edit(base, at('device-a'), 'text', 'X'),
      edit(base, at('device-b'), 'text', 'Y'),
    );
    const sx = all.entries.get('e1')!.text.find((i) => i.v === 'X')!.s;
    const kept = ops.keepValue(all, at('device-a'), 'e1', 'text', sx);
    // Device C edits X without having seen the keep; nothing is lost, but X
    // shows again beside C's edit.
    const editedX = ops.editText(all, at('device-c'), 'e1', 'text', 'X edited', [sx]);
    expect([...texts(convergeInEveryOrder([kept, editedX]), 'e1')].sort()).toEqual([
      'X',
      'X edited',
    ]);
  });
});

describe('tags and prompts with title-derived IDs', () => {
  test('two devices creating "Work" and "work" offline get one tag', () => {
    const a = ops.createNamed(emptyState(VAULT), at('device-a'), 'tag', 'Work');
    const b = ops.createNamed(emptyState(VAULT), at('device-b'), 'tag', ' work');
    expect(a.id).toBe(b.id);
    expect(liveTags(convergeInEveryOrder([a.state, b.state])).length).toBe(1);
    // Prompts are case-insensitive in the app too.
    const pa = ops.createNamed(
      emptyState(VAULT),
      at('device-a'),
      'prompt',
      'One  good thing',
    );
    const pb = ops.createNamed(
      emptyState(VAULT),
      at('device-b'),
      'prompt',
      'one good thing',
    );
    expect(pa.id).toBe(pb.id);
    expect(normalizeTitle('tag', 'Café')).toBe(normalizeTitle('tag', 'Café'));
  });

  test('a tag deleted on one device while added to an entry on another comes back', () => {
    let base = entryWith('Text');
    const created = ops.createNamed(base, at('device-a'), 'tag', 'Work');
    base = ops.createEntry(created.state, at('device-a'), {
      id: 'e2',
      title: null,
      text: 'Two',
      mood: null,
      date: T0,
    });
    const tagged = ops.addTag(base, at('device-a'), 'e1', created.id);
    const deleted = ops.deleteNamed(base, at('device-b'), 'tag', created.id);
    const merged = convergeInEveryOrder([tagged, deleted]);
    expect(liveTags(merged).map((t) => t.id)).toEqual([created.id]);
    expect(isLive(merged.tags.get(created.id)!)).toBe(false);
    // Without the concurrent add it stays deleted.
    expect(liveTags(convergeInEveryOrder([base, deleted]))).toEqual([]);
  });

  test('deleting a tag never brings back an entry another device deleted', () => {
    let base = entryWith('Text');
    const created = ops.createNamed(base, at('device-a'), 'tag', 'Work');
    base = ops.addTag(created.state, at('device-a'), 'e1', created.id);
    const tagDeleted = ops.deleteNamed(base, at('device-a'), 'tag', created.id);
    const entryDeleted = ops.deleteEntry(base, at('device-b'), 'e1');
    expect(liveEntries(convergeInEveryOrder([tagDeleted, entryDeleted]))).toEqual([]);
  });

  test('delete then re-create reuses the ID, shows the tag again, without old memberships', () => {
    let base = entryWith('Text');
    const created = ops.createNamed(base, at('device-a'), 'tag', 'Work');
    base = ops.addTag(created.state, at('device-a'), 'e1', created.id);
    const deleted = ops.deleteNamed(base, at('device-a'), 'tag', created.id);
    const again = ops.createNamed(deleted, at('device-a'), 'tag', 'WORK');
    expect(again.id).toBe(created.id);
    const merged = convergeInEveryOrder([again.state, base, deleted]);
    expect(liveTags(merged).map((t) => t.title.v)).toEqual(['WORK']);
    expect(merged.entries.get('e1')!.tags).toEqual([]);
  });

  test('re-creating a title a tag was renamed away from makes a new tag', () => {
    const work = ops.createNamed(emptyState(VAULT), at('device-a'), 'tag', 'Work');
    const renamed = ops.renameNamed(work.state, at('device-a'), 'tag', work.id, 'Job');
    const again = ops.createNamed(renamed, at('device-a'), 'tag', 'Work');
    expect(again.id).not.toBe(work.id);
    expect(
      liveTags(again.state)
        .map((t) => t.title.v)
        .sort(),
    ).toEqual(['Job', 'Work']);
    // Another device doing the same from the same state picks the same ID.
    expect(ops.createNamed(renamed, at('device-b'), 'tag', 'work').id).toBe(again.id);
  });

  test('a delete and re-create elsewhere never undoes a concurrent rename', () => {
    const work = ops.createNamed(emptyState(VAULT), at('device-a'), 'tag', 'Work');
    const renamed = ops.renameNamed(work.state, at('device-a'), 'tag', work.id, 'Job');
    const deleted = ops.deleteNamed(work.state, at('device-b'), 'tag', work.id);
    const recreated = ops.createNamed(deleted, at('device-b'), 'tag', 'Work');
    // The deleted holder still has the title, so it is revived on B...
    expect(recreated.id).toBe(work.id);
    // ...and a concurrent rename beats nothing: last writer wins on the title.
    const merged = convergeInEveryOrder([renamed, recreated.state]);
    expect(liveTags(merged).length).toBe(1);
    // But once B has seen the rename, re-creating "Work" makes a new tag.
    const seen = ops.deleteNamed(renamed, at('device-b'), 'tag', work.id);
    const fresh = ops.createNamed(seen, at('device-b'), 'tag', 'Work');
    expect(fresh.id).not.toBe(work.id);
  });

  test('a deleted tag cannot be added to an entry until it is created again', () => {
    const created = ops.createNamed(entryWith('Text'), at('device-a'), 'tag', 'Work');
    const deleted = ops.deleteNamed(created.state, at('device-a'), 'tag', created.id);
    expect(() => ops.addTag(deleted, at('device-a'), 'e1', created.id)).toThrow(
      ops.SyncOpError,
    );
  });

  test('a profile photo cannot reuse an asset ID with another descriptor', () => {
    const p1 = mediaFor('p1', { type: 'profile' }, T0);
    const base = ops.setProfilePhoto(emptyState(VAULT), at('device-a'), p1, 'all');
    expect(() =>
      ops.setProfilePhoto(base, at('device-a'), { ...p1, byteSize: 999 }, 'all'),
    ).toThrow(ops.SyncOpError);
    const other = ops.setProfilePhoto(
      emptyState(VAULT),
      at('device-b'),
      { ...p1, byteSize: 999 },
      'all',
    );
    expect(() => join(base, other)).toThrow(SyncJoinError);
  });

  test('a rename onto a title another device creates gives two records, shown as one tag', () => {
    const base = ops.createNamed(emptyState(VAULT), at('device-a'), 'tag', 'Work');
    let renamed = ops.renameNamed(base.state, at('device-a'), 'tag', base.id, 'Job');
    renamed = ops.createEntry(renamed, at('device-a'), {
      id: 'e1',
      title: null,
      text: 'A',
      mood: null,
      date: T0,
    });
    renamed = ops.addTag(renamed, at('device-a'), 'e1', base.id);
    const created = ops.createNamed(base.state, at('device-b'), 'tag', 'job');
    const merged = convergeInEveryOrder([renamed, created.state]);
    expect(
      liveTags(merged)
        .map((t) => t.title.v)
        .sort(),
    ).toEqual(['Job', 'job']);
    // Display-level merge: one tag, shown with the title written last.
    const shown = shownNamed(merged, 'tag');
    expect(shown).toHaveLength(1);
    expect(shown[0].ids).toEqual([base.id, created.id].sort());
    expect(shown[0].title).toBe('job');
    expect(shown[0].id).toBe(created.id);
    expect(shownTagIds(merged.entries.get('e1')!, shown)).toEqual([created.id]);
    // Renaming, removing or deleting the shown tag acts on every record in it.
    const again = ops.renameShown(merged, at('device-a'), 'tag', shown[0].ids, 'Career');
    expect(shownNamed(again, 'tag').map((t) => [t.title, t.ids.length])).toEqual([
      ['Career', 2],
    ]);
    const removed = ops.removeShownTag(merged, at('device-a'), 'e1', shown[0].ids);
    expect(removed.entries.get('e1')!.tags).toEqual([]);
    const deleted = ops.deleteShown(merged, at('device-a'), 'tag', shown[0].ids);
    expect(shownNamed(deleted, 'tag')).toEqual([]);
    // A third title another live tag holds is still refused.
    const other = ops.createNamed(merged, at('device-a'), 'tag', 'Home');
    expect(() =>
      ops.renameShown(other.state, at('device-a'), 'tag', shown[0].ids, 'home'),
    ).toThrow(ops.SyncOpError);
  });

  test('prompts merge on display the same way', () => {
    const base = ops.createNamed(emptyState(VAULT), at('device-a'), 'prompt', 'One');
    const renamed = ops.renameNamed(base.state, at('device-a'), 'prompt', base.id, 'Two');
    const created = ops.createNamed(base.state, at('device-b'), 'prompt', 'TWO');
    const merged = convergeInEveryOrder([renamed, created.state]);
    expect(livePrompts(merged)).toHaveLength(2);
    expect(shownNamed(merged, 'prompt').map((p) => p.title)).toEqual(['TWO']);
  });
});

describe('clocks', () => {
  test('a causally later edit wins even when its clock is a year behind', () => {
    const base = ops.setMood(entryWith('Text'), at('device-a', +YEAR), 'e1', 'SAD');
    const later = ops.setMood(base, at('device-b', -YEAR), 'e1', 'AWFUL');
    expect(convergeInEveryOrder([base, later]).entries.get('e1')!.mood!.v).toBe('AWFUL');
  });

  test('stamps keep increasing when the wall clock jumps backwards', () => {
    let state = entryWith('Text');
    const stamps = [state.entries.get('e1')!.mood!.s];
    for (const offset of [0, -HOUR, -10 * YEAR, -10 * YEAR, +HOUR]) {
      state = ops.setMood(state, at('device-a', offset), 'e1', 'OKAY');
      stamps.push(state.entries.get('e1')!.mood!.s);
    }
    for (let i = 1; i < stamps.length; i++)
      expect(compareStamps(stamps[i], stamps[i - 1])).toBe(1);
  });

  test('the join alone lets a device years ahead drag the clock; every order still agrees', () => {
    const base = entryWith('Text');
    const future = ops.setMood(base, at('device-f', 30 * YEAR), 'e1', 'SAD');
    const normal = ops.setMood(base, at('device-n'), 'e1', 'AWFUL');
    // Concurrent: the future stamp wins; after seeing it, a normal device writes above it.
    expect(convergeInEveryOrder([future, normal]).entries.get('e1')!.mood!.v).toBe('SAD');
    const after = ops.setMood(join(future, normal), at('device-n'), 'e1', 'HAPPY');
    expect(after.entries.get('e1')!.mood!.s[0]).toBeGreaterThan(
      future.entries.get('e1')!.mood!.s[0],
    );
    expect(convergeInEveryOrder([after, future, normal]).entries.get('e1')!.mood!.v).toBe(
      'HAPPY',
    );
  });

  test('equal HLCs on two devices break ties by device ID in both orders', () => {
    const base = entryWith('Text');
    const hlc = nextHlc(base.ctx, 0);
    const a = ops.setMood(base, { device: 'device-a', wallMs: 0 }, 'e1', 'SAD');
    const b = ops.setMood(base, { device: 'device-b', wallMs: 0 }, 'e1', 'AWFUL');
    expect(a.entries.get('e1')!.mood!.s).toEqual([hlc, 'device-a']);
    expect(b.entries.get('e1')!.mood!.s).toEqual([hlc, 'device-b']);
    expect(convergeInEveryOrder([a, b]).entries.get('e1')!.mood!.v).toBe('AWFUL');
  });

  test('the HLC refuses to pass the timestamp cap any snapshot can carry', () => {
    expect(() => nextHlc({ d: Number.MAX_SAFE_INTEGER }, 0)).toThrow(RangeError);
    expect(() => nextHlc({ d: 8_640_000_000_000_000 }, 0)).toThrow(RangeError);
    expect(nextHlc({ d: 8_639_999_999_999_998 }, 0)).toBe(8_639_999_999_999_999);
  });
});

/**
 * The design report's rule 2 ("one side has the record, the other only a
 * tombstone: keep the record whole if any of its stamps is outside
 * tombstone.seen, drop it otherwise") with one context per snapshot, written
 * literally for one text register and a mood. Not associative.
 */
describe('why v2 differs from the design report', () => {
  type Stamp = [number, string];
  interface Literal {
    ctx: Record<string, number>;
    record: { text: { s: Stamp; v: string }[]; mood: { s: Stamp; v: string } } | null;
    seen: Record<string, number> | null;
  }
  const covered = (vv: Record<string, number>, [h, d]: Stamp) => (vv[d] ?? -1) >= h;
  const maxVv = (a: Record<string, number>, b: Record<string, number>) => {
    const out = { ...a };
    for (const [d, h] of Object.entries(b)) out[d] = Math.max(out[d] ?? -1, h);
    return out;
  };
  const stampsOf = (record: NonNullable<Literal['record']>) => [
    ...record.text.map((item) => item.s),
    record.mood!.s,
  ];
  function literalJoin(a: Literal, b: Literal): Literal {
    const ctx = maxVv(a.ctx, b.ctx);
    const seen = a.seen && b.seen ? maxVv(a.seen, b.seen) : (a.seen ?? b.seen);
    let record: Literal['record'];
    if (a.record && b.record) {
      const key = (s: Stamp) => s.join('/');
      const inB = new Set(b.record.text.map((i) => key(i.s)));
      const inA = new Set(a.record.text.map((i) => key(i.s)));
      record = {
        text: [
          ...a.record.text.filter((i) => inB.has(key(i.s)) || !covered(b.ctx, i.s)),
          ...b.record.text.filter((i) => !inA.has(key(i.s)) && !covered(a.ctx, i.s)),
        ],
        mood:
          compareStamps(a.record.mood!.s, b.record.mood!.s) >= 0
            ? a.record.mood
            : b.record.mood,
      };
    } else record = a.record ?? b.record;
    // Rule 2: kept whole while one stamp escapes the tombstone.
    if (record && seen && stampsOf(record).every((s) => covered(seen, s))) record = null;
    return { ctx, record, seen };
  }
  const textOf = (state: Literal) => state.record?.text.map((i) => i.v) ?? null;

  test('rule 2 as written is not associative; the v2 join is', () => {
    // a: the entry with text x, plus a mood edit on device A nobody else saw.
    // b: device B replaced x with y. c: device C saw y, then deleted the entry.
    const x: Stamp = [1, 'A'],
      y: Stamp = [2, 'B'],
      m: Stamp = [4, 'A'];
    const a: Literal = {
      ctx: { A: 4 },
      record: { text: [{ s: x, v: 'x' }], mood: { s: m, v: 'SAD' } },
      seen: null,
    };
    const b: Literal = {
      ctx: { A: 1, B: 2 },
      record: { text: [{ s: y, v: 'y' }], mood: { s: x, v: 'OK' } },
      seen: null,
    };
    const c: Literal = {
      ctx: { A: 1, B: 2, C: 3 },
      record: null,
      seen: { A: 1, B: 2, C: 3 },
    };
    expect(textOf(literalJoin(literalJoin(a, b), c))).toEqual(['y']);
    expect(textOf(literalJoin(a, literalJoin(b, c)))).toEqual(['x']); // x was replaced, yet returns

    // The same history in v2.
    const base = entryWith('x', 'device-a');
    const va = ops.setMood(base, at('device-a'), 'e1', 'SAD');
    const vb = edit(base, at('device-b'), 'text', 'y');
    const vc = ops.deleteEntry(vb, at('device-c'), 'e1');
    const merged = convergeInEveryOrder([va, vb, vc]);
    expect(texts(merged, 'e1')).toEqual(['y']);
    expect(isReturned(merged.entries.get('e1')!)).toBe(true);
  });

  test("one context per snapshot lets a missing record drop another device's value", () => {
    // b lost the record (a capture bug or a wiped journal) but kept a context
    // covering z. Absence alone is "kept as is", yet a's stale copy then meets
    // c's z with b's context: both values are dropped in one order.
    const x: Stamp = [1, 'A'],
      z: Stamp = [5, 'C'];
    const a: Literal = {
      ctx: { A: 1 },
      record: { text: [{ s: x, v: 'x' }], mood: { s: x, v: 'OK' } },
      seen: null,
    };
    const b: Literal = { ctx: { A: 1, C: 5 }, record: null, seen: null };
    const c: Literal = {
      ctx: { A: 1, C: 5 },
      record: { text: [{ s: z, v: 'z' }], mood: { s: x, v: 'OK' } },
      seen: null,
    };
    expect(textOf(literalJoin(literalJoin(a, b), c))).toEqual([]); // z lost
    expect(textOf(literalJoin(a, literalJoin(b, c)))).toEqual(['z']);

    // v2 keeps a version vector per record, so b's context says nothing about it.
    const va = entryWith('x', 'device-a');
    const vc = edit(va, at('device-c'), 'text', 'z');
    const vb: SyncState = { ...vc, entries: new Map(), media: new Map() };
    expect(texts(convergeInEveryOrder([va, vb, vc]), 'e1')).toEqual(['z']);
  });
});

describe('envelope', () => {
  const publication = { authorDeviceId: 'device-a', deviceSequence: 7, createdAt: T0 };
  function sample(): SyncState {
    let state = entryWith('Text');
    state = ops.createNamed(state, at('device-a'), 'tag', 'Work').state;
    state = ops.attach(
      state,
      at('device-a'),
      'e1',
      mediaFor('p1', { type: 'entry', entryId: 'e1' }, T0),
    );
    state = ops.setProfilePhoto(
      state,
      at('device-b'),
      mediaFor('pp', { type: 'profile' }, T0),
      'all',
    );
    return join(state, ops.deleteEntry(entryWith('Other'), at('device-c'), 'e1'));
  }
  /** Rebuilds an envelope from edited header and body JSON. */
  function rebuild(
    bytes: Uint8Array,
    change: (header: Record<string, unknown>, body: Record<string, unknown>) => void,
    rehash = true,
  ): Uint8Array {
    const split = bytes.indexOf(0x0a);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(0, split)));
    const body = JSON.parse(
      new TextDecoder().decode(
        // Reuse the decoder's own gunzip by round-tripping the state.
        encodeEnvelope(decodeEnvelope(bytes).state, publication).bodyCanonical,
      ),
    );
    change(header, body);
    const bodyBytes = new TextEncoder().encode(canonicalize(body));
    if (rehash) {
      header.bodyHash = sha256Bytes(bodyBytes);
      header.bodyBytes = bodyBytes.length;
    }
    const head = new TextEncoder().encode(canonicalize(header));
    const stored = encodeGzip(bodyBytes, { level: 6 });
    const out = new Uint8Array(head.length + 1 + stored.length);
    out.set(head);
    out[head.length] = 0x0a;
    out.set(stored, head.length + 1);
    return out;
  }
  const codeOf = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      if (error instanceof SnapshotValidationError)
        return `${error instanceof SnapshotUpdateRequiredError ? 'update:' : ''}${error.code}`;
      throw error;
    }
    return 'ok';
  };

  test('round-trips, and its ID is the hash of the canonical header', () => {
    const state = sample();
    const encoded = encodeEnvelope(state, publication);
    const decoded = decodeEnvelope(encoded.bytes, encoded.snapshotId);
    expect(C(decoded.state)).toBe(C(state));
    expect(encodeEnvelope(decoded.state, publication).bytes).toEqual(encoded.bytes);
    const split = encoded.bytes.indexOf(0x0a);
    expect(encoded.snapshotId).toBe(
      sha256Text(new TextDecoder().decode(encoded.bytes.subarray(0, split))),
    );
    expect(decodeHeader(encoded.bytes).header).toMatchObject({
      format: 'tackbok-snapshot',
      major: 2,
      kind: 'full',
      since: null,
      codec: 'gzip',
      encryption: 'none',
      features: { required: [], optional: [] },
      floor: null,
    });
  });

  test('newer snapshots ask for an update; unknown optional features are ignored', () => {
    const { bytes } = encodeEnvelope(sample(), publication);
    const cases: [string, (h: Record<string, unknown>) => void][] = [
      ['update:unsupported-version', (h) => (h.major = 3)],
      ['update:unsupported-format', (h) => (h.format = 'tackbok-snapshot-x')],
      [
        'update:unsupported-feature',
        (h) => (h.features = { required: ['deltas'], optional: [] }),
      ],
      ['update:unsupported-codec', (h) => (h.codec = 'zstd')],
      ['update:unsupported-encryption', (h) => (h.encryption = 'xchacha20')],
      ['update:unsupported-kind', (h) => (h.kind = 'delta')],
      ['ok', (h) => (h.features = { required: [], optional: ['future-hint'] })],
      // A newer layout (extra keys) still asks for an update, not "corrupt".
      ['update:unsupported-version', (h) => ((h.major = 3), (h.newField = 1))],
      // Data under an optional feature is ignored...
      [
        'ok',
        (h) => (
          (h.features = { required: [], optional: ['future-hint'] }),
          (h.ext = { 'future-hint': { any: 'data' } })
        ),
      ],
      // ...but undeclared extension data is not.
      ['undeclared-extension', (h) => (h.ext = { 'future-hint': 1 })],
    ];
    for (const [expected, change] of cases)
      expect(codeOf(() => decodeEnvelope(rebuild(bytes, (h) => change(h))))).toBe(
        expected,
      );
  });

  test('rejects tampering, non-canonical bytes and broken invariants', () => {
    const { bytes, snapshotId } = encodeEnvelope(sample(), publication);
    expect(codeOf(() => decodeEnvelope(bytes, 'f'.repeat(64)))).toBe('hash-mismatch');
    // Same length, different text, old hash.
    const tampered = rebuild(
      bytes,
      (_h, b) => {
        const text = (b.entries as { text: [unknown, string][] }[])[0].text;
        text[0][1] = `Q${text[0][1].slice(1)}`;
      },
      false,
    );
    expect(codeOf(() => decodeEnvelope(tampered))).toBe('hash-mismatch');
    const spaced = new Uint8Array([0x20, ...bytes]);
    expect(codeOf(() => decodeEnvelope(spaced))).toBe('non-canonical-bytes');
    // A stamp newer than its record's version vector.
    expect(
      codeOf(() =>
        decodeEnvelope(
          rebuild(bytes, (_h, b) => {
            const entry = (b.entries as { vv: [number, number][] }[])[0];
            entry.vv = entry.vv.map(([d, h]) => [d, h - 1_000_000]);
          }),
        ),
      ),
    ).toMatch(/uncovered-stamp/);
    // A device index past the roster.
    expect(
      codeOf(() =>
        decodeEnvelope(
          rebuild(
            bytes,
            (_h, b) => ((b.entries as { mood: unknown }[])[0].mood = [[T0, 99], null]),
          ),
        ),
      ),
    ).toBe('invalid-number');
    // Media nobody references.
    expect(
      codeOf(() =>
        decodeEnvelope(
          rebuild(bytes, (_h, b) => {
            const media = b.media as Record<string, unknown>[];
            media.push({ ...media[0], assetId: 'zz-orphan' });
          }),
        ),
      ),
    ).toBe('unreferenced-media');
    // Unknown keys never pass the closed shapes.
    expect(codeOf(() => decodeEnvelope(rebuild(bytes, (_h, b) => (b.extra = 1))))).toBe(
      'closed-shape',
    );
    expect(snapshotId).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('clock bound (context ahead of local time)', () => {
  const DAY = 24 * HOUR;
  test("a state more than the bound ahead is refused; this device's clock stays put", () => {
    const base = entryWith('Text');
    const future = ops.setMood(base, at('device-f', 30 * YEAR), 'e1', 'SAD');
    const honest = at('device-n');
    expect(() => absorb(base, future, honest)).toThrow(ClockAheadError);
    // Within the bound the clock is dragged as before and causality holds.
    const ahead = ops.setMood(base, at('device-f', 3 * DAY), 'e1', 'SAD');
    const taken = absorb(base, ahead, at('device-n')).state;
    const after = ops.setMood(taken, at('device-n'), 'e1', 'HAPPY');
    expect(after.entries.get('e1')!.mood!.v).toBe('HAPPY');
    expect(after.entries.get('e1')!.mood!.s[0]).toBeGreaterThan(
      ahead.entries.get('e1')!.mood!.s[0],
    );
    expect(MAX_CONTEXT_AHEAD_MS).toBe(7 * DAY);
  });

  test('a far-ahead roster time is refused too: it would expire every other device', () => {
    const base = entryWith('Text');
    const marked = ops.markSeen(base, at('device-f', 5 * YEAR));
    expect(() => absorb(base, marked, at('device-n'))).toThrow(ClockAheadError);
  });

  test('a device whose clock is behind publishes, and receives once its clock is fixed', () => {
    const base = entryWith('Text');
    const behind = { device: 'device-b', wallMs: clock - YEAR };
    // Others' stamps look a year ahead to it: refused.
    expect(() => absorb(entryWith('Mine', 'device-b'), base, behind)).toThrow(
      ClockAheadError,
    );
    // Its own writes are older than everyone's clock: accepted.
    const edited = edit(base, { device: 'device-b', wallMs: clock - YEAR }, 'text', 'B');
    expect(() => absorb(base, edited, at('device-a'))).not.toThrow();
    // Fixed: it receives, and its causally later edit still wins.
    const fixed = absorb(edited, base, at('device-b')).state;
    expect(texts(fixed, 'e1')).toEqual(['B']);
  });
});

describe('compaction of deleted entries', () => {
  const devices = ['device-a', 'device-b', 'device-c'];
  /** Every device publishes (acknowledges) the state it holds. */
  const publishAll = (state: SyncState, offset = 0) =>
    devices.reduce((next, device) => ops.markSeen(next, at(device, offset)), state);

  /** An entry with a tag, a photo and ext, before and after device-c deletes it. */
  function deletedEverywhere() {
    let state = entryWith('Secret text');
    state = ops.createNamed(state, at('device-a'), 'tag', 'Work').state;
    const tag = [...state.tags.keys()][0];
    state = ops.addTag(state, at('device-a'), 'e1', tag);
    state = ops.attach(
      state,
      at('device-b'),
      'e1',
      mediaFor('p1', { type: 'entry', entryId: 'e1' }, T0),
    );
    const before = ops.writeExt(
      state,
      at('device-b'),
      { kind: 'entry', id: 'e1' },
      'note',
      'x',
      'all',
    );
    return { before, deleted: ops.deleteEntry(before, at('device-c'), 'e1') };
  }
  const LATER = ROSTER_EXPIRY_MS + 10 * 24 * HOUR;

  /**
   * device-x synced the entry before the delete, then went quiet. The others
   * publish 190 days later, so device-x has expired, and compact.
   */
  function expiredAndCompacted() {
    const { before, deleted } = deletedEverywhere();
    const away = ops.markSeen(before, at('device-x'));
    const state = compact(publishAll(join(deleted, away), LATER));
    return { away, state };
  }

  test('once every active device has seen the delete, the values go; vector and tombstone stay', () => {
    const { deleted } = deletedEverywhere();
    // Not every device has acknowledged it yet: nothing happens.
    const partly = ops.markSeen(ops.markSeen(deleted, at('device-a')), at('device-b'));
    expect(compactionFloor(partly)).toBeNull();
    expect(compact(partly)).toBe(partly);
    const compacted = compact(publishAll(deleted));
    const entry = compacted.entries.get('e1')!;
    expect(isCompacted(entry)).toBe(true);
    expect(entry).toMatchObject({
      known: { vv: {}, extra: [] },
      title: [],
      text: [],
      mood: null,
      date: null,
      tags: [],
      attachments: [],
      order: null,
      ext: {},
    });
    expect(entry.vv).toEqual(deleted.entries.get('e1')!.vv);
    expect(entry.del).toEqual(deleted.entries.get('e1')!.del);
    expect(compacted.media.size).toBe(0);
    expect(compacted.floor).toEqual(compactionFloor(publishAll(deleted)));
    // The deleted text is gone from what gets uploaded.
    const { bodyCanonical } = encodeEnvelope(compacted, {
      authorDeviceId: 'device-a',
      deviceSequence: 1,
      createdAt: T0,
    });
    expect(new TextDecoder().decode(bodyCanonical)).not.toContain('Secret text');
    expect(compact(compacted)).toBe(compacted);
  });

  test('a stale copy brings the values back into the hidden record; the next compaction drops them', () => {
    const { before, deleted } = deletedEverywhere();
    const compacted = compact(publishAll(deleted));
    const joined = convergeInEveryOrder([compacted, before, deleted]);
    expect(isLive(joined.entries.get('e1')!)).toBe(false);
    expect(joined.entries.get('e1')!.text.map((item) => item.v)).toEqual(['Secret text']);
    expect(isCompacted(joined.entries.get('e1')!)).toBe(false);
    expect(liveEntries(joined)).toEqual(liveEntries(compacted));
    expect(isCompacted(compact(joined).entries.get('e1')!)).toBe(true);
  });

  test('a device on the roster that never published blocks compaction until it expires', () => {
    let state = publishAll(deletedEverywhere().deleted);
    // device-d synced once (it is on the roster) but never acknowledged.
    state = { ...state, roster: { ...state.roster, 'device-d': clock } };
    expect(compactionFloor(state)).toBeNull();
    // 190 days later everyone else has published again; device-d is expired.
    const later = publishAll(state, LATER);
    expect(activeDevices(later)).toEqual(devices);
    expect(isCompacted(compact(later).entries.get('e1')!)).toBe(true);
  });

  test('a device back after expiry with an edit brings the entry back with its own values', () => {
    const { away, state } = expiredAndCompacted();
    expect(activeDevices(state)).not.toContain('device-x');
    expect(isCompacted(state.entries.get('e1')!)).toBe(true);
    // The mood edit is one the delete never saw: the entry comes back.
    const edited = ops.setMood(away, at('device-x'), 'e1', 'AWFUL');
    const back = absorb(state, edited, at('device-a', LATER));
    expect(back.revived).toEqual(['e1']);
    const entry = back.state.entries.get('e1')!;
    expect(isLive(entry)).toBe(true);
    expect(texts(back.state, 'e1')).toEqual(['Secret text']);
    expect(titles(back.state, 'e1')).toEqual(['Title']);
    expect(entry.mood!.v).toBe('AWFUL');
    expect(memberIds(entry.tags)).toHaveLength(1);
    expect(attachmentIds(entry)).toEqual(['p1']);
    expect(back.state.media.has('p1')).toBe(true);
    expect(entry.ext.note!.map((item) => item.v)).toEqual(['x']);
    // The same from its side, and in every order with the deleted copy.
    const mine = absorb(edited, state, at('device-x', LATER)).state;
    expect(C(mine)).toBe(C(back.state));
    const all = convergeInEveryOrder([state, edited, deletedEverywhere().deleted]);
    expect(texts(all, 'e1')).toEqual(['Secret text']);
    // Compaction leaves a shown entry alone.
    expect(isLive(compact(publishAll(back.state, LATER)).entries.get('e1')!)).toBe(true);
  });

  test('a device back after expiry without an edit does not bring the entry back', () => {
    const { away, state } = expiredAndCompacted();
    const back = absorb(state, away, at('device-a', LATER));
    expect(back.revived).toEqual([]);
    expect(isLive(back.state.entries.get('e1')!)).toBe(false);
    expect(isCompacted(compact(back.state).entries.get('e1')!)).toBe(true);
  });

  test('"Keep both" onto a split entry that was deleted and compacted fills it again', () => {
    // e1 has versions X and Y; "Keep both" moves Y to a split entry, which is
    // then deleted everywhere and compacted. A copy that still has e1 with Y
    // open (one that lost the split's history) keeps both again.
    const base = entryWith('Text');
    const a = edit(base, at('device-a'), 'text', 'X');
    const b = edit(base, at('device-b'), 'text', 'Y');
    const both = join(a, b);
    const stampOf = (value: string) =>
      both.entries.get('e1')!.text.find((item) => item.v === value)!.s;
    const split = ops.keepBoth(
      both,
      at('device-a'),
      'e1',
      'text',
      stampOf('X'),
      stampOf('Y'),
    );
    const gone = ops.deleteEntry(split.state, at('device-a'), split.newEntryId);
    const compacted = compact(publishAll(gone));
    expect(isCompacted(compacted.entries.get(split.newEntryId)!)).toBe(true);
    const stale = new Map(compacted.entries);
    stale.set('e1', both.entries.get('e1')!);
    const again = ops.keepBoth(
      { ...compacted, entries: stale },
      at('device-b'),
      'e1',
      'text',
      stampOf('X'),
      stampOf('Y'),
    );
    expect(again.newEntryId).toBe(split.newEntryId);
    const revived = again.state.entries.get(split.newEntryId)!;
    expect(isLive(revived)).toBe(true);
    expect(texts(again.state, split.newEntryId)).toEqual(['Y']);
    expect(titles(again.state, split.newEntryId)).toEqual(['Title']);
    expect(revived.mood!.v).toBe('HAPPY');
    // The state is valid and publishable.
    expect(() => C(again.state)).not.toThrow();
  });

  test("a write on an entry brought back after compaction claims only itself, not the writer's compacted writes", () => {
    // device-a writes a newer title, then device-c deletes; device-x only ever
    // saw the first title. Found by the 10x simulation (seed 13754).
    const { before } = deletedEverywhere();
    const away = ops.markSeen(before, at('device-x'));
    const newer = edit(before, at('device-a'), 'title', 'Newer');
    const deleted = ops.deleteEntry(newer, at('device-c'), 'e1');
    const state = compact(publishAll(join(deleted, away), LATER));
    const edited = ops.setMood(away, at('device-x'), 'e1', 'AWFUL');
    const back = absorb(state, edited, at('device-a', LATER)).state;
    expect(titles(back, 'e1')).toEqual(['Title']);
    // device-a writes again; its compacted "Newer" stays unknown to the record.
    const again = edit(back, at('device-a', LATER), 'text', 'Again');
    const newerStamp = newer.entries.get('e1')!.title[0].s;
    expect(knows(again.entries.get('e1')!.known!, newerStamp)).toBe(false);
    // A stale full copy turns up: the entry keeps a title in every order.
    const all = convergeInEveryOrder([again, deleted, edited]);
    expect(titles(all, 'e1')).toEqual(['Newer']);
    expect(texts(all, 'e1')).toEqual(['Again']);
  });

  test('a later edit on an entry brought back after compaction replaces what it was made from', () => {
    const { away, state } = expiredAndCompacted();
    const edited = ops.setMood(away, at('device-x'), 'e1', 'AWFUL');
    const back = absorb(state, edited, at('device-a', LATER)).state;
    expect(back.entries.get('e1')!.known).not.toBeNull();
    const rewritten = edit(back, at('device-a', LATER), 'text', 'Rewritten');
    // The old text does not come back from the returning device's copy.
    expect(texts(convergeInEveryOrder([rewritten, edited, state]), 'e1')).toEqual([
      'Rewritten',
    ]);
  });
});

describe('per-record ext', () => {
  const note = (
    state: SyncState,
    device: string,
    value: string,
    replaces: ops.Replaces = 'all',
  ) =>
    ops.writeExt(state, at(device), { kind: 'entry', id: 'e1' }, 'note', value, replaces);
  const notes = (state: SyncState) =>
    (state.entries.get('e1')!.ext.note ?? []).map((item) => item.v);

  test('joins like a multi-value register: concurrent values stay, a replaced one goes', () => {
    const base = note(entryWith('Text'), 'device-a', 'first');
    const a = note(base, 'device-a', 'from a');
    const b = note(base, 'device-b', 'from b');
    expect(notes(convergeInEveryOrder([a, b, base]))).toEqual(['from a', 'from b']);
    const resolved = note(join(a, b), 'device-c', 'settled');
    expect(notes(convergeInEveryOrder([resolved, a, b]))).toEqual(['settled']);
  });

  test('a device that does not know the feature keeps it through edits and joins', () => {
    const base = note(entryWith('Text'), 'device-a', 'kept');
    // An older device edits the text; it never touches ext.
    const older = edit(base, at('device-old'), 'text', 'Edited');
    const merged = convergeInEveryOrder([older, base]);
    expect(notes(merged)).toEqual(['kept']);
    // Tags, prompts and the profile carry ext too.
    let state = ops.createNamed(merged, at('device-a'), 'tag', 'Work').state;
    const tag = [...state.tags.keys()][0];
    state = ops.writeExt(
      state,
      at('device-a'),
      { kind: 'tag', id: tag },
      'color',
      'red',
      'all',
    );
    state = ops.writeExt(
      state,
      at('device-a'),
      { kind: 'profile' },
      'theme',
      'dark',
      'all',
    );
    const encoded = encodeEnvelope(state, {
      authorDeviceId: 'device-a',
      deviceSequence: 1,
      createdAt: T0,
    });
    // The writer declares the features its records carry, as optional.
    expect(encoded.header.features).toEqual({
      required: [],
      optional: ['color', 'note', 'theme'],
    });
    const decoded = decodeEnvelope(encoded.bytes).state;
    expect(C(decoded)).toBe(C(state));
    expect(decoded.tags.get(tag)!.ext.color![0].v).toBe('red');
  });

  test('tombstone ext joins against what the delete saw', () => {
    const base = ops.deleteEntry(entryWith('Text'), at('device-a'), 'e1');
    const del = base.entries.get('e1')!.del!;
    const withExt = (value: string, device: string): SyncState => {
      const s = [del.at[0], device] as const;
      const entry = base.entries.get('e1')!;
      const entries = new Map(base.entries);
      const seen = { ...del.seen, [device]: del.at[0] };
      entries.set('e1', {
        ...entry,
        vv: { ...entry.vv, [device]: del.at[0] },
        del: { ...del, seen, ext: { reason: [{ s, v: value }] } },
      });
      return {
        ...base,
        ctx: { ...base.ctx, [device]: del.at[0] },
        roster: { ...base.roster, [device]: del.at[0] },
        entries,
      };
    };
    const merged = convergeInEveryOrder([
      withExt('x', 'device-x'),
      withExt('y', 'device-y'),
      base,
    ]);
    expect(merged.entries.get('e1')!.del!.ext.reason!.map((item) => item.v)).toEqual([
      'x',
      'y',
    ]);
  });

  test('ext the header does not declare, or an empty or uncovered item list, is refused', () => {
    const state = note(entryWith('Text'), 'device-a', 'kept');
    const publication = { authorDeviceId: 'device-a', deviceSequence: 1, createdAt: T0 };
    const { bytes } = encodeEnvelope(state, publication);
    const split = bytes.indexOf(0x0a);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(0, split)));
    const body = JSON.parse(
      new TextDecoder().decode(encodeEnvelope(state, publication).bodyCanonical),
    );
    const build = (h: Record<string, unknown>, b: Record<string, unknown>) => {
      const bodyBytes = new TextEncoder().encode(canonicalize(b as never));
      const head = new TextEncoder().encode(
        canonicalize({
          ...h,
          bodyHash: sha256Bytes(bodyBytes),
          bodyBytes: bodyBytes.length,
        } as never),
      );
      const stored = encodeGzip(bodyBytes, { level: 6 });
      const out = new Uint8Array(head.length + 1 + stored.length);
      out.set(head);
      out[head.length] = 0x0a;
      out.set(stored, head.length + 1);
      return out;
    };
    const code = (h: Record<string, unknown>, b: Record<string, unknown>) => {
      try {
        decodeEnvelope(build(h, b));
        return 'ok';
      } catch (error) {
        return (error as SnapshotValidationError).code;
      }
    };
    expect(code(header, body)).toBe('ok');
    expect(code({ ...header, features: { required: [], optional: [] } }, body)).toBe(
      'undeclared-extension',
    );
    const entry = body.entries[0];
    expect(code(header, { ...body, entries: [{ ...entry, ext: { note: [] } }] })).toBe(
      'invalid-shape',
    );
    expect(
      code(header, {
        ...body,
        entries: [{ ...entry, ext: { note: [[[entry.vv[0][1] + 5, 0], 'late']] } }],
      }),
    ).toBe('uncovered-stamp');
  });
});
