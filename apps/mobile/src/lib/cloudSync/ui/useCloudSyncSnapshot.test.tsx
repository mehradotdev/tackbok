import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useDownloadedMediaCount } from './useCloudSyncSnapshot';

let mockDownloaded = 0;
const mockSyncListeners = new Set<() => void>();
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('../runtime/mutationSignal', () => ({
  addCloudSyncMutationListener: () => ({ remove: () => {} }),
}));
jest.mock('../runtime/production', () => ({
  subscribeProductionCloudSync: (listener: () => void) => {
    mockSyncListeners.add(listener);
    return () => mockSyncListeners.delete(listener);
  },
}));
jest.mock('./production', () => ({
  loadCloudSyncSnapshot: async () => ({ downloadedMediaCount: mockDownloaded }),
}));

test('a downloaded attachment re-renders screens that hide missing files', async () => {
  function Entry() {
    return React.createElement('Count', null, useDownloadedMediaCount());
  }
  let root!: ReactTestRenderer;
  await act(async () => {
    root = create(<Entry />);
  });
  expect(root.toJSON()).toMatchObject({ children: ['0'] });

  // A hydration batch finishes: the entry row is unchanged, the count is not.
  mockDownloaded = 2;
  await act(async () => {
    mockSyncListeners.forEach((listener) => listener());
  });
  expect(root.toJSON()).toMatchObject({ children: ['2'] });
  await act(async () => root.unmount());
});
