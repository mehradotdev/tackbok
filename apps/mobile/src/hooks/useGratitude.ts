import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type NewEntry, type Entry } from '~/types';
import {
  getAllEntries,
  getEntriesForDay,
  getEntryDatesForMonth,
  searchEntries,
  getAllTags,
  upsertEntry,
  deleteEntry,
  getAllEntriesGroupByDate,
  updateTag,
  deleteTag,
  createTag,
  getEntryById,
  getAllCustomPrompts,
  createCustomPrompt,
  updateCustomPrompt,
  deleteCustomPrompt,
} from '~/db/queries';

export const QUERY_KEYS = {
  entries: 'entries',
  tags: 'tags',
  prompts: 'prompts',
} as const;

// ============================================================================
// Queries
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
export function useEntriesForDay(dateMs: number) {
  return useQuery({
    queryKey: [QUERY_KEYS.entries, 'byDate', dateMs],
    queryFn: () => getEntriesForDay(dateMs),
  });
}

/**
 * Hook for entry dates in a specific month (for calendar dot markers)
 */
export function useEntryDatesForMonth(year: number, month: number, enabled = true) {
  return useQuery<string[]>({
    queryKey: [QUERY_KEYS.entries, 'datesByMonth', year, month],
    queryFn: () => getEntryDatesForMonth(year, month),
    enabled,
  });
}

/**
 * Hook for a single entry
 */
export function useEntry(noteId?: string) {
  return useQuery({
    queryKey: [QUERY_KEYS.entries, 'byEntry', noteId],
    queryFn: () => (noteId ? getEntryById(noteId) : Promise.resolve(undefined)),
    enabled: !!noteId,
  });
}

/**
 * Hook for search using LIKE operator with optional tag filtering
 */
export function useSearchEntries(searchTerm: string, selectedTagIds: string[] = []) {
  const trimmed = searchTerm.trim();

  return useQuery({
    queryKey: [QUERY_KEYS.entries, 'search', trimmed, selectedTagIds],
    queryFn: () => searchEntries(trimmed, selectedTagIds),
    enabled: trimmed.length > 0 || selectedTagIds.length > 0,
  });
}

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
 * Hook for all custom prompts.
 */
export function useCustomPrompts() {
  return useQuery({
    queryKey: [QUERY_KEYS.prompts],
    queryFn: getAllCustomPrompts,
  });
}

/**
 * Hook for mapping of all tags (id -> Tag)
 */
export function useTagMapping() {
  const { data: tags = [] } = useTags();

  return React.useMemo(() => {
    const map = new Map<string, (typeof tags)[0]>();
    tags.forEach((tag) => {
      map.set(tag.tag_id, tag);
    });
    return map;
  }, [tags]);
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
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.entries] });
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
    onSuccess: (_data, noteId) => {
      // Remove the specific entry query from cache to prevent refetch returning undefined
      queryClient.removeQueries({ queryKey: [QUERY_KEYS.entries, 'byEntry', noteId] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.entries] });
    },
  });
}

/**
 * Hook to update a tag's title
 */
export function useUpdateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tagId, title }: { tagId: string; title: string }) =>
      updateTag(tagId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.tags] });
    },
  });
}

/**
 * Hook to delete a tag
 */
export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tagId: string) => deleteTag(tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.tags] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.entries] });
    },
  });
}

/**
 * Hook to create a new tag
 */
export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (title: string) => createTag(title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.tags] });
    },
  });
}

/**
 * Hook to create a new custom prompt.
 */
export function useCreateCustomPrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (title: string) => createCustomPrompt(title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.prompts] });
    },
  });
}

/**
 * Hook to update a custom prompt title.
 */
export function useUpdateCustomPrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ promptId, title }: { promptId: string; title: string }) =>
      updateCustomPrompt(promptId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.prompts] });
    },
  });
}

/**
 * Hook to delete a custom prompt.
 */
export function useDeleteCustomPrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (promptId: string) => deleteCustomPrompt(promptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.prompts] });
    },
  });
}
