import { sanitizePromptTitle, sanitizeTagName } from '~/lib/utils';

import { canonicalize } from '../snapshot/canonical';
import { sha256Text } from '../snapshot/sha256';
import type { Stamp, TextField } from './types';

export type NamedKind = 'tag' | 'prompt';

/**
 * The key two titles share when the app treats them as duplicates: the same
 * sanitising as on save, then a case-insensitive comparison. Both tags and
 * prompts are case-insensitive today (`TagsModal.tsx`, `PromptLibraryModal.tsx`,
 * `assertUniqueTitle` in `cloudSync/storage/repositories.ts` and the import).
 * NFC is new: the same title typed as composed or decomposed characters
 * would otherwise get two IDs.
 */
export function normalizeTitle(kind: NamedKind, title: string): string {
  const clean = kind === 'tag' ? sanitizeTagName(title) : sanitizePromptTitle(title);
  return clean.normalize('NFC').toLowerCase();
}

/**
 * Two devices creating the same title offline get the same ID, so they end
 * up with one tag. The ID keeps the title it was created with: a rename
 * changes only the title. When a renamed tag still holds the ID a new title
 * derives, creation tries the next `attempt` (see `createNamed`).
 *
 * Not scoped to a vault: the app creates tags with sync off, before it knows
 * one, and an ID that never changes keeps references (entries, exports)
 * stable when the journal joins a vault.
 */
export function namedId(kind: NamedKind, title: string, attempt = 0): string {
  const parts: (string | number)[] = [kind, normalizeTitle(kind, title)];
  if (attempt > 0) parts.push(attempt);
  return `${kind}-${sha256Text(canonicalize(parts)).slice(0, 32)}`;
}

export const NAMED_ID = /^(tag|prompt)-[0-9a-f]{32}$/;

/** "Keep both" on two devices at once makes the same entry. */
export function splitEntryId(from: string, field: TextField, stamp: Stamp): string {
  return `split-${sha256Text(canonicalize([from, field, [stamp[0], stamp[1]]])).slice(0, 32)}`;
}
