import type { LedgerClaim } from './donor-note';

/** Notes one app user may send in any 30-day window. */
export const MAX_NOTES_PER_USER = 3;
export const USER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface LedgerStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}

/**
 * Records which purchases already carried a note and how many notes each app
 * user sent recently. Keys hold only opaque RevenueCat IDs and timestamps.
 *
 * shortcut: purchase keys are never pruned; they are tiny and donations are
 * rare. Add an alarm-driven cleanup if the ledger ever grows large.
 */
export async function claimNote(
  storage: LedgerStorage,
  purchaseId: string,
  appUserId: string,
  now: number,
): Promise<LedgerClaim> {
  const purchaseKey = `purchase:${purchaseId}`;
  if ((await storage.get<number>(purchaseKey)) !== undefined) return 'duplicate';

  const userKey = `user:${appUserId}`;
  const recent = ((await storage.get<number[]>(userKey)) ?? []).filter(
    (sentAt) => now - sentAt < USER_WINDOW_MS,
  );
  if (recent.length >= MAX_NOTES_PER_USER) return 'user_limit';

  await storage.put(purchaseKey, now);
  await storage.put(userKey, [...recent, now]);
  return 'claimed';
}

export async function releaseNote(
  storage: LedgerStorage,
  purchaseId: string,
  appUserId: string,
): Promise<void> {
  const purchaseKey = `purchase:${purchaseId}`;
  const claimedAt = await storage.get<number>(purchaseKey);
  if (claimedAt === undefined) return;
  await storage.delete(purchaseKey);
  const userKey = `user:${appUserId}`;
  const recent = (await storage.get<number[]>(userKey)) ?? [];
  const index = recent.indexOf(claimedAt);
  if (index !== -1) recent.splice(index, 1);
  await storage.put(userKey, recent);
}
