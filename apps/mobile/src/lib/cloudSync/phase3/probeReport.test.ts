import {
  isGlobalRevocationEndpoint,
  observeGlobalFetch,
  redactUrl,
  createInstrumentedDriveFetch,
} from './probeContext';
import {
  assertProbeFact,
  assertReportIsRedacted,
  ProbeRedactionError,
  ProbeStepRecorder,
  runProbeGroup,
  worstStatus,
  MAXIMUM_DETAIL_LENGTH,
  MAXIMUM_FACT_LENGTH,
} from './probeReport';

describe('phase-3 probe report redaction', () => {
  const forbidden: [string, string][] = [
    ['access token', '{"detail":"used ya29.a0ARrdaM-not-a-real-token"}'],
    ['refresh token', '{"detail":"stored 1//0gTestRefreshValue123"}'],
    ['authorization header', '{"detail":"sent Bearer abc.def"}'],
    ['session uri', '{"uri":"https://www.googleapis.com/upload/drive/v3/files?upload_id=AEnB2Uo"}'],
    ['token field', '{"accessToken":"redacted"}'],
    ['account email', '{"detail":"granted by owner.tester@gmail.com"}'],
  ];

  it.each(forbidden)('refuses to emit a report containing a %s', (_label, serialized) => {
    expect(() => assertReportIsRedacted(serialized)).toThrow(ProbeRedactionError);
  });

  it('accepts a masked account label', () => {
    // maskGoogleAccountEmail turns t@gmail.com into t•••@g•••.com; the email
    // pattern must not fire on it or every real report would be rejected.
    expect(() =>
      assertReportIsRedacted(JSON.stringify({ label: 't•••@g•••.com', fallback: 'Google Drive' })),
    ).not.toThrow();
  });

  it('accepts a realistic probe report', () => {
    const report = {
      probeSuite: 'cloud-sync-phase3',
      vaultId: 'probe-m2x9k',
      groups: [
        {
          id: 'resumable-upload',
          steps: [
            {
              id: 'resumable.interrupted',
              status: 'passed',
              detail: 'The session survived the interruption in the SQLite ledger.',
              facts: {
                bytesDeliveredBeforeInterrupt: 1048576,
                sessionPersisted: true,
                sessionOriginTrusted: true,
                fileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
              },
            },
          ],
        },
      ],
    };
    expect(() => assertReportIsRedacted(JSON.stringify(report, null, 2))).not.toThrow();
  });

  it('rejects a fact long enough to hide a credential or a journal entry', () => {
    expect(() => assertProbeFact('detail', 'x'.repeat(MAXIMUM_FACT_LENGTH + 1))).toThrow();
    expect(() => assertProbeFact('detail', 'x'.repeat(MAXIMUM_FACT_LENGTH))).not.toThrow();
  });

  it('accepts prose long enough to state a limitation properly', () => {
    // A skipped step explains what is still owed, which does not fit in the
    // fact cap. Applying the fact cap to `detail` aborted a real probe group.
    const recorder = new ProbeStepRecorder();
    const note =
      'Google expires a resumable session after roughly a week, which no single sitting can observe. ' +
      'Still owed: leave one interrupted upload in the ledger, return after the expiry window, and ' +
      'confirm the adapter restarts it without operator action.';
    expect(note.length).toBeGreaterThan(MAXIMUM_FACT_LENGTH);
    expect(() => recorder.skip('session.natural-expiry', 'Natural expiry', note)).not.toThrow();
  });

  it('still bounds prose at the detail cap', () => {
    const recorder = new ProbeStepRecorder();
    expect(() =>
      recorder.skip('verbose', 'Verbose', 'z'.repeat(MAXIMUM_DETAIL_LENGTH + 1)),
    ).toThrow();
  });

  it('enforces the fact length cap as steps are recorded', () => {
    const recorder = new ProbeStepRecorder();
    expect(() =>
      recorder.record({
        id: 'leaky',
        title: 'Leaky step',
        status: 'passed',
        detail: 'fine',
        facts: { blob: 'y'.repeat(MAXIMUM_FACT_LENGTH + 1) },
      }),
    ).toThrow();
  });
});

describe('phase-3 probe step recording', () => {
  it('turns a thrown step into failed evidence without losing later steps', async () => {
    const group = await runProbeGroup('permanent-delete', 'Deletion', async (steps) => {
      await steps.step('one', 'First', async () => {
        throw Object.assign(new Error('Google Drive request failed (403)'), { category: 'auth' });
      });
      await steps.step('two', 'Second', async () => ({
        status: 'passed' as const,
        detail: 'ran anyway',
        facts: {},
      }));
    });

    expect(group.steps.map((step) => [step.id, step.status])).toEqual([
      ['one', 'failed'],
      ['two', 'passed'],
    ]);
    expect(group.steps[0].detail).toBe('auth: Google Drive request failed (403)');
    expect(group.status).toBe('failed');
  });

  it('records an aborted group rather than rejecting', async () => {
    const group = await runProbeGroup('connect', 'Connect', async () => {
      throw new Error('network down');
    });
    expect(group.status).toBe('failed');
    expect(group.steps).toHaveLength(1);
  });

  it('reports the worst status in a group', () => {
    expect(worstStatus(['passed', 'skipped'])).toBe('skipped');
    expect(worstStatus(['passed', 'awaiting-operator', 'skipped'])).toBe('awaiting-operator');
    expect(worstStatus(['inconclusive', 'awaiting-operator'])).toBe('inconclusive');
    expect(worstStatus(['failed', 'inconclusive'])).toBe('failed');
    expect(worstStatus([])).toBe('passed');
  });
});

describe('phase-3 request observation', () => {
  it('strips query strings, which is where upload IDs and page tokens live', () => {
    expect(redactUrl('https://www.googleapis.com/upload/drive/v3/files?upload_id=AEnB2Uo')).toBe(
      'https://www.googleapis.com/upload/drive/v3/files',
    );
    expect(redactUrl('not a url')).toBe('<unparseable url>');
  });

  it('recognizes both global revocation endpoints and nothing else', () => {
    expect(isGlobalRevocationEndpoint('https://oauth2.googleapis.com/revoke?token=x')).toBe(true);
    expect(isGlobalRevocationEndpoint('https://accounts.google.com/o/oauth2/revoke?token=x')).toBe(
      true,
    );
    expect(isGlobalRevocationEndpoint('https://www.googleapis.com/drive/v3/files')).toBe(false);
  });

  it('counts requests and statuses without recording query strings', async () => {
    const instrumented = createInstrumentedDriveFetch(async (url) => ({
      ok: true,
      status: url.includes('upload') ? 308 : 200,
      headers: { get: () => null },
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    await instrumented.fetch('https://www.googleapis.com/drive/v3/files?q=secret-token-value');
    await instrumented.fetch('https://www.googleapis.com/upload/drive/v3/files?upload_id=AEnB2Uo');

    const snapshot = instrumented.snapshot();
    expect(snapshot.requests).toBe(2);
    expect(snapshot.statusCounts).toEqual({ '200': 1, '308': 1 });
    expect(snapshot.endpoints).toEqual([
      'https://www.googleapis.com/drive/v3/files',
      'https://www.googleapis.com/upload/drive/v3/files',
    ]);
    expect(() => assertReportIsRedacted(JSON.stringify(snapshot))).not.toThrow();
  });

  it('observes global fetch during disconnect and always restores it', async () => {
    const original = jest.fn(async () => new Response(null, { status: 204 }));
    globalThis.fetch = original as unknown as typeof globalThis.fetch;

    const { observed } = await observeGlobalFetch(async () => {
      await globalThis.fetch('https://oauth2.googleapis.com/revoke?token=x');
      await globalThis.fetch('https://openidconnect.googleapis.com/v1/userinfo');
    });

    expect(observed.globalRevocationRequests).toBe(1);
    expect(observed.urls).toEqual([
      'https://oauth2.googleapis.com/revoke',
      'https://openidconnect.googleapis.com/v1/userinfo',
    ]);
    expect(globalThis.fetch).toBe(original);
    expect(original).toHaveBeenCalledTimes(2);
  });

  it('restores global fetch even when the observed body throws', async () => {
    const original = globalThis.fetch;
    await expect(
      observeGlobalFetch(async () => {
        throw new Error('disconnect failed');
      }),
    ).rejects.toThrow('disconnect failed');
    expect(globalThis.fetch).toBe(original);
  });
});
