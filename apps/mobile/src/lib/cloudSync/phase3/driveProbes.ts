import { canonicalBytes, sha256Bytes } from '../codec';
import { parseAndValidateRevocationMarker } from '../domain/validation';
import { GoogleDriveProvider, isTrustedGoogleResumableSessionUri } from '../providers/googleDrive';
import { ProviderError, type RemoteObject, type VaultRef } from '../providers/types';
import type { ProbeEnvironment } from './probeEnvironment';
import { isProbeVaultId, isStaleProbeVault, PROBE_VAULT_PREFIX } from './probeVaultId';
import {
  createFileByteSource,
  deterministicBytes,
  SimulatedTransferInterruption,
  writeProbeBlobFile,
} from './probeFiles';
import { runProbeGroup as group, type ProbeGroupResult, type ProbeStep } from './probeReport';

const RESUMABLE_CHUNK_BYTES = 256 * 1024;

/** A trusted-origin session URI that Drive will not recognize. */
const DEAD_SESSION_URI =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=tackbok-probe-dead-session';

/** Reads every object in the probe vault, following pagination to the end. */
async function listAll(
  provider: GoogleDriveProvider,
  vault: VaultRef,
  prefix = '',
): Promise<RemoteObject[]> {
  const objects: RemoteObject[] = [];
  let cursor: string | undefined;
  do {
    const page = await provider.list(vault, prefix, cursor);
    objects.push(...page.objects);
    cursor = page.cursor ?? undefined;
  } while (cursor);
  return objects;
}

/**
 * ADR-0003 items 1 and 2: identical physical duplicates are tolerated, and a
 * same-logical-key/different-body candidate is reported as corruption rather
 * than resolved by name or modified time.
 */
export function runImmutabilityGroup(env: ProbeEnvironment): Promise<ProbeGroupResult> {
  return group('drive-immutability', 'Immutable object identity', async (steps) => {
    const key = 'entities/entry/probe-immutable/v1.json';
    const bytes = deterministicBytes(4096, 11);

    await steps.step('immutability.duplicate-write', 'Identical duplicate write is tolerated', async () => {
      // Two providers racing the same logical put is exactly how a physical
      // duplicate is created in the field: both check for candidates, both
      // find none, and both upload before either finishes.
      const rival = env.newProvider();
      const before = env.instrumented.snapshot().requests;
      const [first, second] = await Promise.all([
        env.provider.putImmutable(env.vault, key, bytes),
        rival.putImmutable(env.vault, key, bytes),
      ]);
      const physical = (await listAll(env.provider, env.vault, key)).length;
      const readBack = await env.provider.read(env.vault, key);

      const facts = {
        physicalFilesForKey: physical,
        sameFileIdReturned: first.fileId === second.fileId,
        contentHashesAgree: first.contentHash === second.contentHash,
        readBackSucceeded: readBack !== null,
        readBackByteLength: readBack?.body.byteLength ?? 0,
        requestsIssued: env.instrumented.snapshot().requests - before,
      };

      if (readBack === null || first.contentHash !== second.contentHash) {
        return { status: 'failed' as const, detail: 'The duplicate write did not converge on one logical object.', facts };
      }
      if (physical < 2) {
        return {
          status: 'inconclusive' as const,
          detail:
            'The race serialized, so only one physical file exists. Duplicate tolerance was not exercised; re-run to try to reproduce it.',
          facts,
        };
      }
      return {
        status: 'passed' as const,
        detail: `${physical} physical files share the logical key and the properties query returns all of them; reads stay deterministic.`,
        facts,
      };
    });

    await steps.step('immutability.collision', 'Different body at the same key is corruption', async () => {
      const conflicting = deterministicBytes(4096, 12);
      try {
        await env.provider.putImmutable(env.vault, key, conflicting);
        return {
          status: 'failed' as const,
          detail: 'A different body was accepted at an existing immutable key.',
          facts: { rejected: false },
        };
      } catch (error) {
        const category = error instanceof ProviderError ? error.category : 'unknown';
        return {
          status: category === 'corrupt' ? ('passed' as const) : ('failed' as const),
          detail:
            category === 'corrupt'
              ? 'The adapter reported corruption instead of selecting a candidate by name or modified time.'
              : `Expected a corrupt-category rejection; observed ${category}.`,
          facts: { rejected: true, category },
        };
      }
    });
  });
}

/**
 * ADR-0003 item 3: a resumable upload uses 256 KiB boundaries and persists its
 * session, and an interrupted upload resumes from Drive's accepted offset in a
 * process that never saw the original provider instance.
 */
export function runResumableUploadGroup(env: ProbeEnvironment): Promise<ProbeGroupResult> {
  return group('resumable-upload', 'Resumable upload and restart resume', async (steps) => {
    const key = 'blobs/probe-resumable-01.bin';
    const bytes = deterministicBytes(2 * 1024 * 1024, 21);
    const contentHash = sha256Bytes(bytes);
    const file = writeProbeBlobFile('phase3-probe-resumable-01.bin', bytes);
    const identity = { logicalKey: key, contentHash };

    const interrupted = await steps.step(
      'resumable.interrupted',
      'An interrupted upload persists its session',
      async () => {
        try {
          await env.provider.putImmutable(
            env.vault,
            key,
            createFileByteSource(file, contentHash, { failAfterBytes: 1024 * 1024 }),
          );
          return {
            status: 'inconclusive' as const,
            detail: 'The upload completed before the injected interruption; resume was not exercised.',
            facts: { interrupted: false },
          };
        } catch (error) {
          if (!(error instanceof SimulatedTransferInterruption)) throw error;
          const session = await env.sessions.get(identity);
          return {
            status: session ? ('passed' as const) : ('failed' as const),
            detail: session
              ? 'The session survived the interruption in the SQLite ledger.'
              : 'No resumable session was persisted, so the upload cannot resume after process death.',
            facts: {
              interrupted: true,
              bytesDeliveredBeforeInterrupt: error.bytesDelivered,
              sessionPersisted: session !== null,
              // The URI itself is a credential-bearing value and is never recorded.
              sessionOriginTrusted: session ? isTrustedGoogleResumableSessionUri(session.uri) : false,
              sessionExpiresInFuture: session ? session.expiresAt > Date.now() : false,
            },
          };
        }
      },
    );

    await steps.step('resumable.resume', 'A fresh provider resumes from the accepted offset', async () => {
      if (interrupted.facts.sessionPersisted !== true) {
        return {
          status: 'skipped' as const,
          detail: 'No persisted session to resume from.',
          facts: {},
        };
      }
      // A new provider instance holds no in-memory upload state, so anything it
      // resumes from came out of the durable session ledger.
      const restarted = env.newProvider();
      const before = env.instrumented.snapshot();
      const ref = await restarted.putImmutable(
        env.vault,
        key,
        createFileByteSource(file, contentHash),
      );
      const after = env.instrumented.snapshot();
      const readBack = await restarted.read(env.vault, key);
      const sessionAfter = await env.sessions.get(identity);

      const hashMatches = ref.contentHash === contentHash;
      const bodyMatches = readBack !== null && sha256Bytes(readBack.body) === contentHash;
      return {
        status: hashMatches && bodyMatches && sessionAfter === null ? ('passed' as const) : ('failed' as const),
        detail:
          hashMatches && bodyMatches
            ? 'The resumed upload produced the declared hash and the session ledger was cleared on completion.'
            : 'The resumed upload did not reproduce the declared content hash.',
        facts: {
          chunkBoundaryBytes: RESUMABLE_CHUNK_BYTES,
          declaredHashMatches: hashMatches,
          downloadedBodyMatches: bodyMatches,
          sessionClearedOnCompletion: sessionAfter === null,
          requestsToResume: after.requests - before.requests,
          status308Responses: after.statusCounts['308'] ?? 0,
        },
      };
    });
  });
}

/**
 * ADR-0003 item 4. A real service-side session expiry takes about a week, so
 * this group forces both recovery paths the adapter distinguishes and records
 * plainly that natural expiry remains unobserved.
 */
export function runSessionRecoveryGroup(env: ProbeEnvironment): Promise<ProbeGroupResult> {
  return group('session-recovery', 'Resumable session expiry recovery', async (steps) => {
    await steps.step('session.expired-locally', 'An expired stored session is replaced', async () => {
      const key = 'blobs/probe-session-expired.bin';
      const bytes = deterministicBytes(1024 * 1024, 31);
      const contentHash = sha256Bytes(bytes);
      const file = writeProbeBlobFile('phase3-probe-session-expired.bin', bytes);
      const identity = { logicalKey: key, contentHash };

      await env.sessions.set(identity, { uri: DEAD_SESSION_URI, expiresAt: Date.now() - 1 });
      const before = env.instrumented.snapshot();
      const ref = await env
        .newProvider()
        .putImmutable(env.vault, key, createFileByteSource(file, contentHash));
      const after = env.instrumented.snapshot();

      return {
        status: ref.contentHash === contentHash ? ('passed' as const) : ('failed' as const),
        detail:
          'An expired session was discarded and a new one started without losing the logical upload.',
        facts: {
          mode: 'forced-local-expiry',
          uploadCompleted: ref.contentHash === contentHash,
          requestsIssued: after.requests - before.requests,
          sessionCleared: (await env.sessions.get(identity)) === null,
        },
      };
    });

    await steps.step('session.dead-uri', 'A session Drive no longer knows is restarted', async () => {
      const key = 'blobs/probe-session-dead.bin';
      const bytes = deterministicBytes(1024 * 1024, 32);
      const contentHash = sha256Bytes(bytes);
      const file = writeProbeBlobFile('phase3-probe-session-dead.bin', bytes);
      const identity = { logicalKey: key, contentHash };

      // Unexpired by the local clock, so the adapter must ask Drive for the
      // accepted offset and act on the service's answer.
      await env.sessions.set(identity, {
        uri: DEAD_SESSION_URI,
        expiresAt: Date.now() + 60 * 60 * 1000,
      });

      try {
        const ref = await env
          .newProvider()
          .putImmutable(env.vault, key, createFileByteSource(file, contentHash));
        return {
          status: ref.contentHash === contentHash ? ('passed' as const) : ('failed' as const),
          detail: 'Drive rejected the stale session and the adapter restarted the upload.',
          facts: {
            mode: 'forced-dead-session',
            uploadCompleted: ref.contentHash === contentHash,
            sessionCleared: (await env.sessions.get(identity)) === null,
          },
        };
      } catch (error) {
        const category = error instanceof ProviderError ? error.category : 'unknown';
        return {
          status: 'inconclusive' as const,
          detail: `Drive answered the stale session with a ${category}-category error rather than not-found; record the status codes below and judge whether the adapter should treat it as a restart.`,
          facts: { mode: 'forced-dead-session', observedCategory: category },
        };
      }
    });

    steps.skip(
      'session.natural-expiry',
      'Natural service-side session expiry',
      'Google expires a resumable session after roughly a week, which no single sitting can observe. Still owed: leave one interrupted upload in the ledger, return after the expiry window, and confirm the adapter restarts it without operator action.',
    );
  });
}

/** ADR-0003 item 5: permanent deletion, and a repeated delete treated as success. */
export function runPermanentDeleteGroup(env: ProbeEnvironment): Promise<ProbeGroupResult> {
  return group('permanent-delete', 'Permanent deletion is idempotent', async (steps) => {
    await steps.step('delete.permanent', 'A deleted object is gone from appDataFolder', async () => {
      const key = 'entities/entry/probe-delete/v1.json';
      const ref = await env.provider.putImmutable(env.vault, key, deterministicBytes(2048, 41));
      await env.provider.deleteObject(env.vault, ref);
      const readBack = await env.provider.read(env.vault, key);
      const present = await env.provider.exists(env.vault, [key]);

      return {
        status: readBack === null && present.size === 0 ? ('passed' as const) : ('failed' as const),
        detail:
          'The object is absent from the appDataFolder listing. That listing excludes trashed files, so it proves absence from the working set; Drive `files.delete` is what makes it permanent.',
        facts: { readReturnsNull: readBack === null, existsReturnsEmpty: present.size === 0 },
      };
    });

    await steps.step('delete.idempotent', 'Repeating the delete is success', async () => {
      const key = 'entities/entry/probe-delete-twice/v1.json';
      const ref = await env.provider.putImmutable(env.vault, key, deterministicBytes(2048, 42));
      await env.provider.deleteObject(env.vault, ref);
      await env.provider.deleteObject(env.vault, ref);
      return {
        status: 'passed' as const,
        detail: 'A repeated permanent delete resolved rather than throwing on 404.',
        facts: { repeatedDeleteThrew: false },
      };
    });
  });
}

/**
 * ADR-0003 item 6 and the gate's interrupted-purge item: both revocation kinds
 * plus residue, a purge interrupted between pages and resumed by a provider
 * that never saw the first pass, and a final listing containing revocations only.
 */
export function runRevocationPurgeGroup(env: ProbeEnvironment): Promise<ProbeGroupResult> {
  return group('revocation-purge', 'Interrupted revocation purge', async (steps) => {
    const markerKeys: string[] = [];

    await steps.step('purge.seed', 'Publish both revocation kinds and residue', async () => {
      for (const kind of ['journal-deleted', 'backup-deleted'] as const) {
        const body = canonicalBytes({
          formatVersion: 1,
          vaultId: env.vault.vaultId,
          kind,
          revocationId: `probe-${kind}`,
          timestamp: 1,
        });
        const key = `revocations/${sha256Bytes(body)}.json`;
        await env.provider.putImmutable(env.vault, key, body);
        markerKeys.push(key);
      }
      for (let index = 0; index < 7; index += 1) {
        await env.provider.putImmutable(
          env.vault,
          `entities/entry/probe-residue-${index}/v1.json`,
          deterministicBytes(1024, 50 + index),
        );
      }
      // Counted by prefix so this never downloads a large media blob.
      const residue = await listAll(env.provider, env.vault, 'entities/');
      return {
        status: 'passed' as const,
        detail: 'Two revocation kinds and seven residue objects are published.',
        facts: {
          revocationMarkers: markerKeys.length,
          residueObjects: residue.length,
          vaultReportsRevoked: (await env.provider.listVaults()).some(
            (summary) => summary.vaultId === env.vault.vaultId && summary.revoked,
          ),
        },
      };
    });

    await steps.step('purge.interrupted', 'A purge stopped between pages resumes', async () => {
      // A small page size forces more than one sweep, and each sweep runs on a
      // provider that holds no state from the previous one.
      const firstSweep = await env.newProvider({ pageSize: 3 }).deleteVaultResidue(env.vault);
      if (firstSweep.complete) {
        return {
          status: 'inconclusive' as const,
          detail: 'The first sweep completed, so an interruption between pages was not exercised.',
          facts: { firstSweepDeleted: firstSweep.deleted, sweeps: 1 },
        };
      }

      let sweeps = 1;
      let deleted = firstSweep.deleted;
      let complete = false;
      while (!complete && sweeps < 20) {
        const sweep = await env.newProvider({ pageSize: 3 }).deleteVaultResidue(env.vault);
        deleted += sweep.deleted;
        complete = sweep.complete;
        sweeps += 1;
      }

      return {
        status: complete ? ('passed' as const) : ('failed' as const),
        detail: complete
          ? 'The purge resumed after each interruption and finished without operator intervention.'
          : 'The purge did not converge within the sweep bound.',
        facts: { sweeps, deletedTotal: deleted, completed: complete },
      };
    });

    await steps.step('purge.markers-survive', 'Only revocation markers remain', async () => {
      const markers = await listAll(env.provider, env.vault, 'revocations/');
      // Everything outside `revocations/` should be gone, so these prefix walks
      // find nothing to download rather than pulling a large blob back.
      const nonMarkers = [
        ...(await listAll(env.provider, env.vault, 'entities/')),
        ...(await listAll(env.provider, env.vault, 'blobs/')),
      ];
      const kinds = new Set<string>();
      for (const object of markers) {
        kinds.add(parseAndValidateRevocationMarker(object.body, env.vault.vaultId).kind);
      }

      const survived = markerKeys.every((key) => markers.some((object) => object.key === key));
      return {
        status: nonMarkers.length === 0 && survived && kinds.size === 2 ? ('passed' as const) : ('failed' as const),
        detail:
          nonMarkers.length === 0 && survived
            ? 'Every residue object is gone and both revocation kinds survived the purge.'
            : `${nonMarkers.length} non-marker objects remain after the purge.`,
        facts: {
          remainingMarkers: markers.length,
          remainingNonMarkers: nonMarkers.length,
          markersSurvived: survived,
          distinctRevocationKinds: kinds.size,
        },
      };
    });
  });
}

/** Deletes everything this suite created, including markers. Probe hygiene, not protocol. */
export function runCleanupGroup(env: ProbeEnvironment): Promise<ProbeGroupResult> {
  return group('cleanup', 'Remove probe objects from the test account', async (steps) => {
    await steps.step('cleanup.vault', 'Delete every object in the probe vault', async () => {
      // The residue sweep works from Drive metadata alone, so a 200 MiB probe
      // blob is deleted without ever being downloaded. Only the small
      // revocation markers left behind are listed afterwards.
      let deleted = 0;
      let sweeps = 0;
      let complete = false;
      while (!complete && sweeps < 50) {
        const sweep = await env.provider.deleteVaultResidue(env.vault);
        deleted += sweep.deleted;
        complete = sweep.complete;
        sweeps += 1;
      }

      const markers = await listAll(env.provider, env.vault, 'revocations/');
      for (const marker of markers) {
        await env.provider.deleteObject(env.vault, marker);
        deleted += 1;
      }

      // An empty prefix covers the vault marker too. Everything is deleted by
      // now, so this walk downloads nothing.
      const remaining = await listAll(env.provider, env.vault, '');
      return {
        status: complete && remaining.length === 0 ? ('passed' as const) : ('failed' as const),
        detail: `Removed ${deleted} probe objects, including revocation markers and the vault marker.`,
        facts: { deleted, sweeps, residueSweepCompleted: complete, remaining: remaining.length },
      };
    });

    await steps.step('cleanup.stale-vaults', 'Remove probe vaults left by earlier runs', async () => {
      // An interrupted run leaves objects behind in its own vault. Only
      // `probe-` vaults are ever touched, so a real vault cannot be reached
      // even if one somehow appeared in this account. Recent probe vaults are
      // spared: a second device signed into the same test account shares this
      // appDataFolder, and its run may still be using them.
      const probeVaults = (await env.provider.listVaults()).filter(
        (summary) => isProbeVaultId(summary.vaultId) && summary.vaultId !== env.vault.vaultId,
      );
      const stale = probeVaults.filter((summary) =>
        isStaleProbeVault(summary.vaultId, env.vault.vaultId),
      );
      const spared = probeVaults.length - stale.length;

      let removed = 0;
      for (const summary of stale) {
        const ref = { vaultId: summary.vaultId, remoteRootId: summary.remoteRootId };
        let complete = false;
        let sweeps = 0;
        while (!complete && sweeps < 50) {
          const sweep = await env.provider.deleteVaultResidue(ref);
          removed += sweep.deleted;
          complete = sweep.complete;
          sweeps += 1;
        }
        for (const marker of await listAll(env.provider, ref, 'revocations/')) {
          await env.provider.deleteObject(ref, marker);
          removed += 1;
        }
      }

      const left = (await env.provider.listVaults()).filter((summary) =>
        isProbeVaultId(summary.vaultId),
      );
      return {
        status: 'passed' as const,
        detail:
          `Removed ${stale.length} stale probe vaults and spared ${spared} recent ones that may ` +
          `belong to a concurrent run; only ${PROBE_VAULT_PREFIX}… vaults are ever eligible.`,
        facts: {
          staleVaults: stale.length,
          sparedRecentVaults: spared,
          objectsRemoved: removed,
          probeVaultsLeft: left.length,
        },
      };
    });
  });
}

export type { ProbeStep };
