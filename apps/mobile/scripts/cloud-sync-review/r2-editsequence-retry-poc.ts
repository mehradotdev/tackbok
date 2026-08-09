/* PoC: does a crash-retried push still mint a second provisional version? (R2) */
import { canonicalBytes } from '/Volumes/LocalDisk/proj/tackbok/apps/mobile/src/lib/cloudSync/codec';
import { FakeCloudProvider } from '/Volumes/LocalDisk/proj/tackbok/apps/mobile/src/lib/cloudSync/providers';
import { InMemorySyncDevice } from '/Volumes/LocalDisk/proj/tackbok/apps/mobile/src/lib/cloudSync/engine';
import type { EntryState } from '/Volumes/LocalDisk/proj/tackbok/apps/mobile/src/lib/cloudSync/domain/types';

const entry = (content: string): EntryState => ({
  entityType: 'entry', title: content, content, mood: null, tagIds: [], assets: [],
  createdAt: 1, updatedAt: 1, conflictOriginId: null,
});

const provider = new FakeCloudProvider(50);
await provider.connect();
const { vault } = await provider.createVaultMarker('vault',
  canonicalBytes({ magic: 'tackbok-vault', formatVersion: 1, vaultId: 'vault' }));

const a = new InMemorySyncDevice('a', vault, provider);
a.mutate('entry', 'e', entry('v1'));

// Pass 1: publish crashes AFTER the object is stored remotely (classic retry boundary).
provider.faults.failNextPutAfterStore = true;
try { await a.sync(); } catch (err) { console.log('[R2] pass1 threw:', (err as Error).message); }

const afterFirst = (await provider.list(vault, 'entities/')).objects;
console.log('[R2] remote objects after crashed push:', afterFirst.length);

// Pass 2: the retry. Same logical mutation, still in the outbox.
await a.sync();
await a.sync();

const afterRetry = (await provider.list(vault, 'entities/')).objects;
const entryObjects = afterRetry.filter((o) => o.key.includes('/entry/'));
console.log('[R2] remote entry objects after retry:', entryObjects.length);
for (const o of entryObjects) console.log('   ', o.key);

let editCount = 0;
for (const o of entryObjects) {
  const body = JSON.parse(new TextDecoder().decode(o.body));
  if (body.kind === 'edit') editCount++;
  console.log('    kind=' + body.kind, 'authoredAt=' + body.authoredAt,
    'editSequence=' + body.editSequence, 'parents=' + JSON.stringify(body.parents).slice(0, 40));
}
console.log('[R2] edit-kind versions:', editCount);
console.log(
  editCount > 1
    ? '[R2] VERDICT: retry minted an EXTRA version (fork per retry persists)'
    : '[R2] VERDICT: OK - retry reused the identical version',
);
