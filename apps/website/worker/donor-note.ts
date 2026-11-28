import type { LedgerClaim } from './ledger';

/**
 * POST /api/donor-note: forwards an optional note from a donor to the developer.
 *
 * Every note must belong to a real, completed one-time purchase: the app user
 * ID is checked against RevenueCat's REST API before anything is sent. Each
 * purchase can carry one note, and each app user only a few. Messages and email
 * addresses are never logged; only outcome codes are.
 */

export const NOTE_RECIPIENT = 'anurag@mehra.dev';
export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_BODY_BYTES = 8 * 1024;
/** A pending payment may take up to 30 days; allow some slack after that. */
export const MAX_PURCHASE_AGE_MS = 45 * 24 * 60 * 60 * 1000;

// At least one letter or digit, so "." and ".." can't change the lookup path.
const APP_USER_ID_PATTERN = /^(?=.*[A-Za-z0-9])[A-Za-z0-9$:._-]{1,200}$/;
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,255}$/;
const NOTE_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
// Deliberately light: one @, no whitespace, a dot in the domain, and none of the
// characters that could break an address header.
const EMAIL_PATTERN =
  /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\.]+(?:\.[^\s@<>()[\]",;:\\.]+)+$/;
// Control characters other than tab and newline.
// eslint-disable-next-line no-control-regex -- stripping them is the point
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

export type DonorNoteRequest = {
  appUserId: string;
  transactionId: string | null;
  /** Random per note, so a retried note is recognised. Older apps omit it. */
  noteId: string | null;
  message: string;
  email: string;
};

export type ValidationResult =
  | { ok: true; value: DonorNoteRequest }
  | { ok: false; error: string };

export function validateDonorNoteRequest(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'invalid_body' };
  }
  const body = input as Record<string, unknown>;

  const { appUserId, transactionId, noteId, message = '', email = '' } = body;
  if (typeof appUserId !== 'string' || !APP_USER_ID_PATTERN.test(appUserId)) {
    return { ok: false, error: 'invalid_app_user_id' };
  }
  if (
    transactionId != null &&
    (typeof transactionId !== 'string' || !TRANSACTION_ID_PATTERN.test(transactionId))
  ) {
    return { ok: false, error: 'invalid_transaction_id' };
  }
  if (noteId != null && (typeof noteId !== 'string' || !NOTE_ID_PATTERN.test(noteId))) {
    return { ok: false, error: 'invalid_note_id' };
  }
  if (typeof message !== 'string' || typeof email !== 'string') {
    return { ok: false, error: 'invalid_note' };
  }

  const cleanMessage = message
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARACTERS, '')
    .trim();
  const cleanEmail = email.trim();
  if (cleanMessage.length > MAX_MESSAGE_LENGTH)
    return { ok: false, error: 'message_too_long' };
  if (
    cleanEmail &&
    (cleanEmail.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(cleanEmail))
  ) {
    return { ok: false, error: 'invalid_email' };
  }
  if (!cleanMessage && !cleanEmail) return { ok: false, error: 'empty_note' };

  return {
    ok: true,
    value: {
      appUserId,
      transactionId: transactionId ?? null,
      noteId: noteId ?? null,
      message: cleanMessage,
      email: cleanEmail,
    },
  };
}

/** The fields this Worker reads from RevenueCat's v2 Purchase object. */
export type RevenueCatPurchase = {
  id: string;
  product_id: string;
  purchased_at: number;
  status: string;
  environment: string;
  store: string;
  store_purchase_identifier: string | number;
};

/**
 * Lists the purchases a note may belong to, best first: just the one matching
 * the app's transaction ID if there is one, otherwise every qualifying purchase,
 * newest first (the ledger claims the first one without a note). Only owned,
 * recent, real-money purchases qualify (no sandbox, Test Store or promotional
 * grants unless `allowSandbox` is set for local development).
 */
export function candidatePurchases(
  purchases: readonly RevenueCatPurchase[],
  transactionId: string | null,
  now: number,
  allowSandbox: boolean,
): RevenueCatPurchase[] {
  const qualifying = purchases.filter(
    (purchase) =>
      purchase.status === 'owned' &&
      now - purchase.purchased_at <= MAX_PURCHASE_AGE_MS &&
      (allowSandbox ||
        (purchase.environment === 'production' &&
          purchase.store !== 'test_store' &&
          purchase.store !== 'promotional')),
  );
  if (transactionId) {
    const match = qualifying.find(
      (purchase) =>
        String(purchase.store_purchase_identifier) === transactionId ||
        purchase.id === transactionId,
    );
    if (match) return [match];
  }
  // The store's transaction identifier is not always the one RevenueCat stores
  // (for example, Play order IDs). Fall back to the newest purchase that has no
  // note yet; the ledger still allows only one note per purchase.
  return qualifying.toSorted((a, b) => b.purchased_at - a.purchased_at);
}

export type PurchaseLookup =
  | { ok: true; purchases: RevenueCatPurchase[] }
  | { ok: false; reason: 'not_found' | 'unavailable' };

export async function fetchPurchases(
  fetcher: typeof fetch,
  projectId: string,
  secretKey: string,
  appUserId: string,
): Promise<PurchaseLookup> {
  const url =
    `https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}` +
    `/customers/${encodeURIComponent(appUserId)}/purchases?limit=100`;
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' },
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (response.status === 404) return { ok: false, reason: 'not_found' };
  if (!response.ok) return { ok: false, reason: 'unavailable' };

  const body = (await response.json().catch(() => null)) as { items?: unknown } | null;
  if (!body || !Array.isArray(body.items)) return { ok: false, reason: 'unavailable' };
  const purchases = body.items.filter(
    (item): item is RevenueCatPurchase =>
      !!item &&
      typeof item === 'object' &&
      typeof (item as RevenueCatPurchase).id === 'string' &&
      typeof (item as RevenueCatPurchase).purchased_at === 'number' &&
      typeof (item as RevenueCatPurchase).status === 'string' &&
      typeof (item as RevenueCatPurchase).environment === 'string' &&
      typeof (item as RevenueCatPurchase).store === 'string',
  );
  return { ok: true, purchases };
}

export function buildEmail(
  note: DonorNoteRequest,
  purchase: RevenueCatPurchase,
  from: string,
) {
  const lines = [
    'Someone left a note with their Tackbok donation.',
    '',
    'Message:',
    note.message || '(no message)',
    '',
    note.email
      ? `Email: ${note.email} (replying to this email goes to them)`
      : 'Email: not given',
    '',
    `Store: ${purchase.store}`,
    `Purchased: ${new Date(purchase.purchased_at).toISOString()}`,
  ];
  return {
    from,
    to: [NOTE_RECIPIENT],
    subject: 'A note from a Tackbok donor',
    text: lines.join('\n'),
    ...(note.email ? { reply_to: note.email } : {}),
  };
}

export async function sendEmail(
  fetcher: typeof fetch,
  apiKey: string,
  email: ReturnType<typeof buildEmail>,
  idempotencyKey: string,
): Promise<boolean> {
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(email),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export interface DonorNoteLedgerApi {
  claim(
    purchaseIds: readonly string[],
    appUserId: string,
    noteId: string | null,
  ): Promise<LedgerClaim>;
  confirm(purchaseId: string): Promise<void>;
  release(purchaseId: string, appUserId: string, noteId: string | null): Promise<void>;
}

export type DonorNoteDeps = {
  fetcher: typeof fetch;
  ledger: DonorNoteLedgerApi;
  /** Returns false when this client is over the request rate limit. */
  allowRequest: () => Promise<boolean>;
  env: {
    RESEND_API_KEY?: string;
    REVENUECAT_SECRET_KEY?: string;
    REVENUECAT_PROJECT_ID?: string;
    DONOR_NOTE_FROM?: string;
    DONOR_NOTE_ALLOW_SANDBOX?: string;
  };
  now: () => number;
  log: (outcome: string) => void;
};

function json(status: number, body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function readBody(request: Request): Promise<unknown | 'too_large' | 'invalid'> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > MAX_BODY_BYTES) return 'too_large';
  // Count bytes as they arrive: a chunked body has no Content-Length.
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return 'too_large';
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return 'invalid';
  }
}

export async function handleDonorNote(
  request: Request,
  deps: DonorNoteDeps,
): Promise<Response> {
  const respond = (status: number, outcome: string) => {
    deps.log(outcome);
    return json(status, status < 300 ? { status: outcome } : { error: outcome });
  };

  if (request.method !== 'POST') {
    deps.log('method_not_allowed');
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  const {
    RESEND_API_KEY,
    REVENUECAT_SECRET_KEY,
    REVENUECAT_PROJECT_ID,
    DONOR_NOTE_FROM,
  } = deps.env;
  if (
    !RESEND_API_KEY ||
    !REVENUECAT_SECRET_KEY ||
    !REVENUECAT_PROJECT_ID ||
    !DONOR_NOTE_FROM
  ) {
    return respond(503, 'not_configured');
  }
  if (
    !(request.headers.get('Content-Type') ?? '')
      .toLowerCase()
      .startsWith('application/json')
  ) {
    return respond(415, 'unsupported_media_type');
  }
  if (!(await deps.allowRequest())) return respond(429, 'rate_limited');

  const body = await readBody(request);
  if (body === 'too_large') return respond(413, 'too_large');
  if (body === 'invalid') return respond(400, 'invalid_json');
  const validation = validateDonorNoteRequest(body);
  if (!validation.ok) return respond(400, validation.error);
  const note = validation.value;

  const lookup = await fetchPurchases(
    deps.fetcher,
    REVENUECAT_PROJECT_ID,
    REVENUECAT_SECRET_KEY,
    note.appUserId,
  );
  if (!lookup.ok) {
    return lookup.reason === 'not_found'
      ? respond(403, 'not_verified')
      : respond(503, 'verification_unavailable');
  }
  const candidates = candidatePurchases(
    lookup.purchases,
    note.transactionId,
    deps.now(),
    deps.env.DONOR_NOTE_ALLOW_SANDBOX === 'true',
  );
  if (!candidates.length) {
    // RevenueCat lists the purchase, but it can never carry a note (refunded,
    // sandbox or Test Store, too old): tell the app to stop retrying.
    const known =
      note.transactionId !== null &&
      lookup.purchases.some(
        (purchase) =>
          String(purchase.store_purchase_identifier) === note.transactionId ||
          purchase.id === note.transactionId,
      );
    return known ? respond(422, 'not_eligible') : respond(403, 'not_verified');
  }

  const claim = await deps.ledger.claim(
    candidates.map((candidate) => candidate.id),
    note.appUserId,
    note.noteId,
  );
  // Only a purchase that already carried a note is final; the app retries the
  // others later.
  if (claim.status !== 'claimed') {
    if (claim.status === 'duplicate') return respond(409, 'duplicate');
    if (claim.status === 'user_limit') return respond(429, 'user_limit');
    return respond(503, 'in_progress');
  }
  const purchase = candidates.find((candidate) => candidate.id === claim.purchaseId);
  if (!purchase) return respond(503, 'in_progress');

  const sent = await sendEmail(
    deps.fetcher,
    RESEND_API_KEY,
    buildEmail(note, purchase, DONOR_NOTE_FROM),
    `donor-note-${purchase.id}`,
  );
  if (!sent) {
    // Let the app try again later rather than losing the note.
    await deps.ledger.release(purchase.id, note.appUserId, note.noteId);
    return respond(502, 'send_failed');
  }
  try {
    await deps.ledger.confirm(purchase.id);
  } catch {
    // The email went out. A retry after the claim times out reuses the same
    // Resend idempotency key, so it can't send a second copy within a day.
    deps.log('confirm_failed');
  }
  return respond(202, 'sent');
}
