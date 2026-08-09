import { createGoogleAuthorization, type CloudAuthorization } from '../auth';
import { readGoogleTokens } from '../auth/secureTokenStore';
import { canonicalBytes } from '../codec';
import {
  GoogleDriveProvider,
  SqliteResumableSessionStore,
  type ResumableSessionStore,
} from '../providers/googleDrive';
import type { VaultRef } from '../providers/types';
import { createInstrumentedDriveFetch, type InstrumentedDriveFetch } from './probeContext';
import { runProbeGroup, type ProbeGroupResult } from './probeReport';
import { isProbeVaultId, newProbeVaultId, PROBE_VAULT_PREFIX } from './probeVaultId';

export {
  CONCURRENT_RUN_GRACE_MS,
  isProbeVaultId,
  isStaleProbeVault,
  newProbeVaultId,
  probeVaultCreatedAt,
  PROBE_VAULT_PREFIX,
} from './probeVaultId';

/**
 * What `fetchGoogleAccountLabel` returns when the userinfo call fails. A probe
 * that cannot tell this apart from a real masked label reports a rejected token
 * as a healthy one.
 */
const PROVIDER_FALLBACK_LABEL = 'Google Drive';

export interface ProbeEnvironment {
  vault: VaultRef;
  auth: CloudAuthorization;
  provider: GoogleDriveProvider;
  instrumented: InstrumentedDriveFetch;
  sessions: ResumableSessionStore;
  /**
   * A provider that shares this environment's authorization, session ledger and
   * request instrumentation but no in-memory state. Probes use it to stand in
   * for a process that died and came back.
   */
  newProvider(options?: { pageSize?: number }): GoogleDriveProvider;
  /** Masked account label, kept out of the written report. */
  accountLabel: string;
}

function vaultMarkerBytes(vaultId: string): Uint8Array {
  return canonicalBytes({ magic: 'tackbok-vault', formatVersion: 1, vaultId });
}

export interface ConnectOptions {
  /** Reuse an existing probe vault instead of creating one. */
  vaultId?: string;
}

/**
 * Interactive connect. This is the one step that cannot be automated: the
 * operator grants `drive.appdata` on the device. Everything after it runs
 * against the disposable probe vault created here.
 */
export async function runConnectGroup(
  options: ConnectOptions = {},
): Promise<{ group: ProbeGroupResult; env: ProbeEnvironment | null }> {
  const vaultId = options.vaultId ?? newProbeVaultId();
  if (!isProbeVaultId(vaultId)) {
    throw new Error(`Refusing to run probes against non-probe vault "${vaultId}"`);
  }

  const auth = createGoogleAuthorization();
  const instrumented = createInstrumentedDriveFetch();
  const sessions = new SqliteResumableSessionStore();
  const makeProvider = (providerOptions: { pageSize?: number } = {}) =>
    new GoogleDriveProvider({
      auth,
      sessionStore: sessions,
      fetch: instrumented.fetch,
      pageSize: providerOptions.pageSize,
    });
  const provider = makeProvider();

  let env: ProbeEnvironment | null = null;

  const group = await runProbeGroup('connect', 'Connect and grant Drive access', async (steps) => {
    const connected = await steps.step('connect.authorize', 'Interactive consent', async () => {
      const connection = await provider.connect();
      const label = connection.accountLabel ?? '';
      // The label is shown on screen so the operator can confirm the account,
      // but only its shape is written to the report. The fallback is recorded
      // separately: `fetchGoogleAccountLabel` returns "Google Drive" whenever
      // the userinfo call fails, so treating it as "masked" would hide the
      // difference between a working token and a rejected one.
      const isFallback = label === PROVIDER_FALLBACK_LABEL;
      return {
        // A fallback label straight after interactive consent means the token
        // consent just produced was rejected by userinfo. That is not proof of
        // a broken connection on its own — userinfo can blip — but it is not a
        // pass either, and reporting it as one hides the failure this probe
        // exists to catch.
        status: label.length === 0 ? ('failed' as const) : isFallback ? ('inconclusive' as const) : ('passed' as const),
        detail: isFallback
          ? 'Consent completed, but the account label fell back to the provider name, so the token it produced was rejected by userinfo.'
          : 'Consent completed and a masked account label was derived.',
        facts: {
          accountLabelPresent: label.length > 0,
          accountLabelIsFallback: isFallback,
          accountLabelIsMasked: label.includes('•'),
        },
      };
    });

    if (connected.status !== 'passed') return;

    const label = (await auth.getAccountLabel().catch(() => '')) || PROVIDER_FALLBACK_LABEL;

    await steps.step('connect.appdata-scope', 'The granted scope reaches appDataFolder', async () => {
      const vaults = await provider.listVaults();
      return {
        status: 'passed' as const,
        detail: 'An appDataFolder query succeeded with the granted token.',
        facts: {
          existingVaults: vaults.length,
          existingProbeVaults: vaults.filter((summary) => isProbeVaultId(summary.vaultId)).length,
        },
      };
    });

    const marker = await steps.step('connect.vault-marker', 'Create the probe vault marker', async () => {
      const first = await provider.createVaultMarker(vaultId, vaultMarkerBytes(vaultId));
      const second = await provider.createVaultMarker(vaultId, vaultMarkerBytes(vaultId));
      env = {
        vault: first.vault,
        auth,
        provider,
        instrumented,
        sessions,
        newProvider: makeProvider,
        accountLabel: label,
      };
      return {
        status: !first.duplicate && second.duplicate ? ('passed' as const) : ('failed' as const),
        detail: 'The vault marker was created once and the identical repeat was reported as a duplicate.',
        facts: {
          vaultId,
          firstWasDuplicate: first.duplicate,
          repeatWasDuplicate: second.duplicate,
          remoteRootStable: first.vault.remoteRootId === second.vault.remoteRootId,
        },
      };
    });

    if (marker.status !== 'passed') env = null;
  });

  return { group, env };
}

/**
 * The vault a credential-only environment reports. No marker is created for it,
 * so its remote root does not exist; only probes that expect their Drive call
 * to fail before it reaches Drive may use this environment.
 */
export const ATTACHED_VAULT_ID = `${PROBE_VAULT_PREFIX}attached`;
const UNRESOLVED_REMOTE_ROOT = 'unresolved-attached-root';

/**
 * Builds a probe environment from credentials already in secure store, without
 * interactive consent.
 *
 * This exists for one reason. An externally revoked grant cannot be observed
 * after calling `connect()`, because consent re-grants it — so a probe that
 * connects first can never see the state it is meant to test. Attaching
 * reproduces what the app actually wakes up in: stored credentials whose grant
 * no longer exists.
 */
export async function runAttachGroup(): Promise<{
  group: ProbeGroupResult;
  env: ProbeEnvironment | null;
}> {
  const auth = createGoogleAuthorization();
  const instrumented = createInstrumentedDriveFetch();
  const sessions = new SqliteResumableSessionStore();
  const makeProvider = (providerOptions: { pageSize?: number } = {}) =>
    new GoogleDriveProvider({
      auth,
      sessionStore: sessions,
      fetch: instrumented.fetch,
      pageSize: providerOptions.pageSize,
    });

  let env: ProbeEnvironment | null = null;

  const group = await runProbeGroup('connect', 'Attach to stored credentials', async (steps) => {
    await steps.step('connect.attach', 'Reuse stored credentials without consent', async () => {
      const tokens = await readGoogleTokens();
      if (!tokens) {
        return {
          status: 'failed' as const,
          detail:
            'No credentials are stored on this device, so there is nothing to observe. Connect first, then revoke access, then attach.',
          facts: { storedCredentialsPresent: false },
        };
      }

      const label =
        (await auth.getAccountLabel().catch(() => '')) || PROVIDER_FALLBACK_LABEL;
      env = {
        vault: { vaultId: ATTACHED_VAULT_ID, remoteRootId: UNRESOLVED_REMOTE_ROOT },
        auth,
        provider: makeProvider(),
        instrumented,
        sessions,
        newProvider: makeProvider,
        accountLabel: label,
      };
      return {
        status: 'passed' as const,
        detail: 'Stored credentials were reused without interactive consent.',
        facts: {
          storedCredentialsPresent: true,
          hasRefreshCredential: Boolean(tokens.refreshToken),
          accessTokenPresent: tokens.accessToken.length > 0,
          accountLabelIsFallback: label === PROVIDER_FALLBACK_LABEL,
          accountLabelIsMasked: label.includes('•'),
        },
      };
    });
  });

  return { group, env };
}

/** Probe vaults left behind by earlier runs, so the operator can clean them up. */
export async function listProbeVaults(env: ProbeEnvironment): Promise<string[]> {
  const vaults = await env.provider.listVaults();
  return vaults.map((summary) => summary.vaultId).filter(isProbeVaultId);
}
