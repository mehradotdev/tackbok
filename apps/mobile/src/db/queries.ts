import { desc, like, or, and, gte, lt, eq, sql } from 'drizzle-orm';
import { startOfDay, format } from 'date-fns';
import { getAchievementForCreateTransition, type Achievement } from '~/lib/achievements';
import {
  createPromptInTransaction,
  createTagInTransaction,
  deleteEntryInTransaction,
  deletePromptInTransaction,
  deleteTagInTransaction,
  runInCloudSyncTransaction,
  updateProfileInTransaction,
  updatePromptInTransaction,
  updateTagInTransaction,
  upsertEntryInTransaction,
} from '~/lib/cloudSync/storage/repositories';
import {
  db,
  entries,
  tags,
  customPrompts,
  type Entry,
  type NewEntry,
  type Tag,
  type CustomPrompt,
  cloudVault,
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
 * Total entries plus the distinct local-time day starts that contain one.
 * Only fetches timestamps. Accepts a transaction so achievement evaluation and
 * analytics can never disagree about where a day begins.
 */
async function readEntryDays(
  executor: Pick<typeof db, 'select'>,
): Promise<{ entryCount: number; days: Set<number> }> {
  const rows = await executor.select({ created_at: entries.created_at }).from(entries);
  // Day boundaries must match the app's timeline grouping (local time), so
  // dedupe in JS rather than with SQLite's UTC-based date().
  const days = new Set<number>();
  rows.forEach((row) => {
    days.add(startOfDay(new Date(row.created_at)).getTime());
  });
  return { entryCount: rows.length, days };
}

/**
 * Get aggregate entry stats (total entries + distinct local-time days with at
 * least one entry). Used for bucketed analytics.
 */
export async function getEntryStats(): Promise<{
  entryCount: number;
  daysWithEntries: number;
}> {
  const { entryCount, days } = await readEntryDays(db);
  return { entryCount, daysWithEntries: days.size };
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
  await runInCloudSyncTransaction((tx) => upsertEntryInTransaction(tx, entry));
}

/**
 * Inserts a genuine new entry and evaluates achievement eligibility from the
 * same serialized database transition. Seeding, imports, and edits deliberately
 * continue to use `upsertEntry` and therefore never enqueue celebrations.
 */
export async function createEntryWithAchievement(
  entry: NewEntry,
): Promise<Achievement | null> {
  const now = Date.now();
  const createdAt = entry.created_at ?? now;

  return runInCloudSyncTransaction(async (tx) => {
    const { entryCount, days } = await readEntryDays(tx);

    await upsertEntryInTransaction(tx, {
      ...entry,
      created_at: createdAt,
      updated_at: now,
    });

    return getAchievementForCreateTransition({
      entryCountBefore: entryCount,
      journaledDaysBefore: days.size,
      // Local day starts, so this stays correct across DST transitions.
      addsJournaledDay: !days.has(startOfDay(new Date(createdAt)).getTime()),
    });
  });
}

/**
 * Delete an entry record by its note_id.
 *
 * Callers deleting a complete entry should use `deleteEntry` from
 * `~/lib/entryDeletion` so its media files are cleaned up as well.
 */
export async function deleteEntryRecord(noteId: string) {
  await runInCloudSyncTransaction((tx) => deleteEntryInTransaction(tx, noteId));
}

/**
 * Completely resets the database by deleting all entries.
 */
export async function deleteAllData(): Promise<{ retainedMediaForSync: boolean }> {
  return runInCloudSyncTransaction(async (tx) => {
    const [allEntries, allTags, allPrompts, vaultRows] = await Promise.all([
      tx.select({ id: entries.note_id }).from(entries),
      tx.select({ id: tags.tag_id }).from(tags),
      tx.select({ id: customPrompts.prompt_id }).from(customPrompts),
      tx.select({ id: cloudVault.vault_id }).from(cloudVault).limit(1),
    ]);
    const batchId = `local-reset-${Date.now()}`;
    for (const { id } of allEntries) {
      await deleteEntryInTransaction(tx, id, { batchId });
    }
    for (const { id } of allTags) {
      await deleteTagInTransaction(tx, id, { batchId });
    }
    for (const { id } of allPrompts) {
      await deletePromptInTransaction(tx, id, { batchId });
    }
    await updateProfileInTransaction(
      tx,
      { displayName: null, email: null, photoUri: null },
      { batchId },
    );
    return { retainedMediaForSync: vaultRows.length > 0 };
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
  await runInCloudSyncTransaction((tx) => createTagInTransaction(tx, title));
}

/**
 * Update a tag's title
 */
export async function updateTag(tagId: string, title: string): Promise<void> {
  await runInCloudSyncTransaction((tx) => updateTagInTransaction(tx, tagId, title));
}

/**
 * Delete a tag by its ID
 * Removes the tag from all entries that reference it, then deletes the tag itself.
 */
export async function deleteTag(tagId: string): Promise<void> {
  await runInCloudSyncTransaction((tx) => deleteTagInTransaction(tx, tagId));
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
  await runInCloudSyncTransaction((tx) => createPromptInTransaction(tx, title));
}

/**
 * Update an existing custom prompt.
 */
export async function updateCustomPrompt(promptId: string, title: string): Promise<void> {
  await runInCloudSyncTransaction((tx) => updatePromptInTransaction(tx, promptId, title));
}

/**
 * Delete a custom prompt by ID.
 */
export async function deleteCustomPrompt(promptId: string): Promise<void> {
  await runInCloudSyncTransaction((tx) => deletePromptInTransaction(tx, promptId));
}
