/** Order never decides membership. Missing IDs are appended, deleted IDs ignored. */
export function completeAttachmentOrder(order: readonly string[] | undefined, liveIds: readonly string[]): string[] {
  const remaining = new Set(liveIds);
  const result: string[] = [];
  for (const id of order ?? []) {
    if (remaining.delete(id)) result.push(id);
  }
  return [...result, ...[...remaining].sort()];
}

/** Three-way sequence choice, followed by union of the surviving attachments.
 * Concurrent choices use lexical ID-array order, never device identity or time.
 * New IDs from the other branch retain their relative order after the winner.
 */
export function mergeAttachmentOrder(
  base: readonly string[] | undefined,
  local: readonly string[] | undefined,
  remote: readonly string[] | undefined,
  liveIds: readonly string[],
): string[] {
  const live = new Set(liveIds);
  const project = (ids: readonly string[] | undefined) => [...new Set(ids ?? [])].filter((id) => live.has(id));
  const b = project(base), l = project(local), r = project(remote);
  const key = (ids: string[]) => JSON.stringify(ids);
  let primary: string[], secondary: string[];
  if (local === undefined || (base !== undefined && key(l) === key(b))) {
    primary = r; secondary = l;
  } else if (remote === undefined || (base !== undefined && key(r) === key(b))) {
    primary = l; secondary = r;
  } else {
    [primary, secondary] = key(l) <= key(r) ? [l, r] : [r, l];
  }
  return completeAttachmentOrder([...primary, ...secondary], liveIds);
}
