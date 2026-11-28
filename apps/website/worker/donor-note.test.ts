import { describe, expect, it } from 'bun:test';
import {
  handleDonorNote,
  MAX_MESSAGE_LENGTH,
  MAX_PURCHASE_AGE_MS,
  NOTE_RECIPIENT,
  candidatePurchases,
  validateDonorNoteRequest,
  type DonorNoteDeps,
  type RevenueCatPurchase,
} from './donor-note';
import {
  CLAIM_TIMEOUT_MS,
  claimNote,
  confirmNote,
  MAX_NOTES_PER_USER,
  releaseNote,
  type LedgerStorage,
} from './ledger';
import { rateLimitKey } from './rate-limit-key';

const NOW = Date.UTC(2026, 10, 28);
const APP_USER_ID = '$RCAnonymousID:0123456789abcdef0123456789abcdef';

function purchase(overrides: Partial<RevenueCatPurchase> = {}): RevenueCatPurchase {
  return {
    id: 'purch_1',
    product_id: 'prod_1',
    purchased_at: NOW - 60_000,
    status: 'owned',
    environment: 'production',
    store: 'app_store',
    store_purchase_identifier: '2000000123',
    ...overrides,
  };
}

function memoryStorage(): LedgerStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async <T>(key: string) => data.get(key) as T | undefined,
    put: async (entries: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(entries)) {
        data.set(key, structuredClone(value));
      }
    },
    delete: async (key: string) => data.delete(key),
  };
}

describe('validateDonorNoteRequest', () => {
  it('accepts a note and trims it', () => {
    const result = validateDonorNoteRequest({
      appUserId: APP_USER_ID,
      transactionId: 'GPA.1234-5678-9012-34567',
      message: '  Thanks!\r\nLove it  ',
      email: ' me@example.org ',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        appUserId: APP_USER_ID,
        transactionId: 'GPA.1234-5678-9012-34567',
        noteId: null,
        message: 'Thanks!\nLove it',
        email: 'me@example.org',
      },
    });
  });

  it('strips control characters from the message', () => {
    const result = validateDonorNoteRequest({
      appUserId: APP_USER_ID,
      message: 'a\u0000b\u001bc\td',
    });
    expect(result.ok && result.value.message).toBe('abc\td');
  });

  it.each([
    [{}, 'invalid_app_user_id'],
    [{ appUserId: 'bad id with spaces', message: 'x' }, 'invalid_app_user_id'],
    [{ appUserId: '.', message: 'x' }, 'invalid_app_user_id'],
    [{ appUserId: '..', message: 'x' }, 'invalid_app_user_id'],
    [
      { appUserId: APP_USER_ID, transactionId: 'a/b', message: 'x' },
      'invalid_transaction_id',
    ],
    [{ appUserId: APP_USER_ID, message: 42 }, 'invalid_note'],
    [{ appUserId: APP_USER_ID, noteId: 'a/b', message: 'x' }, 'invalid_note_id'],
    [{ appUserId: APP_USER_ID, message: '  ', email: '' }, 'empty_note'],
    [
      { appUserId: APP_USER_ID, message: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) },
      'message_too_long',
    ],
    [{ appUserId: APP_USER_ID, email: 'not-an-email' }, 'invalid_email'],
    [{ appUserId: APP_USER_ID, email: 'a@b.c\r\nBcc: x@y.z' }, 'invalid_email'],
    [{ appUserId: APP_USER_ID, email: 'a@localhost' }, 'invalid_email'],
    [{ appUserId: APP_USER_ID, email: 'Name <a@b.co>' }, 'invalid_email'],
  ])('rejects %j with %s', (input, error) => {
    expect(validateDonorNoteRequest(input)).toEqual({ ok: false, error });
  });

  it('rejects non-object bodies', () => {
    expect(validateDonorNoteRequest(null)).toEqual({ ok: false, error: 'invalid_body' });
    expect(validateDonorNoteRequest([1])).toEqual({ ok: false, error: 'invalid_body' });
  });
});

describe('candidatePurchases', () => {
  it('prefers the purchase matching the transaction ID', () => {
    const newer = purchase({ id: 'newer', purchased_at: NOW - 1_000 });
    const matching = purchase({ id: 'match', store_purchase_identifier: 'tx-9' });
    expect(
      candidatePurchases([newer, matching], 'tx-9', NOW, false).map((p) => p.id),
    ).toEqual(['match']);
  });

  it('matches numeric store identifiers', () => {
    const matching = purchase({ id: 'match', store_purchase_identifier: 2000000999 });
    expect(candidatePurchases([matching], '2000000999', NOW, false)[0]?.id).toBe('match');
  });

  it('falls back to every qualifying purchase, newest first', () => {
    const older = purchase({ id: 'older', purchased_at: NOW - 10_000 });
    const newer = purchase({ id: 'newer', purchased_at: NOW - 1_000 });
    expect(
      candidatePurchases([older, newer], 'unknown', NOW, false).map((p) => p.id),
    ).toEqual(['newer', 'older']);
  });

  it.each([
    ['refunded', { status: 'refunded' }],
    ['sandbox', { environment: 'sandbox' }],
    ['Test Store', { store: 'test_store' }],
    ['promotional', { store: 'promotional' }],
    ['too old', { purchased_at: NOW - MAX_PURCHASE_AGE_MS - 1 }],
  ])('ignores %s purchases', (_label, overrides) => {
    expect(candidatePurchases([purchase(overrides)], null, NOW, false)).toEqual([]);
  });

  it('allows sandbox purchases only when enabled', () => {
    const sandbox = purchase({ environment: 'sandbox', store: 'test_store' });
    expect(candidatePurchases([sandbox], null, NOW, true)[0]?.id).toBe('purch_1');
  });
});

describe('ledger', () => {
  const claimed = (purchaseId: string) => ({ status: 'claimed', purchaseId });

  it('allows one note per purchase', async () => {
    const storage = memoryStorage();
    expect(await claimNote(storage, ['p1'], 'u1', null, NOW)).toEqual(claimed('p1'));
    await confirmNote(storage, 'p1');
    expect(await claimNote(storage, ['p1'], 'u1', null, NOW)).toEqual({
      status: 'duplicate',
    });
    expect(await claimNote(storage, ['p1'], 'u2', null, NOW)).toEqual({
      status: 'duplicate',
    });
  });

  it('claims the first purchase without a note', async () => {
    const storage = memoryStorage();
    await claimNote(storage, ['p2'], 'u1', null, NOW);
    await confirmNote(storage, 'p2');
    expect(await claimNote(storage, ['p2', 'p1'], 'u1', null, NOW)).toEqual(
      claimed('p1'),
    );
  });

  it('reports an unconfirmed claim as in progress until it times out', async () => {
    const storage = memoryStorage();
    await claimNote(storage, ['p1'], 'u1', null, NOW);
    expect(await claimNote(storage, ['p1'], 'u1', null, NOW + 1)).toEqual({
      status: 'in_progress',
    });
    const later = NOW + CLAIM_TIMEOUT_MS;
    expect(await claimNote(storage, ['p1'], 'u1', null, later)).toEqual(claimed('p1'));
    // The stale claim's slot is reused, not counted twice.
    expect(storage.data.get('user:u1')).toEqual([later]);
  });

  it('caps notes per user within the window', async () => {
    const storage = memoryStorage();
    for (let i = 0; i < MAX_NOTES_PER_USER; i++) {
      expect(await claimNote(storage, [`p${i}`], 'u1', null, NOW + i)).toEqual(
        claimed(`p${i}`),
      );
    }
    expect(await claimNote(storage, ['px'], 'u1', null, NOW + 10)).toEqual({
      status: 'user_limit',
    });
    expect(await claimNote(storage, ['py'], 'u2', null, NOW + 10)).toEqual(claimed('py'));
    const later = NOW + 31 * 24 * 60 * 60 * 1000;
    expect(await claimNote(storage, ['pz'], 'u1', null, later)).toEqual(claimed('pz'));
  });

  it('releases a claim so the note can be retried', async () => {
    const storage = memoryStorage();
    await claimNote(storage, ['p1'], 'u1', null, NOW);
    await releaseNote(storage, 'p1', 'u1', null);
    expect(storage.data.has('user:u1')).toBe(false);
    expect(await claimNote(storage, ['p1'], 'u1', null, NOW)).toEqual(claimed('p1'));
  });

  it('releases only one of two claims made at the same moment', async () => {
    const storage = memoryStorage();
    await claimNote(storage, ['p1'], 'u1', null, NOW);
    await claimNote(storage, ['p2'], 'u1', null, NOW);
    await releaseNote(storage, 'p1', 'u1', null);
    expect(storage.data.get('user:u1')).toEqual([NOW]);
  });

  it('never releases a sent note', async () => {
    const storage = memoryStorage();
    await claimNote(storage, ['p1'], 'u1', null, NOW);
    await confirmNote(storage, 'p1');
    await releaseNote(storage, 'p1', 'u1', null);
    expect(await claimNote(storage, ['p1'], 'u1', null, NOW)).toEqual({
      status: 'duplicate',
    });
  });
});

describe('rateLimitKey', () => {
  it.each([
    [null, 'unknown'],
    ['203.0.113.7', '203.0.113.7'],
    ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
    ['2001:0db8:0001:0002::1', '2001:db8:1:2::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
  ])('keys %s as %s', (ip, key) => {
    expect(rateLimitKey(ip)).toBe(key);
  });
});

describe('handleDonorNote', () => {
  type Call = { url: string; init?: RequestInit };

  function setup(
    options: {
      purchases?: RevenueCatPurchase[];
      revenueCatStatus?: number;
      resendStatus?: number;
      allow?: boolean;
      env?: Partial<DonorNoteDeps['env']>;
    } = {},
  ) {
    const calls: Call[] = [];
    const logs: string[] = [];
    const storage = memoryStorage();
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.startsWith('https://api.revenuecat.com/')) {
        return new Response(
          JSON.stringify({ object: 'list', items: options.purchases ?? [purchase()] }),
          {
            status: options.revenueCatStatus ?? 200,
          },
        );
      }
      return new Response('{}', { status: options.resendStatus ?? 200 });
    }) as typeof fetch;
    const deps: DonorNoteDeps = {
      fetcher,
      ledger: {
        claim: (purchaseIds, appUserId, noteId) =>
          claimNote(storage, purchaseIds, appUserId, noteId, NOW),
        confirm: (purchaseId) => confirmNote(storage, purchaseId),
        release: (purchaseId, appUserId, noteId) =>
          releaseNote(storage, purchaseId, appUserId, noteId),
      },
      allowRequest: async () => options.allow ?? true,
      env: {
        RESEND_API_KEY: 're_test',
        REVENUECAT_SECRET_KEY: 'sk_test',
        REVENUECAT_PROJECT_ID: 'proj123',
        DONOR_NOTE_FROM: 'Tackbok <donor-notes@tackbok.org>',
        ...options.env,
      },
      now: () => NOW,
      log: (outcome) => logs.push(outcome),
    };
    return { calls, logs, deps, storage };
  }

  function post(body: unknown, headers: Record<string, string> = {}) {
    return new Request('https://tackbok.org/api/donor-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  const note = {
    appUserId: APP_USER_ID,
    transactionId: '2000000123',
    message: 'Thank you for Tackbok',
    email: 'donor@example.org',
  };

  it('verifies the purchase and sends the note once', async () => {
    const { calls, logs, deps } = setup();
    const response = await handleDonorNote(post(note), deps);
    expect(response.status).toBe(202);

    expect(calls[0]?.url).toBe(
      'https://api.revenuecat.com/v2/projects/proj123/customers/' +
        '%24RCAnonymousID%3A0123456789abcdef0123456789abcdef/purchases?limit=100',
    );
    expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBe(
      'Bearer sk_test',
    );

    const resend = calls[1];
    expect(resend?.url).toBe('https://api.resend.com/emails');
    const headers = new Headers(resend?.init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer re_test');
    expect(headers.get('Idempotency-Key')).toBe('donor-note-purch_1');
    const email = JSON.parse(String(resend?.init?.body));
    expect(email.to).toEqual([NOTE_RECIPIENT]);
    expect(email.reply_to).toBe('donor@example.org');
    expect(email.text).toContain('Thank you for Tackbok');
    expect(email.html).toBeUndefined();

    const again = await handleDonorNote(post(note), deps);
    expect(again.status).toBe(409);
    expect(calls).toHaveLength(3);
    // Logs carry outcome codes only.
    expect(logs).toEqual(['sent', 'duplicate']);
    expect(logs.join(' ')).not.toContain('donor@example.org');
  });

  it('omits reply-to when no email is given', async () => {
    const { calls, deps } = setup();
    await handleDonorNote(post({ ...note, email: '' }), deps);
    const email = JSON.parse(String(calls[1]?.init?.body));
    expect(email.reply_to).toBeUndefined();
  });

  it('asks the app to retry while the purchase is not listed yet', async () => {
    const older = purchase({
      environment: 'sandbox',
      store_purchase_identifier: 'tx-old',
    });
    const { calls, deps } = setup({ purchases: [older] });
    const response = await handleDonorNote(post(note), deps);
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(1);
  });

  it('tells the app to stop retrying a known purchase that can never qualify', async () => {
    const { calls, deps } = setup({ purchases: [purchase({ store: 'test_store' })] });
    expect((await handleDonorNote(post(note), deps)).status).toBe(422);
    expect(calls).toHaveLength(1);
  });

  it('rejects unknown customers without sending', async () => {
    const { calls, deps } = setup({ revenueCatStatus: 404 });
    expect((await handleDonorNote(post(note), deps)).status).toBe(403);
    expect(calls).toHaveLength(1);
  });

  it('asks the app to retry when RevenueCat is unavailable', async () => {
    const { deps } = setup({ revenueCatStatus: 500 });
    expect((await handleDonorNote(post(note), deps)).status).toBe(503);
  });

  it('releases the claim when the email fails, so a retry can succeed', async () => {
    const first = setup({ resendStatus: 500 });
    expect((await handleDonorNote(post(note), first.deps)).status).toBe(502);
    expect(first.storage.data.has('purchase:purch_1')).toBe(false);
  });

  it('sends a second note for an older purchase without one', async () => {
    const older = purchase({ id: 'older', purchased_at: NOW - 10_000 });
    const newer = purchase({ id: 'newer', purchased_at: NOW - 1_000 });
    const { calls, deps } = setup({ purchases: [older, newer] });
    const unmatched = { ...note, transactionId: 'GPA.0000' };
    expect((await handleDonorNote(post(unmatched), deps)).status).toBe(202);
    expect((await handleDonorNote(post(unmatched), deps)).status).toBe(202);
    const keys = calls
      .filter((call) => call.url === 'https://api.resend.com/emails')
      .map((call) => new Headers(call.init?.headers).get('Idempotency-Key'));
    expect(keys).toEqual(['donor-note-newer', 'donor-note-older']);
    expect((await handleDonorNote(post(unmatched), deps)).status).toBe(409);
  });

  it('keeps a retried note on the purchase it was first sent with', async () => {
    const older = purchase({ id: 'older', purchased_at: NOW - 10_000 });
    const newer = purchase({ id: 'newer', purchased_at: NOW - 1_000 });
    const { calls, deps } = setup({ purchases: [older, newer] });
    const retried = { ...note, transactionId: 'GPA.0000', noteId: 'note-0001' };
    expect((await handleDonorNote(post(retried), deps)).status).toBe(202);
    expect((await handleDonorNote(post(retried), deps)).status).toBe(409);
    const emails = calls.filter((call) => call.url === 'https://api.resend.com/emails');
    expect(emails).toHaveLength(1);
  });

  it('asks the app to retry while another request is sending the note', async () => {
    const { deps, storage } = setup();
    await claimNote(storage, ['purch_1'], APP_USER_ID, null, NOW);
    expect((await handleDonorNote(post(note), deps)).status).toBe(503);
  });

  it('asks the app to retry when the user is over the note cap', async () => {
    const { deps, storage } = setup();
    for (let i = 0; i < MAX_NOTES_PER_USER; i++) {
      await claimNote(storage, [`other${i}`], APP_USER_ID, null, NOW);
    }
    expect((await handleDonorNote(post(note), deps)).status).toBe(429);
  });

  it('rate-limits before calling RevenueCat', async () => {
    const { calls, deps } = setup({ allow: false });
    expect((await handleDonorNote(post(note), deps)).status).toBe(429);
    expect(calls).toHaveLength(0);
  });

  it('rejects other methods, content types, bad JSON and large bodies', async () => {
    const { calls, deps } = setup();
    const get = new Request('https://tackbok.org/api/donor-note');
    expect((await handleDonorNote(get, deps)).status).toBe(405);
    expect(
      (await handleDonorNote(post(note, { 'Content-Type': 'text/plain' }), deps)).status,
    ).toBe(415);
    expect((await handleDonorNote(post('{'), deps)).status).toBe(400);
    const big = { ...note, message: 'x'.repeat(9000) };
    expect((await handleDonorNote(post(big), deps)).status).toBe(413);
    const chunked = new Request('https://tackbok.org/api/donor-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: new ReadableStream({
        start(controller) {
          for (let i = 0; i < 20; i++) controller.enqueue(new Uint8Array(1024));
          controller.close();
        },
      }),
    });
    expect((await handleDonorNote(chunked, deps)).status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it('refuses to run without its secrets', async () => {
    const { calls, deps } = setup({ env: { RESEND_API_KEY: undefined } });
    expect((await handleDonorNote(post(note), deps)).status).toBe(503);
    expect(calls).toHaveLength(0);
  });
});
