/** Items stringified between pauses. */
const ITEMS_PER_PIECE = 250;

/** Lets the app respond between pieces of a long export step. */
export const pauseForApp = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Files added to an export's ZIP between pauses. */
export const FILES_PER_PAUSE = 50;

/**
 * `JSON.stringify(items, null, 2)`, a few hundred items at a time with a pause
 * between, so the app keeps responding. In one piece, a 10,000-entry backup's
 * `entries.json` held a low-end Android phone for 3.7 s (#185 P15).
 */
export async function stringifyArrayInPieces(
  // Objects always stringify to text, as `JSON.stringify` needs here.
  items: readonly object[],
): Promise<string> {
  if (items.length === 0) return '[]';
  const parts: string[] = [];
  for (let start = 0; start < items.length; start += ITEMS_PER_PIECE) {
    if (start > 0) await pauseForApp();
    for (const item of items.slice(start, start + ITEMS_PER_PIECE)) {
      // Each item one level in, as the whole array's stringify indents it.
      parts.push(`  ${JSON.stringify(item, null, 2).replace(/\n/g, '\n  ')}`);
    }
  }
  return `[\n${parts.join(',\n')}\n]`;
}
