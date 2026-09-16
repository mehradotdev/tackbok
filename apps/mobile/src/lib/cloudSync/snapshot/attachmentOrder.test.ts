import { completeAttachmentOrder, mergeAttachmentOrder } from './attachmentOrder';

describe('attachment display order', () => {
  it('preserves a one-sided reorder and appends additions from the other device', () => {
    expect(mergeAttachmentOrder(['b', 'a'], ['a', 'b'], ['b', 'a'], ['b', 'a']))
      .toEqual(['a', 'b']);
    expect(mergeAttachmentOrder(['a'], ['a', 'b'], ['a', 'c'], ['a', 'c', 'b']))
      .toEqual(['a', 'b', 'c']);
  });

  it('does not infer deletion from order or resurrect deleted attachments', () => {
    expect(mergeAttachmentOrder(['a', 'b'], ['a', 'c'], ['b', 'a', 'd'], ['a', 'c', 'd']))
      .toEqual(['a', 'c', 'd']);
    expect(completeAttachmentOrder(['deleted', 'b', 'b'], ['a', 'b', 'c']))
      .toEqual(['b', 'a', 'c']);
  });

  it('prefers a known order over a legacy snapshot and sorts only unknown IDs', () => {
    expect(mergeAttachmentOrder(undefined, ['z', 'a'], undefined, ['b', 'a', 'z']))
      .toEqual(['z', 'a', 'b']);
    expect(mergeAttachmentOrder(undefined, undefined, ['z', 'a'], ['b', 'a', 'z']))
      .toEqual(['z', 'a', 'b']);
  });

  it('is symmetric, repeatable, and preserves exactly the surviving membership', () => {
    const orders = [undefined, [], ['a', 'b'], ['b', 'a'], ['a', 'c'], ['b', 'd', 'a']];
    for (const base of orders) for (const local of orders) for (const remote of orders) {
      for (const live of [[], ['a'], ['a', 'b'], ['a', 'c', 'd']]) {
        const result = mergeAttachmentOrder(base, local, remote, live);
        expect([...result].sort()).toEqual([...live].sort());
        expect(mergeAttachmentOrder(base, remote, local, live)).toEqual(result);
        expect(mergeAttachmentOrder(base, result, result, live)).toEqual(result);
      }
    }
  });
});
