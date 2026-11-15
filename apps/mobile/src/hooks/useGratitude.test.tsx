import React, { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDeleteEntry, useEntry } from './useGratitude';
import type { Entry } from '~/types';

const mockStored = new Map<string, Entry>();
jest.mock('~/db/queries', () => ({
  getEntryById: async (noteId: string) => mockStored.get(noteId),
}));
jest.mock('~/lib/entryDeletion', () => ({
  deleteEntry: async (noteId: string) => {
    mockStored.delete(noteId);
  },
}));
jest.mock('~/lib/settings', () => ({
  useSettingsStore: {
    getState: () => ({ sampleEntryIds: [], setSampleEntryIds: jest.fn() }),
  },
}));

const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

test('deleting an entry elsewhere updates a mounted screen showing it', async () => {
  mockStored.set('original', { note_id: 'original' } as Entry);
  // No garbage-collection timers, so Jest can exit.
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  const seen: (Entry | null | undefined)[] = [];
  let remove: (noteId: string) => Promise<unknown> = async () => {};
  const onReady = (fn: typeof remove) => {
    remove = fn;
  };
  // The entry screen, still mounted under Other versions.
  function EntryScreen() {
    seen.push(useEntry('original').data);
    return null;
  }
  // Other versions, where "Keep this one" deletes the entry.
  function OtherVersions({
    onReady,
  }: {
    onReady: (remove: (noteId: string) => Promise<unknown>) => void;
  }) {
    const { mutateAsync } = useDeleteEntry();
    useEffect(() => onReady(mutateAsync), [onReady, mutateAsync]);
    return null;
  }
  let root: ReactTestRenderer;
  await act(async () => {
    root = create(
      <QueryClientProvider client={client}>
        <EntryScreen />
        <OtherVersions onReady={onReady} />
      </QueryClientProvider>,
    );
  });
  await flush();
  expect(seen.at(-1)?.note_id).toBe('original');

  await act(async () => remove('original'));
  await flush();
  expect(seen.at(-1)).toBeNull();
  act(() => root.unmount());
  client.clear();
});
