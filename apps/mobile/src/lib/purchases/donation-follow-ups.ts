import { kvStorage } from '~/lib/kvStorage';
import type { DonorNote } from './donor-note';
import type { SupportTierId } from './support-catalog';

/**
 * Donations that still need something after the purchase call returned:
 * - a pending payment (UPI, Ask to Buy, cash) to watch until the store
 *   completes it, so the app can thank the donor and send their note;
 * - a completed donation whose note has not reached the server yet.
 *
 * Only these records are persisted. A note that was never submitted stays in
 * the screen's memory. Nothing here is part of backups or exports.
 */

export const DONATION_FOLLOW_UPS_KEY = 'support.donationFollowUps.v1';
/** Pending payments that never complete, and unsendable notes, are dropped after this. */
export const DONATION_FOLLOW_UP_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Store clocks and the device clock can disagree a little. */
const PURCHASE_DATE_TOLERANCE_MS = 10 * 60 * 1000;
/**
 * Stands in for the transaction ID of a completed purchase the store did not
 * identify; the server then attaches the note to the newest donation.
 */
export const UNKNOWN_TRANSACTION_ID = 'unknown';

export type DonationFollowUp = {
  id: string;
  tierId: SupportTierId;
  productId: string;
  createdAt: number;
  /** null while the payment is pending. */
  transactionId: string | null;
  /** Transactions for this product that existed before the purchase started. */
  knownTransactionIds: string[];
  note: DonorNote | null;
};

export type StoreTransaction = {
  transactionIdentifier: string;
  productIdentifier: string;
  purchaseDate: string;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseFollowUp(value: unknown): DonationFollowUp | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const note = record.note as Record<string, unknown> | null | undefined;
  const validNote =
    note == null ||
    (typeof note === 'object' &&
      typeof note.message === 'string' &&
      typeof note.email === 'string');
  if (
    typeof record.id !== 'string' ||
    typeof record.tierId !== 'string' ||
    typeof record.productId !== 'string' ||
    typeof record.createdAt !== 'number' ||
    !(record.transactionId === null || typeof record.transactionId === 'string') ||
    !isStringArray(record.knownTransactionIds) ||
    !validNote
  ) {
    return null;
  }
  return record as DonationFollowUp;
}

/** Keeps records that are well-formed, unexpired and still need work. */
export function pruneFollowUps(values: unknown, now: number): DonationFollowUp[] {
  if (!Array.isArray(values)) return [];
  return values.map(parseFollowUp).filter(
    (record): record is DonationFollowUp =>
      record !== null &&
      now - record.createdAt < DONATION_FOLLOW_UP_MAX_AGE_MS &&
      // A completed donation without a note needs nothing more.
      (record.transactionId === null || record.note !== null),
  );
}

/**
 * Finds pending donations that the store has since completed: a transaction
 * for the same product that did not exist when the purchase started and is
 * not already attributed to another donation.
 *
 * The newest pending donation is matched first, to the earliest transaction
 * after it started. A declined attempt that stays pending then can't take the
 * payment of a later attempt that went through.
 */
export function matchCompletedDonations(
  records: readonly DonationFollowUp[],
  transactions: readonly StoreTransaction[],
): { records: DonationFollowUp[]; completed: DonationFollowUp[] } {
  const claimed = new Set(
    records.flatMap((record) => (record.transactionId ? [record.transactionId] : [])),
  );
  const dated = transactions
    .map((transaction) => ({
      transaction,
      purchasedAt: Date.parse(transaction.purchaseDate),
    }))
    .filter(({ purchasedAt }) => !Number.isNaN(purchasedAt))
    .sort((a, b) => a.purchasedAt - b.purchasedAt);
  const matched = new Map<string, string>();
  const pendingNewestFirst = records
    .filter((record) => record.transactionId === null)
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const record of pendingNewestFirst) {
    const match = dated.find(
      ({ transaction, purchasedAt }) =>
        transaction.productIdentifier === record.productId &&
        !claimed.has(transaction.transactionIdentifier) &&
        !record.knownTransactionIds.includes(transaction.transactionIdentifier) &&
        purchasedAt >= record.createdAt - PURCHASE_DATE_TOLERANCE_MS,
    );
    if (!match) continue;
    claimed.add(match.transaction.transactionIdentifier);
    matched.set(record.id, match.transaction.transactionIdentifier);
  }
  const completed: DonationFollowUp[] = [];
  const updated = records.map((record) => {
    const transactionId = matched.get(record.id);
    if (!transactionId) return record;
    const done = { ...record, transactionId };
    completed.push(done);
    return done;
  });
  return { records: updated, completed };
}

// Serializes read-modify-write cycles; the purchase flow and the RevenueCat
// listener can both update the list.
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

async function loadFollowUps(now: number): Promise<DonationFollowUp[]> {
  // A failed read throws, so a storage hiccup can't overwrite the list with
  // nothing. Only unreadable JSON, which can never recover, counts as empty.
  const raw = await kvStorage.getItem(DONATION_FOLLOW_UPS_KEY);
  if (!raw) return [];
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return [];
  }
  return pruneFollowUps(stored, now);
}

export function updateFollowUps<T>(
  change: (records: DonationFollowUp[]) => { records: DonationFollowUp[]; result: T },
  now: () => number = Date.now,
): Promise<T> {
  return enqueue(async () => {
    const { records, result } = change(await loadFollowUps(now()));
    const kept = pruneFollowUps(records, now());
    if (kept.length === 0) await kvStorage.removeItem(DONATION_FOLLOW_UPS_KEY);
    else await kvStorage.setItem(DONATION_FOLLOW_UPS_KEY, JSON.stringify(kept));
    return result;
  });
}

export function readFollowUps(now: () => number = Date.now): Promise<DonationFollowUp[]> {
  return enqueue(() => loadFollowUps(now()));
}

/** Delete All Data also drops unsent notes and pending donations. */
export function clearFollowUps(): Promise<void> {
  return enqueue(() => kvStorage.removeItem(DONATION_FOLLOW_UPS_KEY));
}
