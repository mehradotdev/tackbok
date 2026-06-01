import { and, eq } from 'drizzle-orm';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { db, entries } from '~/db';
import { generateUUID } from '~/lib/utils';
import {
  type ImportProgressCallback,
  reportImportProgress,
} from '../progress';
import { createBackupImportSummary } from '../summary';
import { type BackupImportSummary } from '../types';

const PRESENTLY_IMPORT_DOCUMENT_TYPES = [
  'text/csv',
  'text/comma-separated-values',
  'application/csv',
  '*/*',
];

/**
 * Parses CSV content into rows while preserving quoted commas, newlines, and escaped quotes.
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
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"' && currentField.length === 0) {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      // Support LF, CRLF, and bare CR line endings when parsing exports.
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && nextChar === '\n') i++;
        currentRow.push(currentField);
        if (currentRow.some((field) => field.trim() !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else if (char !== '\r') {
        currentField += char;
      }
    }
  }

  currentRow.push(currentField);
  if (currentRow.some((field) => field.trim() !== '')) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Normalizes the header row for format checks by stripping BOM, lowercasing, and trimming.
 */
function normalizeHeader(headerRow: string[]): string[] {
  return headerRow.map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, '') : header).toLowerCase().trim(),
  );
}

/**
 * Parses a YYYY-MM-DD string into a local-midnight timestamp.
 * Returns null for impossible calendar dates such as 2025-02-30.
 */
function parsePresentlyDate(entryDateStr: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entryDateStr);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const date = new Date(year, month - 1, day);
  const dateMs = date.getTime();

  if (
    !Number.isFinite(dateMs) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return dateMs;
}

/**
 * Opens the document picker to select a Presently CSV file for import.
 * Returns null if the picker is cancelled.
 */
export async function pickPresentlyImportFile(): Promise<DocumentPicker.DocumentPickerSuccessResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: Platform.OS === 'android' ? '*/*' : PRESENTLY_IMPORT_DOCUMENT_TYPES,
    copyToCacheDirectory: true,
  });

  return result.canceled ? null : result;
}

/**
 * Imports entries from a Presently-format CSV file.
 * Only has entryDate (YYYY-MM-DD) and entryContent columns.
 *
 * Uses date + content matching for duplicate detection because
 * the Presently format truncates timestamps to date-only and supports only
 * one entry per day. We intentionally normalize imported Presently entries to
 * local midnight so duplicate detection can compare exact timestamps rather
 * than scanning every entry in the day range.
 *
 * Returns a shared import summary for the imported entries.
 */
export async function importFromPresentlyCSV(
  uri: string,
  onProgress?: ImportProgressCallback,
): Promise<BackupImportSummary> {
  reportImportProgress(onProgress, 'presently', 'reading', 0.1);

  const file = new File(uri);
  const content = await file.text();
  reportImportProgress(onProgress, 'presently', 'reading', 1);

  const rows = parseCSV(content);

  if (rows.length < 2) {
    throw new Error('CSV file is empty or has no data rows');
  }

  const header = normalizeHeader(rows[0]);
  if (!header.includes('entrydate') || !header.includes('entrycontent')) {
    throw new Error('Invalid CSV format: missing entryDate or entryContent columns');
  }

  const dateIndex = header.indexOf('entrydate');
  const contentIndex = header.indexOf('entrycontent');
  const dataRows = rows.slice(1);
  const totalEntries = dataRows.length;
  const summary = createBackupImportSummary();
  let processedEntries = 0;

  const reportEntriesProgress = () => {
    reportImportProgress(
      onProgress,
      'presently',
      'entries',
      totalEntries === 0 ? 1 : processedEntries / Math.max(totalEntries, 1),
      {
        totalEntries,
        processedEntries,
      },
    );
  };

  reportEntriesProgress();

  // TODO: Benchmark duplicate-check latency before optimizing this import path.
  // If Presently imports become slow on larger datasets, preload existing
  // created_at/text_content pairs for the imported dates and add an index on
  // created_at so duplicate detection does not rely on repeated table scans.
  await db.transaction(async (tx) => {
    const advanceProgress = () => {
      processedEntries++;
      reportEntriesProgress();
    };

    for (const row of dataRows) {
      if (row.length <= Math.max(dateIndex, contentIndex)) {
        advanceProgress();
        continue;
      }

      const entryDateStr = row[dateIndex].trim();
      const entryContent = row[contentIndex].trim();
      if (!entryContent) {
        advanceProgress();
        continue;
      }

      // Intentionally use local midnight as the canonical timestamp for
      // Presently imports. This preserves the expected calendar day in the UI
      // and lets duplicate detection target only midnight entries.
      const dateMs = parsePresentlyDate(entryDateStr);
      if (dateMs === null) {
        advanceProgress();
        continue;
      }

      const existing = await tx
        .select({ note_id: entries.note_id })
        .from(entries)
        .where(
          and(eq(entries.created_at, dateMs), eq(entries.text_content, entryContent)),
        )
        .limit(1);

      if (existing.length > 0) {
        summary.skippedEntries++;
        advanceProgress();
        continue;
      }

      const now = Date.now();
      await tx.insert(entries).values({
        note_id: generateUUID(),
        text_content: entryContent,
        created_at: dateMs,
        updated_at: now,
      });

      summary.importedEntries++;
      advanceProgress();
    }
  });

  return summary;
}
