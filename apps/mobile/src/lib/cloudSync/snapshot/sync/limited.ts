/**
 * Runs `work` on each item, at most `limit` at a time, in order. Returning
 * `'stop'` starts no more items without failing. After a failure no new item
 * starts either; the ones in flight finish, then the first error is thrown,
 * so nothing is still running once this settles.
 */
export async function forEachLimited<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void | 'stop'>,
): Promise<void> {
  let next = 0;
  let stopped = false;
  let failure: { error: unknown } | null = null;
  const worker = async () => {
    while (!stopped && next < items.length) {
      const item = items[next++];
      try {
        if ((await work(item)) === 'stop') stopped = true;
      } catch (error) {
        stopped = true;
        failure ??= { error };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker),
  );
  if (failure) throw (failure as { error: unknown }).error;
}
