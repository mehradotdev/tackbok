import { deletionAttentionReason } from './deletionRecovery';

describe('durable cloud deletion recovery', () => {
  test('a disconnected device suppresses a stale authorization warning', () => {
    expect(deletionAttentionReason({
      status: 'disabled', revocationKind: null,
      revocationAcknowledgedAt: null, pauseReason: 'authorization-required',
    })).toBeNull();
  });

  test('preserves an explicit provider failure reason', () => {
    expect(deletionAttentionReason({
      status: 'paused',
      revocationKind: 'journal-deleted',
      revocationAcknowledgedAt: null,
      pauseReason: 'authorization-required',
    })).toBe('authorization-required');
  });

  test.each(['journal-deleted', 'backup-deleted'] as const)(
    'turns a crash-interrupted %s intent into resumable deletion',
    (revocationKind) => {
      expect(deletionAttentionReason({
        status: 'paused',
        revocationKind,
        revocationAcknowledgedAt: null,
        pauseReason: null,
      })).toBe('purge-incomplete');
    },
  );

  test('finishes a journal wipe after the remote purge already completed', () => {
    expect(deletionAttentionReason({
      status: 'revoked',
      revocationKind: 'journal-deleted',
      revocationAcknowledgedAt: null,
      pauseReason: null,
    })).toBe('journal-deleted');
  });

  test('an interrupted backup sign-out offers local credential cleanup', () => {
    expect(deletionAttentionReason({
      status: 'revoked',
      revocationKind: 'backup-deleted',
      revocationAcknowledgedAt: null,
      pauseReason: 'purge-incomplete',
    })).toBe('backup-deleted');
  });

  test('an acknowledged backup-only deletion needs no recovery', () => {
    expect(deletionAttentionReason({
      status: 'revoked',
      revocationKind: 'backup-deleted',
      revocationAcknowledgedAt: 1,
      pauseReason: null,
    })).toBeNull();
  });
});
