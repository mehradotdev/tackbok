import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { DeterministicFixtureId } from '../phase0/deterministicFixture';
import {
  runDisconnectGroup,
  runExternalRevocationGroup,
  runSilentRefreshGroup,
} from './authProbes';
import {
  runCleanupGroup,
  runImmutabilityGroup,
  runPermanentDeleteGroup,
  runResumableUploadGroup,
  runRevocationPurgeGroup,
  runSessionRecoveryGroup,
} from './driveProbes';
import type { ProbeEnvironment } from './probeEnvironment';
import { deleteProbeScratchFiles } from './probeFiles';
import {
  assertReportIsRedacted,
  worstStatus,
  type Phase3ProbeReport,
  type ProbeGroupId,
  type ProbeGroupResult,
} from './probeReport';
import { runTransferGroup } from './transferProbe';

export const PHASE3_PROBE_LOG_TAG = 'PHASE3_PROBE_RESULT';
export const PHASE3_PROBE_REPORT_FILENAME = 'phase3-probe-report.json';

export interface ProbeRunOptions {
  fixtureId: DeterministicFixtureId;
}

export interface ProbeGroupDefinition {
  id: ProbeGroupId;
  title: string;
  /** What the group demonstrates, in the operator's terms. */
  summary: string;
  /** Which merge-blocking gate item the group feeds. */
  gateItem: string;
  /** True when the operator must do something outside the app first. */
  manualStaging: string | null;
  run(env: ProbeEnvironment, options: ProbeRunOptions): Promise<ProbeGroupResult>;
}

/**
 * The probe groups in the order the gate expects them. Connect comes from
 * `runConnectGroup`, which produces the environment the rest of these need,
 * and cleanup is last because disconnect ends Drive access.
 */
export const PROBE_GROUPS: ProbeGroupDefinition[] = [
  {
    id: 'drive-immutability',
    title: 'Immutable object identity',
    summary:
      'Duplicate physical files with identical properties are tolerated; a different body at the same logical key is corruption.',
    gateItem: 'ADR 0003 checklist, items 1–2',
    manualStaging: null,
    run: (env) => runImmutabilityGroup(env),
  },
  {
    id: 'resumable-upload',
    title: 'Resumable upload and restart resume',
    summary:
      'An upload interrupted mid-flight persists its session and resumes from Drive’s accepted offset in a provider that never saw the first attempt.',
    gateItem: 'ADR 0003 checklist, item 3',
    manualStaging: null,
    run: (env) => runResumableUploadGroup(env),
  },
  {
    id: 'session-recovery',
    title: 'Resumable session expiry recovery',
    summary:
      'A locally expired session and a session Drive no longer recognizes both restart without losing the logical upload.',
    gateItem: 'ADR 0003 checklist, item 4 (natural expiry stays outstanding)',
    manualStaging: null,
    run: (env) => runSessionRecoveryGroup(env),
  },
  {
    id: 'permanent-delete',
    title: 'Permanent deletion is idempotent',
    summary: 'A deleted object leaves appDataFolder and a repeated delete is success, not an error.',
    gateItem: 'ADR 0003 checklist, item 5',
    manualStaging: null,
    run: (env) => runPermanentDeleteGroup(env),
  },
  {
    id: 'revocation-purge',
    title: 'Interrupted revocation purge',
    summary:
      'A purge stopped between pages resumes to completion and every revocation marker survives it.',
    gateItem: 'ADR 0003 checklist item 6, and the interrupted-purge gate item',
    manualStaging: null,
    run: (env) => runRevocationPurgeGroup(env),
  },
  {
    id: 'transfer',
    title: 'Large transfer round trip',
    summary:
      'The frozen fixture uploads with an interruption, resumes, downloads to disk, and verifies its byte count and SHA-256.',
    gateItem: 'The ~200 MiB fixture gate item',
    manualStaging: null,
    run: (env, options) => runTransferGroup(env, options.fixtureId),
  },
  {
    id: 'silent-refresh',
    title: 'Silent token renewal after expiry',
    summary: 'A cleared access token is renewed without sending the operator back through consent.',
    gateItem: 'Android and iOS E2E, the refresh leg',
    manualStaging: null,
    run: (env) => runSilentRefreshGroup(env),
  },
  {
    id: 'external-revocation',
    title: 'External authorization failure',
    summary: 'A grant revoked outside the app fails cleanly, and reconnecting restores service.',
    gateItem: 'Android and iOS E2E, the external failure/recovery leg',
    manualStaging:
      'Open myaccount.google.com → Security → Your connections to third-party apps on the test account and remove Tackbok’s access, then run this group.',
    run: (env) => runExternalRevocationGroup(env, 'observe-failure'),
  },
  {
    id: 'cleanup',
    title: 'Remove probe objects',
    summary: 'Deletes every object this run created from the test account, markers included.',
    gateItem: 'Probe hygiene',
    manualStaging: null,
    run: (env) => runCleanupGroup(env),
  },
  {
    id: 'disconnect',
    title: 'Local disconnect',
    summary:
      'Disconnect clears local credentials and issues no global revocation request. Run this last; it ends Drive access.',
    gateItem: 'Android and iOS E2E, the Disconnect leg',
    manualStaging: null,
    run: (env) => runDisconnectGroup(env),
  },
];

/**
 * Groups that need nothing done outside the app. `external-revocation` and
 * `disconnect` are excluded: one needs the grant removed in Google account
 * settings first, the other ends Drive access for the session.
 */
export const AUTOMATIC_GROUP_IDS: ProbeGroupId[] = [
  'drive-immutability',
  'resumable-upload',
  'session-recovery',
  'permanent-delete',
  'revocation-purge',
  'transfer',
  'silent-refresh',
  'cleanup',
];

export interface ProbeSequenceOptions extends ProbeRunOptions {
  groupIds: ProbeGroupId[];
  /**
   * `connect` grants access interactively. `attach` reuses stored credentials
   * without consent, which is the only way to observe an externally revoked
   * grant — connecting would re-grant it. Attached runs have no real vault, so
   * only groups whose Drive calls are expected to fail may be listed with it.
   */
  mode?: 'connect' | 'attach';
  /** Which half of the external-revocation leg to run. */
  stage?: 'observe-failure' | 'recover';
  onEnvironment?(env: ProbeEnvironment): void;
  onGroup?(result: ProbeGroupResult): void;
}

/**
 * Connects and runs a list of groups back to back, writing the report at the
 * end. This is what the probe screen drives from a deep link so a full pass can
 * be repeated without hand-tapping every group.
 */
export async function runProbeSequence(
  options: ProbeSequenceOptions,
): Promise<Phase3ProbeReport> {
  const { runAttachGroup, runConnectGroup } = await import('./probeEnvironment');
  const collected: ProbeGroupResult[] = [];

  const { group: connectGroup, env } =
    options.mode === 'attach' ? await runAttachGroup() : await runConnectGroup();
  collected.push(connectGroup);
  options.onGroup?.(connectGroup);
  if (!env) {
    const report = buildProbeReport('probe-unconnected', collected);
    await writeProbeReport(report);
    return report;
  }
  options.onEnvironment?.(env);

  for (const id of options.groupIds) {
    const definition = PROBE_GROUPS.find((candidate) => candidate.id === id);
    if (!definition) continue;
    const result =
      id === 'external-revocation' && options.stage === 'recover'
        ? await runExternalRevocationRecovery(env)
        : await definition.run(env, { fixtureId: options.fixtureId });
    collected.push(result);
    options.onGroup?.(result);
  }

  const report = buildProbeReport(env.vault.vaultId, collected);
  await writeProbeReport(report);
  return report;
}

/** The recovery half of the external-revocation leg, run after consent is granted again. */
export function runExternalRevocationRecovery(env: ProbeEnvironment): Promise<ProbeGroupResult> {
  return runExternalRevocationGroup(env, 'recover');
}

export function buildProbeReport(
  vaultId: string,
  groups: ProbeGroupResult[],
): Phase3ProbeReport {
  return {
    probeSuite: 'cloud-sync-phase3',
    timestamp: new Date().toISOString(),
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    buildType: __DEV__ ? 'debug' : 'release',
    vaultId,
    groups,
    status: worstStatus(groups.map((group) => group.status)),
  };
}

/**
 * Serializes the report, refuses to emit it if anything credential-shaped
 * survived, then writes it to the document directory and the log. The
 * redaction check runs before both sinks, so a leak cannot reach either.
 */
export async function writeProbeReport(report: Phase3ProbeReport): Promise<string> {
  const serialized = JSON.stringify(report, null, 2);
  assertReportIsRedacted(serialized);

  const file = new File(Paths.document, PHASE3_PROBE_REPORT_FILENAME);
  if (file.exists) file.delete();
  file.create();
  file.write(serialized);

  console.log(`${PHASE3_PROBE_LOG_TAG} ${JSON.stringify(report)}`);
  return file.uri;
}

/** Removes the fixture and download scratch files this suite wrote. */
export function clearProbeScratch(): number {
  return deleteProbeScratchFiles();
}
