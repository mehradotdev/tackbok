import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { db, entryTags } from '~/db';
import { type NewEntry, type Entry } from '~/types';
import {
  getAllEntries,
  getEntriesForDate,
  searchEntries,
  getAllTags,
  upsertEntry,
  deleteEntry,
  addTagToEntry,
  removeTagFromEntry,
  getAllEntriesGroupByDate,
} from '~/db/queries';

// ============================================================================
// Query Keys
// ============================================================================

export const QUERY_KEYS = {
  entries: 'entries',
  entriesForDate: 'entriesForDate',
  search: 'search',
  tags: 'tags',
  hasTaggedEntries: 'hasTaggedEntries',
  timeline: 'timeline',
};

// ============================================================================
// Entry Hooks
// ============================================================================

/**
 * Hook for all entries sorted by created_at DESC
 */
export function useEntries() {
  return useQuery({
    queryKey: [QUERY_KEYS.entries],
    queryFn: getAllEntries,
  });
}

/**
 * Hook for entries grouped by date
 */
export function useEntriesGroupByDate() {
  return useQuery<Map<number, Entry[]>>({
    queryKey: [QUERY_KEYS.entries, 'timeline'],
    queryFn: getAllEntriesGroupByDate,
  });
}

/**
 * Hook for entries on a specific date
 */
export function useEntriesForDate(dateMs: number) {
  return useQuery({
    queryKey: [QUERY_KEYS.entriesForDate, dateMs],
    queryFn: () => getEntriesForDate(dateMs),
  });
}

/**
 * Hook for search using LIKE operator with optional tag filtering
 */
export function useSearchEntries(searchTerm: string, selectedTagIds: string[] = []) {
  const trimmed = searchTerm.trim();
  
  return useQuery({
    queryKey: [QUERY_KEYS.search, trimmed, selectedTagIds],
    queryFn: () => searchEntries(trimmed, selectedTagIds),
    enabled: trimmed.length > 0,
  });
}

// ============================================================================
// Tag Hooks
// ============================================================================

/**
 * Hook for all tags
 */
export function useTags() {
  return useQuery({
    queryKey: [QUERY_KEYS.tags],
    queryFn: getAllTags,
  });
}

/**
 * Hook to check if any entries have tags
 */
// TODO: Move the query to db/queries.ts?
export function useHasTaggedEntries() {
  return useQuery({
    queryKey: [QUERY_KEYS.hasTaggedEntries],
    queryFn: async () => {
      const result = await db.select().from(entryTags).limit(1);
      return result.length > 0;
    },
  });
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Hook to upsert (create or update) an entry
 */
export function useUpsertEntry() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (entry: NewEntry) => upsertEntry(entry),
    onSuccess: () => {
      // TODO: Check if we need to invalidate useEntriesGroupByDate too
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.entries] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.entriesForDate] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.search] });
    },
  });
}

/**
 * Hook to delete an entry
 */
export function useDeleteEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (noteId: string) => deleteEntry(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.entries] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.entriesForDate] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.search] });
    },
  });
}

/**
 * Hook to add a tag to an entry
 */
export function useAddTagToEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entryId, tagId }: { entryId: string; tagId: string }) => 
      addTagToEntry(entryId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.hasTaggedEntries] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.search] });
    },
  });
}

/**
 * Hook to remove a tag from an entry
 */
export function useRemoveTagFromEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entryId, tagId }: { entryId: string; tagId: string }) => 
      removeTagFromEntry(entryId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.hasTaggedEntries] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.search] });
    },
  });
}
