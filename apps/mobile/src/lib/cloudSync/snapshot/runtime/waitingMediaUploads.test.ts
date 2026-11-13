import { useSettingsStore } from '~/lib/settings';
import {
  recordWaitingMediaUploads,
  waitingMediaUploadCount,
} from './waitingMediaUploads';

// The persisted store needs native storage; this keeps its state API.
jest.mock('~/lib/settings', () => {
  let state: Record<string, unknown> = {};
  return {
    useSettingsStore: {
      getState: () => state,
      setState: (next: Record<string, unknown>) => {
        state = { ...state, ...next };
      },
    },
  };
});

describe('uploads waiting for Wi-Fi', () => {
  beforeEach(() => useSettingsStore.setState({ cloudSyncWaitingUploads: null }));

  it('keeps the count with its backup in the persisted settings', () => {
    recordWaitingMediaUploads('vault-a', 3);
    expect(useSettingsStore.getState().cloudSyncWaitingUploads).toEqual({
      vaultId: 'vault-a',
      count: 3,
    });
    expect(waitingMediaUploadCount('vault-a')).toBe(3);
    expect(waitingMediaUploadCount('vault-b')).toBe(0);
  });

  it('clears once nothing waits, and ignores another backup reporting none', () => {
    recordWaitingMediaUploads('vault-a', 2);
    recordWaitingMediaUploads('vault-b', 0);
    expect(waitingMediaUploadCount('vault-a')).toBe(2);
    recordWaitingMediaUploads('vault-a', 0);
    expect(useSettingsStore.getState().cloudSyncWaitingUploads).toBeNull();
  });
});
