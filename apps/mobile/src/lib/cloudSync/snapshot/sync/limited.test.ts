import { forEachLimited } from './limited';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('forEachLimited', () => {
  test('runs every item in order, at most `limit` at a time', async () => {
    let inFlight = 0;
    let most = 0;
    const started: number[] = [];
    await forEachLimited([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      started.push(item);
      inFlight += 1;
      most = Math.max(most, inFlight);
      await tick();
      inFlight -= 1;
    });
    expect(started).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(most).toBe(3);
  });

  test('handles no items and a limit above the item count', async () => {
    await forEachLimited([], 6, async () => {
      throw new Error('never called');
    });
    const seen: number[] = [];
    await forEachLimited([1, 2], 6, async (item) => void seen.push(item));
    expect(seen).toEqual([1, 2]);
  });

  test('after a failure nothing new starts; those in flight finish, then the first error is thrown', async () => {
    const started: number[] = [];
    const finished: number[] = [];
    const run = forEachLimited([1, 2, 3, 4, 5], 3, async (item) => {
      started.push(item);
      if (item === 2) throw new Error('first');
      await tick();
      await tick();
      if (item === 3) throw new Error('second');
      finished.push(item);
    });
    await expect(run).rejects.toThrow('first');
    expect(started).toEqual([1, 2, 3]);
    // Nothing is still running once it settles.
    expect(finished).toEqual([1]);
    await tick();
    await tick();
    expect(finished).toEqual([1]);
  });

  test("'stop' starts no more items without failing", async () => {
    const started: number[] = [];
    await forEachLimited([1, 2, 3, 4, 5], 2, async (item) => {
      started.push(item);
      await tick();
      return item === 1 ? 'stop' : undefined;
    });
    expect(started).toEqual([1, 2]);
  });
});
