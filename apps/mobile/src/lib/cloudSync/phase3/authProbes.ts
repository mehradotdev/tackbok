import { CloudAuthError } from '../auth';
import { clearGoogleAccessToken, readGoogleTokens } from '../auth/secureTokenStore';
import { ProviderError } from '../providers/types';
import type { ProbeEnvironment } from './probeEnvironment';
import { observeGlobalFetch } from './probeContext';
import { deterministicBytes } from './probeFiles';
import { runProbeGroup, type ProbeGroupResult } from './probeReport';

function errorCategory(error: unknown): string {
  if (error instanceof ProviderError) return `provider:${error.category}`;
  if (error instanceof CloudAuthError) return `auth:${error.code}`;
  return 'unknown';
}

/**
 * Failures that mean "this grant no longer exists". A revoked grant must
 * surface as one of these; a `not-found`, `transient` or `quota` failure means
 * the probe hit something else entirely and proves nothing about revocation.
 * `auth:cancelled` is excluded on purpose — that is the operator dismissing a
 * dialog, not Google refusing the credential.
 */
const REVOKED_GRANT_CATEGORIES = new Set([
  'provider:auth',
  'auth:refresh-failed',
  'auth:consent-required',
  'auth:not-connected',
]);

export function isRevokedGrantFailure(category: string): boolean {
  return REVOKED_GRANT_CATEGORIES.has(category);
}

/**
 * Gate E2E leg: the access token expires and is renewed without sending the
 * operator back through consent. Expiry is forced by clearing the cached access
 * token while leaving the refresh credential in place, which is the exact state
 * the app wakes up in after an idle interval.
 */
export function runSilentRefreshGroup(env: ProbeEnvironment): Promise<ProbeGroupResult> {
  return runProbeGroup('silent-refresh', 'Silent token renewal after expiry', async (steps) => {
    await steps.step('refresh.forced-expiry', 'Renew without interactive consent', async () => {
      const before = await readGoogleTokens();
      await clearGoogleAccessToken();
      const cleared = await readGoogleTokens();

      const connection = await env.provider.refreshConnection();
      const after = await readGoogleTokens();

      // A stored future expiry is not part of "renewed": Android deliberately
      // stores 0 (Play services is the cache of record and every use
      // revalidates), and the next step's Drive write is the real proof the
      // token works. Requiring a future expiry here would fail the honest
      // platform and pass the one that fabricates.
      const renewed = after !== null && after.accessToken.length > 0;
      return {
        status: renewed ? ('passed' as const) : ('failed' as const),
        detail: renewed
          ? 'A cleared access token was renewed non-interactively and the account label survived.'
          : 'No usable access token was present after the renewal attempt.',
        facts: {
          hadRefreshCredentialBefore: Boolean(before?.refreshToken),
          accessTokenClearedBeforeRenewal: (cleared?.accessToken.length ?? 0) === 0,
          accessTokenRenewed: renewed,
          accountLabelPresent: (connection.accountLabel?.length ?? 0) > 0,
        },
      };
    });

    await steps.step('refresh.drive-call', 'A Drive call succeeds on the renewed token', async () => {
      const key = 'entities/entry/probe-refresh/v1.json';
      const ref = await env.provider.putImmutable(env.vault, key, deterministicBytes(1024, 61));
      return {
        status: ref.contentHash.length === 64 ? ('passed' as const) : ('failed' as const),
        detail: 'An authorized Drive write completed after the silent renewal.',
        facts: { wroteObject: true },
      };
    });
  });
}

/**
 * Gate E2E leg: authorization revoked outside the app. The operator revokes at
 * myaccount.google.com, the app must fail cleanly rather than loop or silently
 * lose data, and reconnecting must restore service.
 */
export function runExternalRevocationGroup(
  env: ProbeEnvironment,
  stage: 'observe-failure' | 'recover',
): Promise<ProbeGroupResult> {
  return runProbeGroup(
    'external-revocation',
    'External authorization failure and recovery',
    async (steps) => {
      if (stage === 'observe-failure') {
        await steps.step('external.failure', 'A revoked grant fails cleanly', async () => {
          // Force the adapter onto the refresh path so it meets the revoked
          // grant instead of reusing a still-valid cached access token.
          await clearGoogleAccessToken();
          try {
            // A listing, not a write: it exercises the same refresh-then-call
            // path but needs no vault to exist, so the result cannot be
            // confused with a missing-parent failure.
            const vaults = await env.provider.listVaults();
            return {
              status: 'failed' as const,
              detail:
                'An authorized Drive call succeeded, so access was not actually revoked. Revoke in Google account settings and run this group again.',
              facts: { failed: false, vaultsListed: vaults.length },
            };
          } catch (error) {
            const category = errorCategory(error);
            const tokens = await readGoogleTokens();
            // Any thrown error used to count as a pass, which would have let an
            // unrelated failure masquerade as evidence of revocation handling.
            const revoked = isRevokedGrantFailure(category);
            return {
              status: revoked ? ('passed' as const) : ('inconclusive' as const),
              detail: revoked
                ? `The revoked grant surfaced as ${category} rather than an unbounded retry.`
                : `The write failed as ${category}, which is not an authorization failure, so this says nothing about revocation.`,
              facts: {
                failed: true,
                category,
                authorizationFailure: revoked,
                credentialsRetainedForRetry: tokens !== null,
              },
            };
          }
        });

        steps.record({
          id: 'external.recover-next',
          title: 'Reconnect after revocation',
          status: 'awaiting-operator',
          detail: 'Run the recovery stage once the failure above is recorded.',
          facts: {},
          operatorPrompt:
            'Tap "Recover" to run interactive consent again and confirm the app returns to a working state.',
        });
        return;
      }

      await steps.step('external.recovery', 'Reconnecting restores Drive access', async () => {
        const connection = await env.provider.connect();
        const ref = await env.provider.putImmutable(
          env.vault,
          'entities/entry/probe-recovered/v1.json',
          deterministicBytes(1024, 72),
        );
        return {
          status: ref.contentHash.length === 64 ? ('passed' as const) : ('failed' as const),
          detail: 'Interactive consent restored authorization and Drive writes resumed.',
          facts: {
            accountLabelPresent: (connection.accountLabel?.length ?? 0) > 0,
            wroteObjectAfterRecovery: true,
          },
        };
      });
    },
  );
}

/**
 * Gate E2E leg: per-device Disconnect. It must clear local credentials and must
 * never revoke the grant for the whole Google account, because a second device
 * signed into the same account keeps syncing.
 */
export function runDisconnectGroup(env: ProbeEnvironment): Promise<ProbeGroupResult> {
  return runProbeGroup('disconnect', 'Local disconnect', async (steps) => {
    const disconnect = await steps.step(
      'disconnect.local-only',
      'Disconnect issues no global revocation request',
      async () => {
        const { observed } = await observeGlobalFetch(async () => {
          await env.provider.disconnect();
        });
        const tokens = await readGoogleTokens();
        return {
          status:
            observed.globalRevocationRequests === 0 && tokens === null
              ? ('passed' as const)
              : ('failed' as const),
          detail:
            observed.globalRevocationRequests === 0
              ? 'Local credentials were cleared and no JavaScript request reached a Google revocation endpoint.'
              : 'Disconnect reached a global revocation endpoint.',
          facts: {
            globalRevocationRequests: observed.globalRevocationRequests,
            endpointsContacted: observed.urls.length,
            secureStoreCleared: tokens === null,
          },
        };
      },
    );

    await steps.step('disconnect.no-access', 'Drive calls fail after disconnect', async () => {
      try {
        await env.provider.putImmutable(
          env.vault,
          'entities/entry/probe-after-disconnect/v1.json',
          deterministicBytes(1024, 81),
        );
        return {
          status: 'failed' as const,
          detail: 'A Drive write succeeded after disconnect.',
          facts: { writeRejected: false },
        };
      } catch (error) {
        return {
          status: 'passed' as const,
          detail: 'Drive access is unavailable until the operator reconnects.',
          facts: { writeRejected: true, category: errorCategory(error) },
        };
      }
    });

    steps.record({
      id: 'disconnect.grant-survives',
      title: 'The account-level grant survives',
      status: disconnect.status === 'passed' ? 'awaiting-operator' : 'skipped',
      detail:
        'JavaScript issued no revocation request, but the native sign-out path is outside this observation. Confirm on the account itself.',
      facts: {},
      operatorPrompt:
        'Open myaccount.google.com → Security → Your connections to third-party apps and confirm Tackbok is still listed. If it is gone, Disconnect revoked the whole account grant and this step fails.',
    });
  });
}
