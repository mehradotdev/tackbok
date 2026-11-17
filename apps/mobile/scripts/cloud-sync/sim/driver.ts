/**
 * Model-independent N-device simulation for cloud sync merges.
 *
 * A case is a list of events (local edits, syncs and clock changes) chosen by
 * a seeded generator from what each device currently shows. Events are stored
 * as intents ("edit the shown title of e12") and resolved when they run, so a
 * failing list can be shrunk by replaying subsets of it.
 *
 * The oracle never reads model internals. It tracks which events each device
 * has seen (a set of event indexes that grows on sync) and checks, after a
 * final round in which every device syncs with every other:
 * - convergence: every device has the same canonical bytes;
 * - authored text: a title, text or profile name written by an event stays
 *   visible unless a later event that had seen it removed it on purpose
 *   (an edit of that value, a delete of its entry or a "keep" of another);
 * - deletes: an entry with an edit that no delete of it had seen stays visible.
 */
import { Random } from './random';

export type Mood = 'AMAZING' | 'HAPPY' | 'OKAY' | 'SAD' | 'AWFUL';
export const MOODS: Mood[] = ['AMAZING', 'HAPPY', 'OKAY', 'SAD', 'AWFUL'];

export interface ViewEntry {
  id: string;
  /** Shown value first; more than one means an open conflict. */
  titles: (string | null)[];
  contents: (string | null)[];
  mood: Mood | null;
  date: number;
  tagIds: string[];
  attachmentIds: string[];
  /** Back after a delete and not yet acknowledged ("Got it"). */
  returned?: boolean;
}

export interface View {
  entries: ViewEntry[];
  tags: { id: string; title: string }[];
  prompts: { id: string; title: string }[];
  /** Shown value first, then alternates still offered to the user. */
  profileNames: (string | null)[];
  profilePhotos: (string | null)[];
}

export type Event =
  | { kind: 'clock'; device: number; skew: number }
  | { kind: 'sync'; device: number; peer: number | null; both: boolean }
  | {
      kind: 'createEntry';
      device: number;
      entryId: string;
      title: string | null;
      content: string;
      mood: Mood | null;
    }
  | { kind: 'setTitle' | 'setContent'; device: number; entryId: string; value: string }
  | { kind: 'setMood'; device: number; entryId: string; mood: Mood | null }
  | { kind: 'setDate'; device: number; entryId: string; offset: number }
  | { kind: 'deleteEntry'; device: number; entryId: string }
  | { kind: 'keep' | 'keepBoth'; device: number; target: KeepTarget; index: number }
  | { kind: 'addTag' | 'removeTag'; device: number; entryId: string; tagId: string }
  | { kind: 'attach'; device: number; entryId: string; assetId: string }
  | { kind: 'detach'; device: number; entryId: string; assetId: string }
  | { kind: 'createTag' | 'createPrompt'; device: number; title: string }
  | { kind: 'renameTag' | 'renamePrompt'; device: number; id: string; title: string }
  | { kind: 'deleteTag' | 'deletePrompt'; device: number; id: string }
  | { kind: 'setProfileName'; device: number; value: string }
  | { kind: 'setProfilePhoto'; device: number; assetId: string | null }
  /** Reverse the entry's attachment order. */
  | { kind: 'reorder'; device: number; entryId: string }
  /** "Got it" on a returned entry. */
  | { kind: 'acknowledge'; device: number; entryId: string };

export type LocalEvent = Exclude<Event, { kind: 'clock' | 'sync' }>;

/** Something with several versions; `options` is how many can be kept. */
export interface KeepTarget {
  entryId: string;
  field: 'title' | 'content' | 'group' | 'profileName' | 'profilePhoto';
  options: number;
}

/** An authored value in one entry (or 'profile'). */
export interface PlacedValue {
  value: string | null;
  entryId: string;
}

/** What a resolved "keep" did, for the oracle. */
export interface KeepEffect {
  /** Authored values the user dismissed. */
  removed: PlacedValue[];
  /** Values the user chose (or "Keep both" copied); re-authored by this event. */
  affirmed: PlacedValue[];
  /** Entries this event wrote to. */
  writes: string[];
  /** Entries this event deleted. */
  deletes: string[];
}

export type SyncOutcome = { ok: true; changed: boolean } | { ok: false; reason: string };

export interface SimAdapter {
  readonly name: string;
  /** `drive`: a sync merges every published head; `pairwise`: one peer. */
  readonly topology: 'drive' | 'pairwise';
  readonly supportsKeepBoth: boolean;
  view(device: number): View;
  /** Applies a local event; false when the app would refuse it. */
  apply(device: number, event: LocalEvent, wall: number): boolean;
  keepTargets(device: number): KeepTarget[];
  /** Applies a keep or keep-both; null when the target no longer applies. */
  keep(
    device: number,
    event: Extract<LocalEvent, { kind: 'keep' | 'keepBoth' }>,
    wall: number,
  ): KeepEffect | null;
  sync(device: number, peer: number | null, wall: number): Promise<SyncOutcome>;
  /** Canonical bytes of the device's synced state. */
  fingerprint(device: number): string;
  normalizeTitle(kind: 'tag' | 'prompt', title: string): string;
  dispose?(): void;
}

export interface CaseConfig {
  seed: number;
  devices: number;
  steps: number;
  syncChance: number;
  /** Wall clocks with one-day resolution: devices then often write the same HLC. */
  coarseClock: boolean;
  /** Extra weight for some edits, to focus a run on one rule. */
  weights?: Partial<Record<LocalEvent['kind'], number>>;
}

export interface CaseResult {
  seed: number;
  devices: number;
  events: number;
  converged: boolean;
  /** Authored strings that disappeared without a removal that had seen them. */
  lostTexts: string[];
  /** Subset of `lostTexts` that a "keep" had chosen. */
  lostKept: string[];
  /** Concurrent keeps of different versions where every kept value was lost. */
  keptBothLost: number;
  /** Shown values that an edit or keep which had seen them replaced (not a loss). */
  staleValues: string[];
  /** Entries deleted although an edit to them was unseen by every delete. */
  lostEntries: string[];
  /** Entries visible although every edit was seen by a delete (not a loss). */
  undoneDeletes: string[];
  /** Visible tags or prompts sharing a normalised title (not a loss). */
  duplicateTitles: number;
  syncFailures: string[];
  finalRounds: number;
  /** The final round never reached a pass where nothing changed. */
  unsettled: boolean;
  /** Tags or attachments added to a shown entry and gone without a removal that saw them. */
  lostMemberships: string[];
}

export function caseFailed(result: CaseResult): boolean {
  return (
    !result.converged ||
    result.unsettled ||
    result.lostMemberships.length > 0 ||
    result.lostTexts.length > 0 ||
    result.lostEntries.length > 0 ||
    result.syncFailures.length > 0
  );
}

const TAG_TITLES = ['Work', 'work', 'Family', 'family ', 'Travel', 'Health', 'Café'];
const PROMPT_TITLES = ['What made you smile?', 'what made you smile?', 'One good thing'];

export function configFor(seed: number): CaseConfig {
  const rng = new Random(seed ^ 0x5eed);
  return {
    seed,
    devices: rng.int(2, 6),
    steps: rng.int(15, 70),
    syncChance: 0.2 + rng.next() * 0.35,
    coarseClock: rng.chance(0.3),
  };
}

/** Generates a case's events. Uses a live adapter so choices follow what devices show. */
export async function generateCase(
  adapter: SimAdapter,
  config: CaseConfig,
): Promise<{ events: Event[]; state: OracleState }> {
  const rng = new Random(config.seed);
  const events: Event[] = [];
  const state = newOracle(config);
  for (let step = 0; step < config.steps; step++) {
    const index = events.length;
    const event = chooseEvent(adapter, rng, config, index);
    events.push(event);
    await runEvent(adapter, state, event, index);
  }
  return { events, state };
}

function chooseEvent(
  adapter: SimAdapter,
  rng: Random,
  config: CaseConfig,
  index: number,
): Event {
  const device = rng.int(0, config.devices - 1);
  if (rng.chance(0.04)) {
    // Clock skews: minutes, hours, or years; sometimes a jump backwards.
    const unit = rng.weighted([
      [60_000, 3],
      [3_600_000, 3],
      [365 * 86_400_000, 1],
    ] as const);
    return { kind: 'clock', device, skew: rng.int(-30, 30) * unit };
  }
  if (rng.chance(config.syncChance)) {
    if (adapter.topology === 'drive')
      return { kind: 'sync', device, peer: null, both: false };
    let peer = rng.int(0, config.devices - 2);
    if (peer >= device) peer++;
    return { kind: 'sync', device, peer, both: rng.chance(0.5) };
  }
  const view = adapter.view(device);
  const entry = view.entries.length > 0 ? rng.pick(view.entries) : null;
  const keepTargets = adapter.keepTargets(device);
  const tag = view.tags.length > 0 ? rng.pick(view.tags) : null;
  const prompt = view.prompts.length > 0 ? rng.pick(view.prompts) : null;
  const text = (prefix: string) => `${prefix}${config.seed}-${index}`;
  type Kind = LocalEvent['kind'];
  const choices: [Kind, number][] = [['createEntry', entry ? 8 : 40]];
  if (entry) {
    choices.push(
      ['setTitle', 8],
      ['setContent', 12],
      ['setMood', 4],
      ['setDate', 3],
      ['deleteEntry', 5],
      ['attach', 3],
    );
    if (entry.attachmentIds.length > 0) choices.push(['detach', 2]);
    if (entry.attachmentIds.length > 1) choices.push(['reorder', 2]);
    if (entry.returned) choices.push(['acknowledge', 6]);
    if (tag) choices.push(['addTag', 4]);
    if (entry.tagIds.length > 0) choices.push(['removeTag', 2]);
  }
  if (keepTargets.length > 0) {
    choices.push(['keep', 10]);
    if (adapter.supportsKeepBoth) choices.push(['keepBoth', 3]);
  }
  choices.push(['createTag', 3], ['createPrompt', 1.5], ['setProfileName', 2]);
  choices.push(['setProfilePhoto', 1]);
  if (tag) choices.push(['renameTag', 1.5], ['deleteTag', 1]);
  if (prompt) choices.push(['renamePrompt', 1], ['deletePrompt', 0.7]);
  const kind = rng.weighted(
    choices.map(([choice, weight]): [Kind, number] => [
      choice,
      weight + (config.weights?.[choice] ?? 0),
    ]),
  );
  switch (kind) {
    case 'createEntry':
      return {
        kind,
        device,
        entryId: `e${index}`,
        title: rng.chance(0.7) ? text('T') : null,
        content: text('C'),
        mood: rng.chance(0.6) ? rng.pick(MOODS) : null,
      };
    case 'setTitle':
      return { kind, device, entryId: entry!.id, value: text('T') };
    case 'setContent':
      return { kind, device, entryId: entry!.id, value: text('C') };
    case 'setMood':
      return {
        kind,
        device,
        entryId: entry!.id,
        mood: rng.pick([...MOODS, null].filter((mood) => mood !== entry!.mood)),
      };
    case 'setDate':
      return { kind, device, entryId: entry!.id, offset: rng.int(1, 50) * 86_400_000 };
    case 'deleteEntry':
      return { kind, device, entryId: entry!.id };
    case 'keep':
    case 'keepBoth': {
      const target = rng.pick(keepTargets);
      return { kind, device, target, index: rng.int(0, target.options - 1) };
    }
    case 'addTag':
      return { kind, device, entryId: entry!.id, tagId: tag!.id };
    case 'removeTag':
      return { kind, device, entryId: entry!.id, tagId: rng.pick(entry!.tagIds) };
    case 'attach':
      return { kind, device, entryId: entry!.id, assetId: `a${index}` };
    case 'detach':
      return {
        kind,
        device,
        entryId: entry!.id,
        assetId: rng.pick(entry!.attachmentIds),
      };
    case 'reorder':
    case 'acknowledge':
      return { kind, device, entryId: entry!.id };
    case 'createTag':
      return { kind, device, title: rng.pick(TAG_TITLES) };
    case 'createPrompt':
      return { kind, device, title: rng.pick(PROMPT_TITLES) };
    case 'renameTag':
      return { kind, device, id: tag!.id, title: rng.pick(TAG_TITLES) };
    case 'renamePrompt':
      return { kind, device, id: prompt!.id, title: rng.pick(PROMPT_TITLES) };
    case 'deleteTag':
      return { kind, device, id: tag!.id };
    case 'deletePrompt':
      return { kind, device, id: prompt!.id };
    case 'setProfileName':
      return { kind, device, value: text('N') };
    case 'setProfilePhoto':
      return { kind, device, assetId: rng.chance(0.8) ? `p${index}` : null };
  }
}

interface TextWrite {
  event: number;
  value: string;
  entryId: string;
  /** For a value a "keep" chose: the event that first wrote it. */
  keptFrom: number | null;
}

type RemovalKind = 'edit' | 'keep' | 'delete';

interface Removal {
  knowledge: Set<number>;
  removed: Set<string>;
  entryId: string;
  /** An edit replaces the value it was made from, kept or not. */
  kind: RemovalKind;
}

export interface OracleState {
  time: number;
  coarseClock: boolean;
  skews: number[];
  knowledge: Set<number>[];
  drive: Set<number>;
  writes: TextWrite[];
  removals: Removal[];
  entryWrites: Map<string, number[]>;
  entryDeletes: Map<string, Set<number>[]>;
  keeps: { event: number; knowledge: Set<number>; affirmed: string[] }[];
  /** Tag or attachment added to an entry (`kind:entryId:id`). */
  memberships: { event: number; key: string; entryId: string; id: string }[];
  /**
   * Removals of memberships: `entryId` null means every entry (a tag delete),
   * `id` null every membership of the entry (an entry delete, like text).
   */
  membershipRemovals: {
    knowledge: Set<number>;
    entryId: string | null;
    id: string | null;
  }[];
  syncFailures: string[];
}

function newOracle(config: CaseConfig): OracleState {
  const devices = config.devices;
  return {
    time: T0,
    coarseClock: config.coarseClock,
    skews: Array.from({ length: devices }, () => 0),
    knowledge: Array.from({ length: devices }, () => new Set<number>()),
    drive: new Set(),
    writes: [],
    removals: [],
    entryWrites: new Map(),
    entryDeletes: new Map(),
    keeps: [],
    memberships: [],
    membershipRemovals: [],
    syncFailures: [],
  };
}

const union = (target: Set<number>, source: Set<number>) => {
  for (const value of source) target.add(value);
};

function recordWrite(
  state: OracleState,
  index: number,
  entryId: string,
  value: string | null,
) {
  if (value !== null) state.writes.push({ event: index, value, entryId, keptFrom: null });
}

function recordKept(state: OracleState, index: number, { value, entryId }: PlacedValue) {
  if (value === null) return;
  const origin = state.writes.find((write) => write.value === value);
  state.writes.push({ event: index, value, entryId, keptFrom: origin?.event ?? index });
}

function recordRemoval(
  state: OracleState,
  device: number,
  removed: PlacedValue[],
  kind: RemovalKind,
) {
  for (const entryId of new Set(removed.map((item) => item.entryId))) {
    const strings = removed
      .filter((item) => item.entryId === entryId)
      .map((item) => item.value)
      .filter((value): value is string => value !== null);
    if (strings.length === 0) continue;
    state.removals.push({
      knowledge: new Set(state.knowledge[device]),
      removed: new Set(strings),
      entryId,
      kind,
    });
  }
}

function recordEntryWrite(state: OracleState, entryId: string, index: number) {
  state.entryWrites.set(entryId, [...(state.entryWrites.get(entryId) ?? []), index]);
}

function recordEntryDelete(state: OracleState, device: number, entryId: string) {
  state.membershipRemovals.push({
    knowledge: new Set(state.knowledge[device]),
    entryId,
    id: null,
  });
  state.entryDeletes.set(entryId, [
    ...(state.entryDeletes.get(entryId) ?? []),
    new Set(state.knowledge[device]),
  ]);
}

const T0 = 1_800_000_000_000;

/** Shared time of event `index`: 1 s to 1 h after the previous one. */
function timeAt(index: number): number {
  let time = T0;
  for (let i = 0; i <= index; i++) time += 1_000 + ((i * 7_919) % 3_600_000);
  return time;
}

function wallClock(state: OracleState, device: number): number {
  const wall = Math.max(0, state.time + state.skews[device]);
  return state.coarseClock ? wall - (wall % 86_400_000) : wall;
}

async function runEvent(
  adapter: SimAdapter,
  state: OracleState,
  event: Event,
  index: number,
): Promise<void> {
  // A pure function of the original index, so a shrunk replay keeps times.
  state.time = timeAt(index);
  if (event.kind === 'clock') {
    state.skews[event.device] = event.skew;
    return;
  }
  const wall = (device: number) => wallClock(state, device);
  if (event.kind === 'sync') {
    const { device, peer } = event;
    if (adapter.topology === 'drive') {
      const outcome = await adapter.sync(device, null, wall(device));
      if (!outcome.ok) {
        state.syncFailures.push(`event ${index}: ${outcome.reason}`);
        return;
      }
      union(state.knowledge[device], state.drive);
      union(state.drive, state.knowledge[device]);
      return;
    }
    const pull = async (to: number, from: number) => {
      const outcome = await adapter.sync(to, from, wall(to));
      if (!outcome.ok) state.syncFailures.push(`event ${index}: ${outcome.reason}`);
      else union(state.knowledge[to], state.knowledge[from]);
    };
    await pull(device, peer!);
    if (event.both) await pull(peer!, device);
    return;
  }
  const device = event.device;
  const view = adapter.view(device);
  const entry =
    'entryId' in event ? view.entries.find((e) => e.id === event.entryId) : undefined;
  if (event.kind === 'keep' || event.kind === 'keepBoth') {
    const effect = adapter.keep(device, event, wall(device));
    if (!effect) return;
    recordRemoval(state, device, effect.removed, 'keep');
    for (const value of effect.affirmed) recordKept(state, index, value);
    state.keeps.push({
      event: index,
      knowledge: new Set(state.knowledge[device]),
      affirmed: effect.affirmed
        .map((item) => item.value)
        .filter((value): value is string => value !== null),
    });
    for (const entryId of effect.writes) recordEntryWrite(state, entryId, index);
    for (const entryId of effect.deletes) recordEntryDelete(state, device, entryId);
    state.knowledge[device].add(index);
    return;
  }
  if ('entryId' in event && event.kind !== 'createEntry' && !entry) return;
  if (!adapter.apply(device, event, wall(device))) return;
  switch (event.kind) {
    case 'createEntry':
      recordWrite(state, index, event.entryId, event.title);
      recordWrite(state, index, event.entryId, event.content);
      recordEntryWrite(state, event.entryId, index);
      break;
    case 'setTitle':
    case 'setContent':
      recordRemoval(
        state,
        device,
        [
          {
            value: event.kind === 'setTitle' ? entry!.titles[0] : entry!.contents[0],
            entryId: event.entryId,
          },
        ],
        'edit',
      );
      recordWrite(state, index, event.entryId, event.value);
      recordEntryWrite(state, event.entryId, index);
      break;
    case 'deleteEntry':
      recordRemoval(
        state,
        device,
        [...entry!.titles, ...entry!.contents].map((value) => ({
          value,
          entryId: event.entryId,
        })),
        'delete',
      );
      recordEntryDelete(state, device, event.entryId);
      break;
    case 'setProfileName':
      recordRemoval(
        state,
        device,
        [{ value: view.profileNames[0] ?? null, entryId: 'profile' }],
        'edit',
      );
      recordWrite(state, index, 'profile', event.value);
      break;
    case 'addTag':
    case 'attach': {
      const id = 'tagId' in event ? event.tagId : event.assetId;
      state.memberships.push({
        event: index,
        key: `${event.kind}:${event.entryId}:${id}`,
        entryId: event.entryId,
        id,
      });
      recordEntryWrite(state, event.entryId, index);
      break;
    }
    case 'removeTag':
    case 'detach':
      state.membershipRemovals.push({
        knowledge: new Set(state.knowledge[device]),
        entryId: event.entryId,
        id: 'tagId' in event ? event.tagId : event.assetId,
      });
      recordEntryWrite(state, event.entryId, index);
      break;
    case 'deleteTag':
      state.membershipRemovals.push({
        knowledge: new Set(state.knowledge[device]),
        entryId: null,
        id: event.id,
      });
      break;
    case 'setMood':
    case 'setDate':
    case 'reorder':
      recordEntryWrite(state, event.entryId, index);
      break;
    default:
      break;
  }
  state.knowledge[device].add(index);
}

export const MAX_FINAL_ROUNDS = 6;

/** Every device syncs until nothing changes, then the oracle checks. */
async function finalRound(
  adapter: SimAdapter,
  state: OracleState,
  devices: number,
): Promise<number> {
  const wall = (device: number) => wallClock(state, device);
  const maxRounds = MAX_FINAL_ROUNDS;
  for (let round = 1; round <= maxRounds; round++) {
    let changed = false;
    state.time += 60_000;
    for (let device = 0; device < devices; device++) {
      const peers = adapter.topology === 'drive' ? [null] : [...Array(devices).keys()];
      for (const peer of peers) {
        if (peer === device) continue;
        const outcome = await adapter.sync(device, peer, wall(device));
        if (!outcome.ok) {
          state.syncFailures.push(`final round ${round}: ${outcome.reason}`);
          continue;
        }
        changed ||= outcome.changed;
        if (peer === null) {
          union(state.knowledge[device], state.drive);
          union(state.drive, state.knowledge[device]);
        } else union(state.knowledge[device], state.knowledge[peer]);
      }
    }
    if (!changed) return round;
  }
  return maxRounds + 1;
}

function check(
  adapter: SimAdapter,
  state: OracleState,
  config: CaseConfig,
  events: number,
  finalRounds: number,
): CaseResult {
  const devices = [...Array(config.devices).keys()];
  const fingerprints = devices.map((device) => adapter.fingerprint(device));
  const views = devices.map((device) => adapter.view(device));
  const visibleTexts = views.map(
    (view) =>
      new Set<string | null>([
        ...view.entries.flatMap((entry) => [...entry.titles, ...entry.contents]),
        ...view.profileNames,
      ]),
  );
  // A kept value is replaced by an edit of it, or by a removal that saw the
  // keep; a concurrent keep of another version or delete does not.
  // shortcut: removals match by value across entries, so a value that also
  // lives in a copy (a v1 recovered entry) counts as removed when the copy is
  // deleted; values are unique per write, so only copies share one. Scope
  // removals per entry once copies carry their write lineage.
  const superseded = (write: TextWrite, kinds: readonly RemovalKind[], strict = false) =>
    state.removals.some(
      (removal) =>
        kinds.includes(removal.kind) &&
        (!strict || removal.entryId === write.entryId) &&
        removal.removed.has(write.value) &&
        (removal.knowledge.has(write.event) ||
          (!strict &&
            removal.kind === 'edit' &&
            write.keptFrom !== null &&
            removal.knowledge.has(write.keptFrom))),
    );
  const lost = new Set<string>();
  const lostKept = new Set<string>();
  for (const write of state.writes) {
    if (superseded(write, ['edit', 'keep', 'delete'])) continue;
    if (visibleTexts.some((texts) => !texts.has(write.value))) {
      lost.add(write.value);
      if (write.keptFrom !== null) lostKept.add(write.value);
    }
  }
  // A value that an edit or keep in the same entry replaced, having seen
  // every write of it there, must not come back. A delete undone by an
  // unseen edit brings the entry back as the join of every copy, so values
  // the deleting device had itself replaced stay replaced. A keep is its own
  // write, so an edit that had not seen the keep leaves the kept value open.
  const stale = new Set<string>();
  const isStale = (value: string | null, entryId: string) => {
    if (value === null) return false;
    const writes = state.writes.filter(
      (write) => write.value === value && write.entryId === entryId,
    );
    return (
      writes.length > 0 &&
      writes.every((write) => superseded(write, ['edit', 'keep'], true))
    );
  };
  for (const view of views) {
    for (const entry of view.entries)
      for (const value of [...entry.titles, ...entry.contents])
        if (isStale(value, entry.id)) stale.add(value!);
    for (const value of view.profileNames)
      if (isStale(value, 'profile')) stale.add(value!);
  }
  let keptBothLost = 0;
  for (const [position, left] of state.keeps.entries()) {
    for (const right of state.keeps.slice(position + 1)) {
      const concurrent =
        !left.knowledge.has(right.event) && !right.knowledge.has(left.event);
      const different = left.affirmed.join('\0') !== right.affirmed.join('\0');
      const allLost = [...left.affirmed, ...right.affirmed].every((value) =>
        lostKept.has(value),
      );
      if (concurrent && different && allLost && left.affirmed.length > 0) keptBothLost++;
    }
  }
  const lostEntries: string[] = [];
  const undoneDeletes: string[] = [];
  for (const [entryId, deletes] of state.entryDeletes) {
    const writes = state.entryWrites.get(entryId) ?? [];
    const unseen = writes.some((write) => deletes.every((seen) => !seen.has(write)));
    const visible = views.map((view) =>
      view.entries.some((entry) => entry.id === entryId),
    );
    if (unseen && visible.some((value) => !value)) lostEntries.push(entryId);
    if (!unseen && visible.some(Boolean)) undoneDeletes.push(entryId);
  }
  // An added tag or attachment stays on every device that shows its entry,
  // unless a removal that had seen the add took it off: a remove, a tag
  // delete or a delete of the entry, as for text. A concurrent tag delete
  // does not: the add wins.
  const lostMemberships = new Set<string>();
  for (const add of state.memberships) {
    const removed = state.membershipRemovals.some(
      (removal) =>
        (removal.id === null || removal.id === add.id) &&
        (removal.entryId === null || removal.entryId === add.entryId) &&
        removal.knowledge.has(add.event),
    );
    if (removed) continue;
    for (const view of views) {
      const entry = view.entries.find((value) => value.id === add.entryId);
      if (!entry) continue;
      const ids = add.key.startsWith('addTag') ? entry.tagIds : entry.attachmentIds;
      if (!ids.includes(add.id)) lostMemberships.add(add.key);
    }
  }
  const duplicates = (values: string[]) => values.length - new Set(values).size;
  const duplicatesIn = (view: View) =>
    duplicates(view.tags.map((item) => adapter.normalizeTitle('tag', item.title))) +
    duplicates(view.prompts.map((item) => adapter.normalizeTitle('prompt', item.title)));
  return {
    seed: config.seed,
    devices: config.devices,
    events,
    converged: fingerprints.every((value) => value === fingerprints[0]),
    lostTexts: [...lost].sort(),
    lostKept: [...lostKept].sort(),
    keptBothLost,
    staleValues: [...stale].sort(),
    lostEntries: lostEntries.sort(),
    undoneDeletes: undoneDeletes.sort(),
    duplicateTitles: Math.max(...views.map(duplicatesIn)),
    syncFailures: state.syncFailures,
    finalRounds,
    unsettled: finalRounds > MAX_FINAL_ROUNDS,
    lostMemberships: [...lostMemberships].sort(),
  };
}

export type AdapterFactory = (devices: number) => SimAdapter | Promise<SimAdapter>;

export async function runCase(
  factory: AdapterFactory,
  config: CaseConfig,
): Promise<{ result: CaseResult; events: Event[] }> {
  const adapter = await factory(config.devices);
  try {
    const { events, state } = await generateCase(adapter, config);
    const rounds = await finalRound(adapter, state, config.devices);
    return { result: check(adapter, state, config, events.length, rounds), events };
  } finally {
    adapter.dispose?.();
  }
}

export async function replayCase(
  factory: AdapterFactory,
  config: CaseConfig,
  events: Event[],
): Promise<CaseResult> {
  const adapter = await factory(config.devices);
  try {
    const state = newOracle(config);
    for (const [index, event] of events.entries()) {
      // Indexes stay those of the original list so text values stay unique.
      await runEvent(adapter, state, event, eventIndex(event, index));
    }
    const rounds = await finalRound(adapter, state, config.devices);
    return check(adapter, state, config, events.length, rounds);
  } finally {
    adapter.dispose?.();
  }
}

const ORIGINAL_INDEX = Symbol('originalIndex');
type Indexed = Event & { [ORIGINAL_INDEX]?: number };
const eventIndex = (event: Event, fallback: number) =>
  (event as Indexed)[ORIGINAL_INDEX] ?? fallback;

/**
 * Greedy delta debugging: drops chunks of events while `stillFails` holds.
 * Returns the smallest list found within `budget` replays.
 */
export async function shrinkCase(
  factory: AdapterFactory,
  config: CaseConfig,
  events: Event[],
  stillFails: (result: CaseResult) => boolean,
  budget = 400,
): Promise<{ events: Event[]; result: CaseResult | null }> {
  let current: Event[] = events.map((event, index) => ({
    ...event,
    [ORIGINAL_INDEX]: index,
  }));
  let last: CaseResult | null = null;
  let replays = 0;
  for (let chunk = Math.max(1, Math.floor(current.length / 2)); chunk >= 1;) {
    let removedAny = false;
    for (let start = 0; start < current.length && replays < budget;) {
      const candidate = [...current.slice(0, start), ...current.slice(start + chunk)];
      replays++;
      const result = await replayCase(factory, config, candidate);
      if (stillFails(result)) {
        current = candidate;
        last = result;
        removedAny = true;
      } else start += chunk;
    }
    if (replays >= budget) break;
    if (!removedAny) chunk = Math.floor(chunk / 2);
  }
  return { events: current, result: last };
}

export function describeEvents(events: Event[]): string {
  return events
    .map((event, index) => {
      const { kind, ...rest } = event;
      return `${eventIndex(event, index)}: ${kind} ${JSON.stringify(rest)}`;
    })
    .join('\n');
}
