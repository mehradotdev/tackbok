import { Platform } from 'react-native';
import { format } from 'date-fns';
import { and, desc, eq } from 'drizzle-orm';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { getTableColumns } from 'drizzle-orm/utils';
import { MOODS, TAG_SEPARATOR } from '~/constants';
import { AssetType } from '~/types';
import { db, entries, tags, type Entry } from '~/db';
import { generateUUID } from '~/lib/utils';
import { photoFileExists } from '~/lib/photoUtils';
import { voiceMemoFileExists } from '~/lib/voiceMemoUtils';

/** Column order for the Tackbok CSV export — drives both the header and each row's value order. */
const TACKBOK_COLUMNS = Object.keys(getTableColumns(entries)) as Array<keyof Entry>;
const TACKBOK_CSV_HEADER = TACKBOK_COLUMNS.join(',');

/** Set of valid mood values, derived from the MOODS const to stay in sync. */
const VALID_MOODS: Set<string> = new Set(MOODS);

// ============================================================================
// CSV Utilities
// ============================================================================

/**
 * Escapes a value for CSV format.
 * Wraps in quotes if contains comma, newline, or quote, and doubles any quotes.
 */
function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Parses CSV content into rows, properly handling:
 * - Quoted fields with commas
 * - Quoted fields with newlines
 * - Escaped quotes (double quotes within quoted fields)
 */
function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote - add one quote and skip the next
        currentField += '"';
        i++;
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false;
      } else {
        // Regular character inside quotes (including newlines)
        currentField += char;
      }
    } else {
      if (char === '"' && currentField.length === 0) {
        // Start of quoted field (quote must be at field start per RFC 4180)
        inQuotes = true;
      } else if (char === ',') {
        // Field separator
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        // Row separator
        if (char === '\r') i++; // Skip \n in \r\n
        currentRow.push(currentField);
        if (currentRow.some((field) => field.trim() !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else if (char !== '\r') {
        // Regular character (ignore standalone \r)
        currentField += char;
      }
    }
  }

  // Don't forget the last field and row
  currentRow.push(currentField);
  if (currentRow.some((field) => field.trim() !== '')) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Generates a timestamp string in the format YYYY-MM-DDTHH-MM-SS for file naming.
 */
function generateTimestamp(): string {
  return format(new Date(), "yyyy-MM-dd'T'HH-mm-ss");
}

/**
 * Normalizes a CSV header row for comparison.
 * Strips BOM from the first cell, lowercases, and trims.
 */
function normalizeHeader(headerRow: string[]): string[] {
  return headerRow.map((h, idx) =>
    (idx === 0 ? h.replace(/^\uFEFF/, '') : h).toLowerCase().trim(),
  );
}

// ============================================================================
// Export
// ============================================================================

/**
 * Builds a map from tag_id → tag title for resolving IDs to human-readable names.
 */
async function buildTagIdToNameMap(): Promise<Map<string, string>> {
  const allTags = await db.select().from(tags);
  const map = new Map<string, string>();
  for (const tag of allTags) {
    map.set(tag.tag_id, tag.title);
  }
  return map;
}

/**
 * Converts a comma-separated tag ID string to a pipe-separated tag name string.
 * Unknown tag IDs are silently dropped.
 */
function resolveTagIdsToNames(tagIds: string, tagMap: Map<string, string>): string {
  if (!tagIds) return '';
  return tagIds
    .split(',')
    .filter((id) => id.length > 0)
    .map((id) => tagMap.get(id))
    .filter((name): name is string => name != null)
    .join(TAG_SEPARATOR);
}

/**
 * Converts entries to full-fidelity Tackbok CSV format.
 * Preserves all fields including full timestamps for round-trip fidelity.
 *
 * Tags are exported as human-readable pipe-separated names (e.g. "gratitude|morning")
 * instead of internal IDs, enabling portability across devices and databases.
 *
 * Note: The `assets` column contains JSON with device-specific file paths/URIs.
 * These paths will NOT be valid on another device. Asset files are not included
 * in the CSV export — only the metadata is preserved for same-device restore.
 */
/** Maps each DB column name to a function that serialises that field to a CSV string. */
const columnGetters: Record<
  keyof Entry,
  (e: Entry, tagMap: Map<string, string>) => string
> = {
  note_id: (e) => e.note_id,
  text_title: (e) => e.text_title ?? '',
  text_content: (e) => e.text_content ?? '',
  mood: (e) => e.mood ?? '',
  assets: (e) => (e.assets ? JSON.stringify(e.assets) : ''),
  tags: (e, tagMap) => resolveTagIdsToNames(e.tags, tagMap),
  created_at: (e) => e.created_at.toString(),
  updated_at: (e) => e.updated_at.toString(),
};

function entriesToTackbokCSV(allEntries: Entry[], tagMap: Map<string, string>): string {
  const rows = allEntries.map((entry) => {
    const values = TACKBOK_COLUMNS.map((col) => columnGetters[col](entry, tagMap));
    return values.map(escapeCSVValue).join(',');
  });
  return [TACKBOK_CSV_HEADER, ...rows].join('\n');
}

/**
 * Writes a CSV string to a file and either saves (Android) or shares (iOS).
 */
async function saveCSVFile(csvContent: string, fileName: string): Promise<void> {
  if (Platform.OS === 'android') {
    // Android: Use native directory picker
    try {
      const directory = await Directory.pickDirectoryAsync();
      // create() is synchronous and returns a File object
      const file = directory.createFile(fileName, 'text/csv');
      file.write(csvContent);
    } catch (err) {
      // Preserve the original error so write failures vs. user cancellations are debuggable
      throw new Error('Export cancelled or failed', { cause: err });
    }
  } else {
    // iOS: Use share sheet
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Sharing is not available on this device');
    }

    const file = new File(Paths.cache, fileName);

    // Open share sheet
    try {
      file.write(csvContent);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Gratitude Entries',
        UTI: 'public.comma-separated-values-text',
      });
    } finally {
      // Best‑effort cleanup of the temp file
      if (file.exists) {
        file.delete();
      }
    }
  }
}

/**
 * Exports all entries to a full-fidelity Tackbok CSV file.
 * Tags are embedded as human-readable names (pipe-separated) in each entry row,
 * so the entire backup is a single CSV file.
 *
 * On Android: Uses Storage Access Framework to show native "Save As" dialog
 * On iOS: Uses share sheet
 */
export async function exportToCSV(): Promise<void> {
  // Fetch all entries from database
  const allEntries = await db.select().from(entries).orderBy(desc(entries.created_at));

  if (allEntries.length === 0) {
    throw new Error('No entries to export');
  }

  // Build tag ID → name map for resolving tag names
  const tagMap = await buildTagIdToNameMap();

  // Export entries (single file)
  const timestamp = generateTimestamp();
  const csvContent = entriesToTackbokCSV(allEntries, tagMap);
  await saveCSVFile(csvContent, `TackbokBackup_${timestamp}.csv`);
}

// ============================================================================
// Shared — File Picker
// ============================================================================

/**
 * Opens the document picker to select a CSV file for import.
 * Returns the document result or null if cancelled.
 */
export async function pickCSVFile(): Promise<DocumentPicker.DocumentPickerSuccessResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'application/csv', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return null;
  }

  return result;
}

// ============================================================================
// Import — Tackbok format
// ============================================================================

/**
 * Resolves a pipe-separated tag names string to a comma-separated tag IDs string.
 *
 * For each tag name:
 * - Looks up an existing tag by title (case-insensitive, trimmed)
 * - If found, uses the existing tag_id
 * - If not found, creates a new tag and uses the new tag_id
 *
 * Uses an in-memory cache to avoid duplicate tag creation across entries.
 */
async function resolveTagNamesToIds(
  tagNamesStr: string,
  tagNameToIdCache: Map<string, string>,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  if (!tagNamesStr) return '';

  const tagNames = tagNamesStr
    .split(TAG_SEPARATOR)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  if (tagNames.length === 0) return '';

  const tagIds: string[] = [];

  for (const tagName of tagNames) {
    const cacheKey = tagName.toLowerCase();

    // Check in-memory cache (pre-warmed with all existing tags before import)
    const cachedId = tagNameToIdCache.get(cacheKey);
    if (cachedId) {
      tagIds.push(cachedId);
      continue;
    }

    // Not in cache — create a new tag
    const newTagId = generateUUID();
    const now = Date.now();
    await tx.insert(tags).values({
      tag_id: newTagId,
      title: tagName, // Preserve original casing
      created_at: now,
      updated_at: now,
    });
    tagNameToIdCache.set(cacheKey, newTagId);
    tagIds.push(newTagId);
  }

  return tagIds.join(',');
}

/**
 * Imports entries from a Tackbok-format CSV file.
 * Uses note_id for exact duplicate detection.
 * Resolves tag names to tag IDs (creating new tags as needed).
 * Returns the number of entries imported.
 */
export async function importFromCSV(uri: string): Promise<number> {
  const file = new File(uri);
  const content = await file.text();

  const rows = parseCSV(content);

  if (rows.length < 2) {
    throw new Error('CSV file is empty or has no data rows');
  }

  const header = normalizeHeader(rows[0]);

  // Validate Tackbok format
  if (!header.includes('note_id')) {
    throw new Error(
      'Invalid Tackbok CSV format. Expected headers: note_id, created_at, updated_at, …',
    );
  }

  const dataRows = rows.slice(1);

  // Find column indices
  const cols = {
    note_id: header.indexOf('note_id'),
    text_title: header.indexOf('text_title'),
    text_content: header.indexOf('text_content'),
    mood: header.indexOf('mood'),
    assets: header.indexOf('assets'),
    tags: header.indexOf('tags'),
    created_at: header.indexOf('created_at'),
    updated_at: header.indexOf('updated_at'),
  };

  // Validate required columns
  if (
    cols.note_id === -1 ||
    cols.created_at === -1 ||
    cols.updated_at === -1
  ) {
    throw new Error(
      'Invalid Tackbok CSV: missing required columns (note_id, created_at, updated_at)',
    );
  }

  let importedCount = 0;

  // Cache for tag name → tag_id mapping (avoids duplicate tag creation)
  const tagNameToIdCache = new Map<string, string>();

  await db.transaction(async (tx) => {
    // Pre-load all existing tags into cache to avoid N+1 queries during import
    const allTags = await tx.select().from(tags);
    for (const tag of allTags) {
      tagNameToIdCache.set(tag.title.trim().toLowerCase(), tag.tag_id);
    }

    // Pre-load all existing note_ids for O(1) duplicate detection
    const existingEntries = await tx.select({ note_id: entries.note_id }).from(entries);
    const existingNoteIds = new Set(existingEntries.map((e) => e.note_id));
    for (const row of dataRows) {
      const noteId = row[cols.note_id]?.trim();
      const textContent = row[cols.text_content]?.trim();
      const createdAtStr = row[cols.created_at]?.trim();
      const updatedAtStr = row[cols.updated_at]?.trim();

      if (!noteId || !createdAtStr || !updatedAtStr) {
        continue; // Skip rows with missing required fields
      }

      const createdAt = parseInt(createdAtStr, 10);
      const updatedAt = parseInt(updatedAtStr, 10);

      if (isNaN(createdAt) || isNaN(updatedAt)) {
        continue; // Skip rows with invalid timestamps
      }

      if (existingNoteIds.has(noteId)) {
        continue; // Skip duplicate
      }
      existingNoteIds.add(noteId);

      // Parse optional fields
      const textTitle =
        cols.text_title !== -1 ? row[cols.text_title]?.trim() || null : null;
      const rawMood = cols.mood !== -1 ? row[cols.mood]?.trim() || null : null;
      const mood = (
        rawMood && VALID_MOODS.has(rawMood) ? rawMood : null
      ) as Entry['mood'];
      const assetsStr = cols.assets !== -1 ? row[cols.assets]?.trim() : '';
      const tagNamesStr = cols.tags !== -1 ? (row[cols.tags]?.trim() ?? '') : '';

      // Resolve tag names → tag IDs (creates new tags if needed)
      const tagsStr = await resolveTagNamesToIds(tagNamesStr, tagNameToIdCache, tx);

      // Parse assets JSON (may be empty or invalid)
      let assets = null;
      if (assetsStr) {
        try {
          const parsed = JSON.parse(assetsStr);
          if (Array.isArray(parsed)) {
            // Filter out IMAGE assets whose files don't exist on disk.
            // Asset paths are device-specific, so they won't be valid on another device.
            const existing = parsed.filter((a: { type?: string; uri?: string }) => {
              if (a.type === AssetType.IMAGE) return !!a.uri && photoFileExists(a.uri);
              if (a.type === AssetType.AUDIO)
                return !!a.uri && voiceMemoFileExists(a.uri);
              return true; // keep unknown asset types
            });
            assets = existing.length > 0 ? existing : null;
          }
        } catch {
          // Invalid JSON — skip assets for this entry
          assets = null;
        }
      }

      const hasSubstantiveContent =
        !!textTitle || !!textContent || mood !== null || (assets?.length ?? 0) > 0;
      if (!hasSubstantiveContent) {
        continue;
      }

      await tx.insert(entries).values({
        note_id: noteId,
        text_title: textTitle,
        text_content: textContent || null,
        mood,
        assets,
        tags: tagsStr,
        created_at: createdAt,
        updated_at: updatedAt,
      });

      importedCount++;
    }
  });

  return importedCount;
}

// ============================================================================
// Import — Legacy Presently format
// ============================================================================

/**
 * Imports entries from a legacy Presently-format CSV file.
 * Only has entryDate (YYYY-MM-DD) and entryContent columns.
 *
 * Uses date + content matching for duplicate detection because
 * the Presently format truncates timestamps to date-only.
 * Presently entries always use midnight timestamps, so exact match is correct.
 *
 * Returns the number of entries imported.
 */
export async function importFromPresentlyCSV(uri: string): Promise<number> {
  // Read file content
  const file = new File(uri);
  const content = await file.text();

  // Parse CSV content (handles multi-line content in quoted fields)
  const rows = parseCSV(content);

  if (rows.length < 2) {
    throw new Error('CSV file is empty or has no data rows');
  }

  // Check header
  const header = normalizeHeader(rows[0]);
  if (!header.includes('entrydate') || !header.includes('entrycontent')) {
    throw new Error('Invalid CSV format: missing entryDate or entryContent columns');
  }

  // Find column indices
  const dateIndex = header.indexOf('entrydate');
  const contentIndex = header.indexOf('entrycontent');

  // Parse data rows (skip header)
  const dataRows = rows.slice(1);
  let importedCount = 0;

  // Import entries using Drizzle — wrapped in a transaction for atomicity.
  // If the process fails midway, all changes are rolled back.
  await db.transaction(async (tx) => {
    for (const row of dataRows) {
      if (row.length > Math.max(dateIndex, contentIndex)) {
        const entryDateStr = row[dateIndex].trim();
        const entryContent = row[contentIndex].trim();

        // Validate date format (YYYY-MM-DD)
        if (/^\d{4}-\d{2}-\d{2}$/.test(entryDateStr) && entryContent) {
          // Convert date string to timestamp (start of day)
          const dateMs = new Date(entryDateStr + 'T00:00:00').getTime();

          // Check if entry with same date and content already exists.
          // Presently entries always use midnight timestamps, so exact match is correct.
          const existing = await tx
            .select({ note_id: entries.note_id })
            .from(entries)
            .where(
              and(eq(entries.created_at, dateMs), eq(entries.text_content, entryContent)),
            )
            .limit(1);

          if (existing.length > 0) {
            continue; // Skip duplicate
          }

          const now = Date.now();
          await tx.insert(entries).values({
            note_id: generateUUID(),
            text_content: entryContent,
            created_at: dateMs,
            updated_at: now,
          });

          importedCount++;
        }
      }
    }
  });

  return importedCount;
}
