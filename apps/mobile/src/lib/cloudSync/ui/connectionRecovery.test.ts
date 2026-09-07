import { canResumeUnpublishedBackup } from './connectionRecovery';

const unfinished = {
  previousEmail: 'owner@example.com', currentEmail: 'owner@example.com',
  settledGeneration: 0, hasBase: false, availableVaultCount: 0, revoked: false,
};

describe('unfinished first backup recovery', () => {
  test('allows an empty same-account destination before the first publication settles', () => {
    expect(canResumeUnpublishedBackup(unfinished)).toBe(true);
  });
  test.each([
    { currentEmail: 'other@example.com' },
    { previousEmail: null },
    { currentEmail: null },
    { settledGeneration: 1 },
    { hasBase: true },
    { availableVaultCount: 1 },
    { revoked: true },
  ])('refuses to initialize a destination with conflicting or missing evidence: %j', (override) => {
    expect(canResumeUnpublishedBackup({ ...unfinished, ...override })).toBe(false);
  });
});
