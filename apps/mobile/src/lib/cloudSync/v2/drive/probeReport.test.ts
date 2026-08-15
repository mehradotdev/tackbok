import {
  assertDriveV2ProbeReportIsRedacted,
  buildDriveV2ProbeReport,
} from './probeReport';

describe('V7-3 probe report', () => {
  test('accepts aggregate synthetic evidence', () => {
    expect(() => buildDriveV2ProbeReport([{
      id: 'representative-import',
      title: 'Synthetic import',
      status: 'passed',
      detail: 'The aggregate count round-tripped.',
      facts: { syntheticEntries: 2_000, restoredEntryCount: 2_000 },
    }], {
      platform: 'android', osVersion: 'test', appVersion: 'test', buildType: 'debug',
    })).not.toThrow();
  });

  test.each([
    [{ token: 'secret' }],
    [{ email: 'test@example.com' }],
    [{ snapshotId: 'a'.repeat(64) }],
    [{ facts: { entries: [{ content: 'fixture text' }] } }],
    [{ detail: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=secret' }],
  ])('rejects sensitive report payload %#', (value) => {
    expect(() => assertDriveV2ProbeReportIsRedacted(value)).toThrow();
  });
});
