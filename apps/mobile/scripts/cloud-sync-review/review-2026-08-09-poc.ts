/* PoC for two suspected Apply-CAS violations in inMemorySyncDevice. */
import { canonicalBytes } from '/Volumes/LocalDisk/proj/tackbok/apps/mobile/src/lib/cloudSync/codec';
import { FakeCloudProvider } from '/Volumes/LocalDisk/proj/tackbok/apps/mobile/src/lib/cloudSync/providers';
import { InMemorySyncDevice } from '/Volumes/LocalDisk/proj/tackbok/apps/mobile/src/lib/cloudSync/engine';
import type { EntryState, TagState } from '/Volumes/LocalDisk/proj/tackbok/apps/mobile/src/lib/cloudSync/domain/types';

const entry = (content: string, tags: string[] = [], assets: EntryState['assets'] = []): EntryState => ({
  entityType: 'entry', title: content, content, mood: null, tagIds: tags, assets,
  createdAt: 1, updatedAt: 1, conflictOriginId: null,
});
const tag = (title: string): TagState => ({
  entityType: 'tag', title, createdAt: 1, updatedAt: 1, conflictOriginId: null,
});

async function setup() {
  const provider = new FakeCloudProvider(50);
  await provider.connect();
  const { vault } = await provider.createVaultMarker('vault',
    canonicalBytes({ magic: 'tackbok-vault', formatVersion: 1, vaultId: 'vault' }));
  return { provider, vault };
}

async function poc1() {
  // Dirty entity deferred by unpublishable asset -> remote apply clobbers local edit.
  const { vault, provider } = await setup();
  const a = new InMemorySyncDevice('a', vault, provider);
  const b = new InMemorySyncDevice('b', vault, provider);
  a.mutate('entry', 'e', entry('shared-base'));
  await a.sync();
  await b.sync(); // b now has the entry, clean
  // b makes an offline edit that references a not-yet-hashed asset (blobHash pending)
  b.mutate('entry', 'e', entry('local-edit-with-photo', [], [{
    assetId: 'photo-1', kind: 'photo', mimeType: 'image/jpeg', byteSize: 3,
    width: 1, height: 1, durationMs: null, blobHash: 'pending', // not a sha256 yet
  }]));
  // meanwhile a publishes a remote edit
  a.mutate('entry', 'e', entry('remote-edit'));
  await a.sync();
  // b syncs: entity deferred from Branch (asset unpublishable) but remote head applied anyway?
  await b.sync();
  const state = b.snapshot()['entry:e'];
  const content = state?.entityType === 'entry' ? state.content : '?';
  console.log('[PoC1] domain content after pass:', JSON.stringify(content));
  console.log('[PoC1] outbox still dirty:', b.outbox.size === 1);
  // Now the user finishes hashing? Even without that, next pass builds a provisional
  // from DOMAIN state (which was clobbered) -> authored text is gone forever.
  console.log('[PoC1] VERDICT:', content === 'local-edit-with-photo'
    ? 'OK - dirty edit preserved' : 'DATA LOSS - remote apply overwrote dirty local edit');
}

async function poc2() {
  // CAS-skipped entry still rewritten+applied by recoverTombstonedTagReferences.
  const { vault, provider } = await setup();
  const a = new InMemorySyncDevice('a', vault, provider);
  const b = new InMemorySyncDevice('b', vault, provider);
  a.mutate('tag', 't', tag('Kindness'));
  a.mutate('entry', 'e', entry('base', ['t']));
  await a.sync();
  await b.sync();
  a.mutate('tag', 't', null); // delete tag on a
  a.mutate('entry', 'e', entry('remote-edit', ['t'])); // and edit the entry still referencing it
  await a.sync();
  // b: entry clean at pull start; user saves between resolve and apply
  const result = await b.sync({
    beforeApply: (device) => device.mutate('entry', 'e', entry('newest-local', ['t'])),
  });
  const state = b.snapshot()['entry:e'];
  const content = state?.entityType === 'entry' ? state.content : '?';
  console.log('[PoC2] skippedByCas:', result.skippedByCas);
  console.log('[PoC2] domain content after pass:', JSON.stringify(content));
  console.log('[PoC2] VERDICT:', content === 'newest-local'
    ? 'OK - CAS held' : 'CAS VIOLATED - tombstoned-tag rewrite overwrote the newer save');
}

async function poc3() {
  // Cross-device recovered-tag ID divergence -> duplicated recovered tags.
  const { vault, provider } = await setup();
  const a = new InMemorySyncDevice('a', vault, provider);
  const b = new InMemorySyncDevice('b', vault, provider);
  a.mutate('tag', 't', tag('Kindness'));
  a.mutate('entry', 'e', entry('base', ['t']));
  await a.sync();
  await b.sync();
  a.mutate('tag', 't', null);
  await a.sync();
  // both devices concurrently edit the entry while referencing the tombstoned tag
  b.mutate('entry', 'e', entry('b-edit', ['t']));
  await b.sync(); // b rewrites against its own head -> recovered id f(t, hashB)
  a.mutate('entry', 'e', entry('a-edit', ['t']));
  await a.sync(); // a rewrites against its own head -> recovered id f(t, hashA)
  for (let i = 0; i < 6; i++) { await a.sync(); await b.sync(); }
  const tags = Object.entries(a.snapshot()).filter(([k, v]) => v.entityType === 'tag');
  console.log('[PoC3] live tag rows:', tags.map(([k, v]) => `${k}=${(v as TagState).title}`));
  console.log('[PoC3] recovered-tag count:', tags.length,
    tags.length > 1 ? '(DUPLICATE recovered tags from one tombstone race)' : '');
}

(async () => {
  await poc1();
  await poc2();
  await poc3();
})().catch((error) => { console.error('PoC crashed:', error); process.exit(1); });
