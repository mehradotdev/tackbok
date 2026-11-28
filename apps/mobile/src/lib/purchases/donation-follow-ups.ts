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
 */
export function matchCompletedDonations(
  records: readonly DonationFollowUp[],
  transactions: readonly StoreTransaction[],
): { records: DonationFollowUp[]; completed: DonationFollowUp[] } {
  const claimed = new Set(
    records.flatMap((record) => (record.transactionId ? [record.transactionId] : [])),
  );
  const completed: DonationFollowUp[] = [];
  const updated = [...records]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((record) => {
      if (record.transactionId !== null) return record;
      const match = transactions.find((transaction) => {
        const purchasedAt = Date.parse(transaction.purchaseDate);
        return (
          transaction.productIdentifier === record.productId &&
          !claimed.has(transaction.transactionIdentifier) &&
          !record.knownTransactionIds.includes(transaction.transactionIdentifier) &&
          (Number.isNaN(purchasedAt) ||
            purchasedAt >= record.createdAt - PURCHASE_DATE_TOLERANCE_MS)
        );
      });
      if (!match) return record;
      claimed.add(match.transactionIdentifier);
      const done = { ...record, transactionId: match.transactionIdentifier };
      completed.push(done);
      return done;
    });
  return { records: updated, completed };
}

// Serializes read-modify-write cycles; the purchase flow and the RevenueCat
// listener can both update the list.
let queue: Promise<unknown> = Promise.resolve();

export function updateFollowUps<T>(
  change: (records: DonationFollowUp[]) => { records: DonationFollowUp[]; result: T },
  now: () => number = Date.now,
): Promise<T> {
  const run = queue.then(async () => {
    let stored: unknown = [];
    try {
      const raw = await kvStorage.getItem(DONATION_FOLLOW_UPS_KEY);
      stored = raw ? JSON.parse(raw) : [];
    } catch {
      stored = [];
    }
    const { records, result } = change(pruneFollowUps(stored, now()));
    const kept = pruneFollowUps(records, now());
    if (kept.length === 0) await kvStorage.removeItem(DONATION_FOLLOW_UPS_KEY);
    else await kvStorage.setItem(DONATION_FOLLOW_UPS_KEY, JSON.stringify(kept));
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function readFollowUps(): Promise<DonationFollowUp[]> {
  return updateFollowUps((records) => ({ records, result: records }));
}
