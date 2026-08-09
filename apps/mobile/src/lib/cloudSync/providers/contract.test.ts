import { canonicalBytes } from '../codec';
import { FakeCloudProvider } from './fake';

async function setup(pageSize = 2) {
  const provider = new FakeCloudProvider(pageSize);
  await provider.connect();
  const { vault } = await provider.createVaultMarker(
    'vault',
    canonicalBytes({ formatVersion: 1, vaultId: 'vault' }),
  );
  return { provider, vault };
}

test('immutable writes tolerate physical duplicates but reject same-key different bytes', async () => {
  const { provider, vault } = await setup();
  const bytes = new Uint8Array([1, 2, 3]);
  provider.faults.duplicateNextPut = true;
  await provider.putImmutable(vault, 'entities/entry/e/hash.json', bytes);
  expect(
    provider.physicalObjects(vault).filter((object) => object.key.includes('/hash.json')),
  ).toHaveLength(2);
  await expect(
    provider.putImmutable(vault, 'entities/entry/e/hash.json', new Uint8Array([4])),
  ).rejects.toMatchObject({ category: 'corrupt' });
});

test('lost responses are retry-safe and listing/change pagination is bounded', async () => {
  const { provider, vault } = await setup(1);
  provider.faults.failNextPutAfterStore = true;
  await expect(
    provider.putImmutable(vault, 'entities/entry/e/a.json', new Uint8Array([1])),
  ).rejects.toMatchObject({ category: 'transient' });
  await expect(
    provider.putImmutable(vault, 'entities/entry/e/a.json', new Uint8Array([1])),
  ).resolves.toMatchObject({ key: 'entities/entry/e/a.json' });
  await provider.putImmutable(vault, 'entities/entry/e/b.json', new Uint8Array([2]));
  const first = await provider.list(vault, 'entities/');
  const second = await provider.list(vault, 'entities/', first.cursor ?? undefined);
  expect(first.objects).toHaveLength(1);
  expect(second.objects).toHaveLength(1);
});

test('permanent delete is idempotent and interrupted purge resumes without deleting markers', async () => {
  const { provider, vault } = await setup(1);
  const marker = await provider.putImmutable(
    vault,
    'revocations/marker.json',
    canonicalBytes({ kind: 'backup-deleted' }),
  );
  const object = await provider.putImmutable(
    vault,
    'entities/entry/e/a.json',
    new Uint8Array([1]),
  );
  await provider.deleteObject(vault, object);
  await expect(provider.deleteObject(vault, object)).resolves.toBeUndefined();
  await provider.putImmutable(vault, 'entities/entry/e/b.json', new Uint8Array([2]));
  await provider.putImmutable(vault, 'blobs/aa/hash', new Uint8Array([3]));
  provider.faults.failNextDelete = true;
  await expect(provider.deleteVaultResidue(vault)).rejects.toMatchObject({
    category: 'transient',
  });
  let sweep = await provider.deleteVaultResidue(vault);
  while (!sweep.complete) sweep = await provider.deleteVaultResidue(vault, sweep.cursor ?? undefined);
  expect(provider.physicalObjects(vault).map((item) => item.fileId)).toContain(marker.fileId);
  expect(
    provider.physicalObjects(vault).every((item) => item.key.startsWith('revocations/')),
  ).toBe(true);
});
