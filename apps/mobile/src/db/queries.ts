import { desc, like, or, and, gte, lt, eq, sql } from 'drizzle-orm';
import { startOfDay, format } from 'date-fns';
import { generateUUID, sanitizePromptTitle, sanitizeTagName } from '~/lib/utils';
import {
  db,
  entries,
  tags,
  customPrompts,
  type Entry,
  type NewEntry,
  type Tag,
  type CustomPrompt,
} from './index';

/**
 * Get all entries (with raw CSV tags string) sorted by created_at DESC
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
 * Get aggregate entry stats (total entries + distinct local-time days with at
 * least one entry). Used for bucketed analytics — only fetches timestamps.
 */
export async function getEntryStats(): Promise<{
  entryCount: number;
  daysWithEntries: number;
}> {
  const rows = await db.select({ created_at: entries.created_at }).from(entries);
  // Day boundaries must match the app's timeline grouping (local time), so
  // dedupe in JS rather than with SQLite's UTC-based date().
  const days = new Set<number>();
  rows.forEach((row) => {
    days.add(startOfDay(new Date(row.created_at)).getTime());
  });
  return { entryCount: rows.length, daysWithEntries: days.size };
}

/**
 * Lightweight per-entry projection for the Insights screen. Deliberately never
 * selects `text_content` itself — char/word counts are computed inside SQLite
 * so journal text is never loaded into JS just for stats.
 */
export interface InsightsEntryRow {
  note_id: string;
  created_at: number;
  mood: Entry['mood'];
  assets: Entry['assets'];
  tags: string;
  char_count: number;
  word_count: number;
}

export async function getInsightsEntryRows(): Promise<InsightsEntryRow[]> {
  // Whitespace-normalized copy of the content (newlines/tabs → spaces) used
  // for word counting.
  const normalized = sql`replace(replace(replace(${entries.text_content}, char(13), ' '), char(10), ' '), char(9), ' ')`;
  return db
    .select({
      note_id: entries.note_id,
      created_at: entries.created_at,
      mood: entries.mood,
      assets: entries.assets,
      tags: entries.tags,
      char_count: sql<number>`coalesce(length(${entries.text_content}), 0)`,
      // Approximate word count: whitespace-separated runs. Consecutive blanks
      // (e.g. blank lines between paragraphs) inflate it slightly — fine for a
      // stat tile, and it keeps the query free of entry text.
      word_count: sql<number>`case
        when ${entries.text_content} is null or trim(${normalized}) = '' then 0
        else length(trim(${normalized})) - length(replace(trim(${normalized}), ' ', '')) + 1
      end`,
    })
    .from(entries)
    .orderBy(entries.created_at);
}

/**
 * Whether at least one entry exists. Used by the onboarding bootstrap check
 * to tell a fresh install apart from an existing pre-onboarding install.
 */
export async function hasAnyEntries(): Promise<boolean> {
  const rows = await db.select({ note_id: entries.note_id }).from(entries).limit(1);
  return rows.length > 0;
}

/**
 * Total number of entries. Used to decide whether the datepicker's
 * "Random" shortcut is worth showing (hidden below 2 entries).
 */
export async function getEntryCount(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(entries);
  return row?.count ?? 0;
}

/**
 * Get the note_id of one random entry
 */
export async function getRandomEntryId(): Promise<string | undefined> {
  const [row] = await db
    .select({ note_id: entries.note_id })
    .from(entries)
    .orderBy(sql`RANDOM()`)
    .limit(1);
  return row?.note_id;
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
export async function getEntriesForDay(dateMs: number): Promise<Entry[]> {
  const nextDayMs = dateMs + 24 * 60 * 60 * 1000;
  return db
    .select()
    .from(entries)
    .where(and(gte(entries.created_at, dateMs), lt(entries.created_at, nextDayMs)))
    .orderBy(desc(entries.created_at));
}

/**
 * Get all dates (as YYYY-MM-DD strings) that have entries for a given month
 */
export async function getEntryDatesForMonth(year: number, month: number) {
  // Calculate start and end of month in milliseconds
  const startOfMonth = new Date(year, month - 1, 1).getTime();
  const startOfNextMonth = new Date(year, month, 1).getTime();

  const result = await db
    .select({ created_at: entries.created_at })
    .from(entries)
    .where(
      and(
        gte(entries.created_at, startOfMonth),
        lt(entries.created_at, startOfNextMonth),
      ),
    );

  // Convert timestamps to YYYY-MM-DD strings and deduplicate
  const dateSet = new Set<string>();
  result.forEach((row) => {
    const date = new Date(row.created_at);
    const dateStr = format(date, 'yyyy-MM-dd');
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
  if (!searchTerm.trim() && tagIds.length === 0) return [];

  const likePattern = `%${searchTerm}%`;

  // Base query
  let query = db.select().from(entries).orderBy(desc(entries.created_at));

  const conditions = [];

  // Text search
  if (searchTerm.trim()) {
    conditions.push(
      or(like(entries.text_title, likePattern), like(entries.text_content, likePattern)),
    );
  }

  // Tag search (OR logic - if entry has any of the tags)
  if (tagIds.length > 0) {
    const tagConditions = tagIds.map((tagId) => like(entries.tags, `%${tagId}%`));
    conditions.push(or(...tagConditions));
  }

  if (conditions.length > 0) {
    // @ts-ignore
    query = query.where(and(...conditions));
  }

  return query;
}

/**
 * Insert or update an entry
 */
export async function upsertEntry(entry: NewEntry) {
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
        tags: entry.tags,
        updated_at: now,
        created_at: entry.created_at ?? sql`${entries.created_at}`, // use previous value if new value is undefined
      },
    });
}

/**
 * Delete an entry record by its note_id.
 *
 * Callers deleting a complete entry should use `deleteEntry` from
 * `~/lib/entryDeletion` so its media files are cleaned up as well.
 */
export async function deleteEntryRecord(noteId: string) {
  await db.delete(entries).where(eq(entries.note_id, noteId));
}

/**
 * Completely resets the database by deleting all entries.
 */
export async function deleteAllData() {
  await db.transaction(async (tx) => {
    await tx.delete(entries);
    await tx.delete(tags);
    await tx.delete(customPrompts);
  });
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
  const cleanTitle = sanitizeTagName(title);
  if (!cleanTitle) throw new Error('Invalid tag title');

  const now = Date.now();
  await db.insert(tags).values({
    tag_id: generateUUID(),
    title: cleanTitle,
    created_at: now,
    updated_at: now,
  });
}

/**
 * Update a tag's title
 */
export async function updateTag(tagId: string, title: string): Promise<void> {
  const cleanTitle = sanitizeTagName(title);
  if (!cleanTitle) throw new Error('Invalid tag title');

  await db
    .update(tags)
    .set({ title: cleanTitle, updated_at: Date.now() })
    .where(eq(tags.tag_id, tagId));
}

/**
 * Delete a tag by its ID
 * Removes the tag from all entries that reference it, then deletes the tag itself.
 */
export async function deleteTag(tagId: string): Promise<void> {
  // 1. Find all entries that have this tag
  const entriesWithTag = await searchEntries('', [tagId]);

  // 2. Remove the tag from entries and delete the tag itself — atomically
  await db.transaction(async (tx) => {
    const updates = entriesWithTag.map(async (entry) => {
      if (!entry.tags) return;

      const currentTags = entry.tags.split(',').filter((t) => t.length > 0);
      const newTags = currentTags.filter((id) => id !== tagId);

      // Only update if changed
      if (newTags.length !== currentTags.length) {
        const newTagsStr = newTags.join(',');
        await tx
          .update(entries)
          .set({ tags: newTagsStr, updated_at: Date.now() })
          .where(eq(entries.note_id, entry.note_id));
      }
    });

    await Promise.all(updates);

    // 3. Delete the tag itself
    await tx.delete(tags).where(eq(tags.tag_id, tagId));
  });
}

// ============================================================================
// Custom Prompt Queries
// ============================================================================

/**
 * Get all user-created prompts sorted by most recently updated.
 */
export async function getAllCustomPrompts(): Promise<CustomPrompt[]> {
  return db
    .select()
    .from(customPrompts)
    .orderBy(desc(customPrompts.updated_at), desc(customPrompts.created_at));
}

/**
 * Create a new reusable custom prompt.
 */
export async function createCustomPrompt(title: string): Promise<void> {
  const cleanTitle = sanitizePromptTitle(title);
  if (!cleanTitle) throw new Error('Invalid prompt title');

  const now = Date.now();
  try {
    await db.insert(customPrompts).values({
      prompt_id: generateUUID(),
      title: cleanTitle,
      created_at: now,
      updated_at: now,
    });
  } catch (error) {
    if (isDuplicateCustomPromptTitleError(error)) {
      throw new Error('Prompt already exists');
    }
    throw error;
  }
}

/**
 * Update an existing custom prompt.
 */
export async function updateCustomPrompt(promptId: string, title: string): Promise<void> {
  const cleanTitle = sanitizePromptTitle(title);
  if (!cleanTitle) throw new Error('Invalid prompt title');

  try {
    await db
      .update(customPrompts)
      .set({ title: cleanTitle, updated_at: Date.now() })
      .where(eq(customPrompts.prompt_id, promptId));
  } catch (error) {
    if (isDuplicateCustomPromptTitleError(error)) {
      throw new Error('Prompt already exists');
    }
    throw error;
  }
}

/**
 * Delete a custom prompt by ID.
 */
export async function deleteCustomPrompt(promptId: string): Promise<void> {
  await db.delete(customPrompts).where(eq(customPrompts.prompt_id, promptId));
}

function isDuplicateCustomPromptTitleError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('unique constraint failed') &&
    message.includes('custom_prompts.title')
  );
}
