/** Notes one app user may send in any 30-day window. */
export const MAX_NOTES_PER_USER = 3;
export const USER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * How long an unconfirmed claim blocks other requests for the same purchase.
 * A request that dies between claiming and releasing leaves one behind; after
 * this the purchase can be claimed again (Resend's idempotency key still stops
 * a second email if the first one did go out).
 */
export const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

export type LedgerClaim =
  | { status: 'claimed'; purchaseId: string }
  | { status: 'duplicate' | 'in_progress' | 'user_limit' };

type PurchaseRecord = { at: number; sent: boolean };

export interface LedgerStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  delete(key: string): Promise<boolean>;
}

const purchaseKey = (purchaseId: string) => `purchase:${purchaseId}`;
const userKey = (appUserId: string) => `user:${appUserId}`;
const noteKey = (noteId: string) => `note:${noteId}`;

function withoutOne(values: readonly number[], value: number): number[] {
  const index = values.indexOf(value);
  return index === -1
    ? [...values]
    : [...values.slice(0, index), ...values.slice(index + 1)];
}

/**
 * Records which purchases already carried a note and how many notes each app
 * user sent recently. Keys hold only opaque RevenueCat IDs and timestamps.
 *
 * Claims the first of `purchaseIds` (best match first) that has no note yet.
 * A note the app already sent once (same `noteId`) stays tied to the purchase it
 * claimed, so a retry after a lost response can't attach it to another one.
 *
 * shortcut: purchase keys are never pruned; they are tiny and donations are
 * rare. Add an alarm-driven cleanup if the ledger ever grows large.
 */
export async function claimNote(
  storage: LedgerStorage,
  purchaseIds: readonly string[],
  appUserId: string,
  noteId: string | null,
  now: number,
): Promise<LedgerClaim> {
  const earlier = noteId ? await storage.get<string>(noteKey(noteId)) : undefined;
  if (earlier !== undefined) purchaseIds = [earlier];

  let chosen: { purchaseId: string; stale?: PurchaseRecord } | null = null;
  let sawInProgress = false;
  for (const purchaseId of purchaseIds) {
    const record = await storage.get<PurchaseRecord>(purchaseKey(purchaseId));
    if (!record) {
      chosen = { purchaseId };
      break;
    }
    if (record.sent) continue;
    if (now - record.at < CLAIM_TIMEOUT_MS) {
      sawInProgress = true;
      continue;
    }
    chosen = { purchaseId, stale: record };
    break;
  }
  if (!chosen) return { status: sawInProgress ? 'in_progress' : 'duplicate' };

  const stored = (await storage.get<number[]>(userKey(appUserId))) ?? [];
  // A stale claim already counted against this user; reuse its slot.
  const recent = (chosen.stale ? withoutOne(stored, chosen.stale.at) : stored).filter(
    (claimedAt) => now - claimedAt < USER_WINDOW_MS,
  );
  if (recent.length >= MAX_NOTES_PER_USER) return { status: 'user_limit' };

  await storage.put({
    [purchaseKey(chosen.purchaseId)]: { at: now, sent: false } satisfies PurchaseRecord,
    [userKey(appUserId)]: [...recent, now],
    ...(noteId ? { [noteKey(noteId)]: chosen.purchaseId } : {}),
  });
  return { status: 'claimed', purchaseId: chosen.purchaseId };
}

/** Marks a claimed note as sent, so the purchase can never carry another. */
export async function confirmNote(
  storage: LedgerStorage,
  purchaseId: string,
): Promise<void> {
  const record = await storage.get<PurchaseRecord>(purchaseKey(purchaseId));
  if (!record || record.sent) return;
  await storage.put({ [purchaseKey(purchaseId)]: { ...record, sent: true } });
}

/** Undoes a claim whose email failed, so the app can retry the note. */
export async function releaseNote(
  storage: LedgerStorage,
  purchaseId: string,
  appUserId: string,
  noteId: string | null,
): Promise<void> {
  const record = await storage.get<PurchaseRecord>(purchaseKey(purchaseId));
  if (!record || record.sent) return;
  await storage.delete(purchaseKey(purchaseId));
  if (noteId) await storage.delete(noteKey(noteId));
  const recent = withoutOne(
    (await storage.get<number[]>(userKey(appUserId))) ?? [],
    record.at,
  );
  if (recent.length) await storage.put({ [userKey(appUserId)]: recent });
  else await storage.delete(userKey(appUserId));
}
