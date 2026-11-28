import {
  DONATION_FOLLOW_UP_MAX_AGE_MS,
  matchCompletedDonations,
  pruneFollowUps,
  type DonationFollowUp,
} from './donation-follow-ups';

jest.mock('~/lib/kvStorage', () => ({ kvStorage: {} }));

const NOW = Date.parse('2026-12-01T12:00:00Z');
const PRODUCT = 'dev.mehra.tackbok.support.small.v2';

function record(overrides: Partial<DonationFollowUp> = {}): DonationFollowUp {
  return {
    id: 'r1',
    tierId: 'small',
    productId: PRODUCT,
    createdAt: NOW - 60_000,
    transactionId: null,
    knownTransactionIds: [],
    note: { message: 'hi', email: '' },
    ...overrides,
  };
}

function transaction(id: string, purchaseDate = NOW, productIdentifier = PRODUCT) {
  return {
    transactionIdentifier: id,
    productIdentifier,
    purchaseDate: new Date(purchaseDate).toISOString(),
  };
}

describe('pruneFollowUps', () => {
  test('drops malformed, expired and finished records', () => {
    const kept = record({ id: 'kept' });
    const pendingAnonymous = record({ id: 'pending-anon', note: null });
    expect(
      pruneFollowUps(
        [
          kept,
          pendingAnonymous,
          record({ id: 'old', createdAt: NOW - DONATION_FOLLOW_UP_MAX_AGE_MS }),
          record({ id: 'done', transactionId: 'tx', note: null }),
          { id: 'broken' },
          null,
        ],
        NOW,
      ),
    ).toEqual([kept, pendingAnonymous]);
  });

  test('ignores a value that is not a list', () => {
    expect(pruneFollowUps({ records: [] }, NOW)).toEqual([]);
  });
});

describe('matchCompletedDonations', () => {
  test('completes a pending donation with a new transaction for its product', () => {
    const result = matchCompletedDonations(
      [record({ knownTransactionIds: ['tx-old'] })],
      [
        transaction('tx-old'),
        transaction('tx-other', NOW, 'other.product'),
        transaction('tx-new'),
      ],
    );
    expect(result.completed).toEqual([
      expect.objectContaining({ transactionId: 'tx-new' }),
    ]);
    expect(result.records[0].transactionId).toBe('tx-new');
  });

  test('ignores transactions from before the purchase started', () => {
    const result = matchCompletedDonations(
      [record()],
      [transaction('tx-early', NOW - 60 * 60 * 1000)],
    );
    expect(result.completed).toEqual([]);
  });

  test('never gives one transaction to two donations', () => {
    const result = matchCompletedDonations(
      [
        record({ id: 'second', createdAt: NOW - 30_000 }),
        record({ id: 'first', createdAt: NOW - 60_000 }),
        record({ id: 'done', transactionId: 'tx-a' }),
      ],
      [transaction('tx-a'), transaction('tx-b')],
    );
    expect(result.completed.map((item) => [item.id, item.transactionId])).toEqual([
      ['first', 'tx-b'],
    ]);
  });
});
