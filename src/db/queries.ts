import { desc, like, or, and, gte, lt, eq } from 'drizzle-orm';
import { startOfDay } from 'date-fns';
import {
  db,
  entries,
  tags,
  entryTags,
  type Entry,
  type NewEntry,
  type Tag,
} from './index';

// ============================================================================
// Entry Queries
// ============================================================================

/**
 * Generate a UUID v4 for new entries
 */
// TODO: Move this to a utils file
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get all entries sorted by created_at DESC
 */
export async function getAllEntries(): Promise<Entry[]> {
  return db.select().from(entries).orderBy(desc(entries.created_at));
}

/**
 * Get entries grouped by date
 */
export async function getAllEntriesGroupByDate(): Promise<Map<number, Entry[]>> {
  const entriesList = await getAllEntries();
  const groups = new Map<number, Entry[]>();

  entriesList.forEach((entry) => {
    const dayStart = startOfDay(new Date(entry.created_at)).getTime();
    if (!groups.has(dayStart)) {
      groups.set(dayStart, []);
    }
    groups.get(dayStart)!.push(entry);
  });

  return groups;
}

/**
 * Get a single entry by its note_id
 */
export async function getEntryById(noteId: string): Promise<Entry | undefined> {
  const result = await db
    .select()
    .from(entries)
    .where(eq(entries.note_id, noteId))
    .limit(1);
  return result[0];
}

/**
 * Get entries for a specific date (comparing timestamps)
 * @param dateMs - Start of day in milliseconds
 */
export async function getEntriesForDate(dateMs: number): Promise<Entry[]> {
  const nextDayMs = dateMs + 24 * 60 * 60 * 1000;
  return db
    .select()
    .from(entries)
    .where(and(gte(entries.created_at, dateMs), lt(entries.created_at, nextDayMs)))
    .orderBy(desc(entries.created_at));
}

/**
 * Get the first entry for a specific date (for backward compatibility)
 * @param dateMs - Start of day in milliseconds
 */
export async function getEntryForDate(dateMs: number): Promise<Entry | undefined> {
  const result = await getEntriesForDate(dateMs);
  return result[0];
}

/**
 * Get all dates (as YYYY-MM-DD strings) that have entries for a given month
 */
export function getEntryDatesForMonth(year: number, month: number): string[] {
  // Calculate start and end of month in milliseconds
  const startOfMonth = new Date(year, month - 1, 1).getTime();
  const startOfNextMonth = new Date(year, month, 1).getTime();

  const result = db
    .select({ created_at: entries.created_at })
    .from(entries)
    .where(
      and(
        gte(entries.created_at, startOfMonth),
        lt(entries.created_at, startOfNextMonth),
      ),
    )
    .all();

  // Convert timestamps to YYYY-MM-DD strings and deduplicate
  const dateSet = new Set<string>();
  result.forEach((row) => {
    const date = new Date(row.created_at);
    const dateStr = date.toISOString().split('T')[0];
    dateSet.add(dateStr);
  });

  return Array.from(dateSet);
}

/**
 * Search entries by title or content using LIKE operator
 */
export async function searchEntries(
  searchTerm: string,
  tagIds: string[] = [],
): Promise<Entry[]> {
  if (!searchTerm.trim()) return [];

  const likePattern = `%${searchTerm}%`;

  if (tagIds.length === 0) {
    return db
      .select()
      .from(entries)
      .where(
        or(
          like(entries.text_title, likePattern),
          like(entries.text_content, likePattern),
        ),
      )
      .orderBy(desc(entries.created_at));
  }

  // With tag filtering - need to join with entry_tags
  const result = await db
    .selectDistinct()
    .from(entries)
    .leftJoin(entryTags, eq(entries.note_id, entryTags.entry_id))
    .where(
      and(
        or(
          like(entries.text_title, likePattern),
          like(entries.text_content, likePattern),
        ),
        // Note: For proper IN clause, we'd need to use inArray from drizzle-orm
        // For now, this is a simplified version
      ),
    )
    .orderBy(desc(entries.created_at));

  return result.map((r) => r.entries);
}

/**
 * Insert or update an entry
 */
export async function upsertEntry(entry: NewEntry): Promise<void> {
  const now = Date.now();
  await db
    .insert(entries)
    .values({
      ...entry,
      updated_at: now,
      created_at: entry.created_at ?? now,
    })
    .onConflictDoUpdate({
      target: entries.note_id,
      set: {
        text_title: entry.text_title,
        text_content: entry.text_content,
        mood: entry.mood,
        assets: entry.assets,
        is_favorite: entry.is_favorite,
        updated_at: now,
        created_at: entry.created_at ?? 'previous value', // TODO: use actual previous value timeMs
      },
    });
}

/**
 * Delete an entry by its note_id
 */
export async function deleteEntry(noteId: string): Promise<void> {
  await db.delete(entries).where(eq(entries.note_id, noteId));
}

// ============================================================================
// Tag Queries
// ============================================================================

/**
 * Get all tags
 */
export async function getAllTags(): Promise<Tag[]> {
  return db.select().from(tags).orderBy(tags.title);
}

/**
 * Create a new tag
 */
export async function createTag(title: string): Promise<void> {
  const now = Date.now();
  await db.insert(tags).values({
    tag_id: generateUUID(),
    title,
    created_at: now,
    updated_at: now,
  });
}

/**
 * Add a tag to an entry
 */
export async function addTagToEntry(entryId: string, tagId: string): Promise<void> {
  await db
    .insert(entryTags)
    .values({ entry_id: entryId, tag_id: tagId })
    .onConflictDoNothing();
}

/**
 * Remove a tag from an entry
 */
export async function removeTagFromEntry(entryId: string, tagId: string): Promise<void> {
  await db
    .delete(entryTags)
    .where(and(eq(entryTags.entry_id, entryId), eq(entryTags.tag_id, tagId)));
}

/**
 * Get all tags for an entry
 */
export async function getTagsForEntry(entryId: string): Promise<Tag[]> {
  const result = await db
    .select({ tag: tags })
    .from(entryTags)
    .innerJoin(tags, eq(entryTags.tag_id, tags.tag_id))
    .where(eq(entryTags.entry_id, entryId));

  return result.map((r) => r.tag);
}
