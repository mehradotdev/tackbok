import { DurableObject } from 'cloudflare:workers';
import { handleDonorNote } from './donor-note';
import { claimNote, confirmNote, releaseNote, type LedgerClaim } from './ledger';
import { rateLimitKey } from './rate-limit-key';

interface Env {
  ASSETS: Fetcher;
  DONOR_NOTE_LEDGER: DurableObjectNamespace<DonorNoteLedger>;
  DONOR_NOTE_RATE_LIMITER?: RateLimit;
  RESEND_API_KEY?: string;
  REVENUECAT_SECRET_KEY?: string;
  REVENUECAT_PROJECT_ID?: string;
  DONOR_NOTE_FROM?: string;
  DONOR_NOTE_ALLOW_SANDBOX?: string;
}

/**
 * One global instance serializes every claim, so two requests for the same
 * purchase can't both pass the duplicate check. Donor-note traffic is tiny.
 */
export class DonorNoteLedger extends DurableObject<Env> {
  claim(
    purchaseIds: string[],
    appUserId: string,
    noteId: string | null,
  ): Promise<LedgerClaim> {
    return claimNote(this.ctx.storage, purchaseIds, appUserId, noteId, Date.now());
  }

  confirm(purchaseId: string): Promise<void> {
    return confirmNote(this.ctx.storage, purchaseId);
  }

  release(purchaseId: string, appUserId: string, noteId: string | null): Promise<void> {
    return releaseNote(this.ctx.storage, purchaseId, appUserId, noteId);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    // wrangler.toml runs this Worker only for /api/*; everything else is served
    // from static assets without invoking it.
    const { pathname } = new URL(request.url);
    if (pathname !== '/api/donor-note') {
      return new Response('Not found', { status: 404 });
    }

    const ledger = env.DONOR_NOTE_LEDGER.get(env.DONOR_NOTE_LEDGER.idFromName('global'));
    const clientKey = rateLimitKey(request.headers.get('CF-Connecting-IP'));
    return handleDonorNote(request, {
      fetcher: fetch.bind(globalThis),
      ledger: {
        claim: (purchaseIds, appUserId, noteId) =>
          ledger.claim([...purchaseIds], appUserId, noteId),
        confirm: (purchaseId) => ledger.confirm(purchaseId),
        release: (purchaseId, appUserId, noteId) =>
          ledger.release(purchaseId, appUserId, noteId),
      },
      allowRequest: async () =>
        env.DONOR_NOTE_RATE_LIMITER
          ? (await env.DONOR_NOTE_RATE_LIMITER.limit({ key: clientKey })).success
          : true,
      env,
      now: Date.now,
      // Outcome codes only: never the message, email, or IDs.
      log: (outcome) => console.log(`donor-note ${outcome}`),
    });
  },
} satisfies ExportedHandler<Env>;
