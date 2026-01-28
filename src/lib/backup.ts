import { Platform } from 'react-native';
import { format } from 'date-fns';
import { desc } from 'drizzle-orm';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy'; // TODO: Migrate from legacy FileSystem
import { db, entries, type Entry } from '~/db';
import { generateUUID } from '~/lib/utils';

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
      if (char === '"') {
        // Start of quoted field
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
 * Converts entries to CSV format.
 * Maintains backward compatibility with old format (entryDate, entryContent)
 */
function entriesToCSV(allEntries: Entry[]): string {
  const header = 'entryDate,entryContent';
  const rows = allEntries.map((entry) => {
    // Convert timestamp to YYYY-MM-DD format for CSV
    const dateStr = format(new Date(entry.created_at), 'yyyy-MM-dd');
    const content = entry.text_content || '';
    return `${escapeCSVValue(dateStr)},${escapeCSVValue(content)}`;
  });
  return [header, ...rows].join('\n');
}

/**
 * Exports all entries to a CSV file.
 * On Android: Uses Storage Access Framework to show native "Save As" dialog
 * On iOS: Uses share sheet
 */
export async function exportToCSV(): Promise<void> {
  // Fetch all entries from database
  const allEntries = await db.select().from(entries).orderBy(desc(entries.created_at));

  if (allEntries.length === 0) {
    throw new Error('No entries to export');
  }

  // Convert to CSV
  const csvContent = entriesToCSV(allEntries);

  // Generate filename with timestamp
  const timestamp = generateTimestamp();
  const fileName = `TackbokBackup${timestamp}.csv`;

  if (Platform.OS === 'android') {
    // Android: Use Storage Access Framework for direct save
    const permissions =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

    if (!permissions.granted) {
      throw new Error('Storage permission denied');
    }

    // Create file in the selected directory
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      fileName,
      'text/csv',
    );

    // Write content to the file
    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } else {
    // iOS: Use share sheet
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Sharing is not available on this device');
    }

    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

    // Write to temp file
    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Open share sheet
    try {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Gratitude Entries',
        UTI: 'public.comma-separated-values-text',
      });
    } finally {
      // Best‑effort cleanup of the temp file
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    }
  }
}

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

/**
 * Imports entries from a CSV file into the database.
 * Uses INSERT OR REPLACE to handle existing entries.
 * Returns the number of entries imported.
 */
export async function importFromCSV(uri: string): Promise<number> {
  // Read file content
  const content = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  // Parse CSV content (handles multi-line content in quoted fields)
  const rows = parseCSV(content);

  if (rows.length < 2) {
    throw new Error('CSV file is empty or has no data rows');
  }

  // Check header
  // Strip UTF-8 BOM from first cell if present (Excel and some tools add this)
  const header = rows[0].map((h, idx) =>
    (idx === 0 ? h.replace(/^\uFEFF/, '') : h).toLowerCase().trim(),
  );
  if (!header.includes('entrydate') || !header.includes('entrycontent')) {
    throw new Error('Invalid CSV format: missing entryDate or entryContent columns');
  }

  // Find column indices
  const dateIndex = header.indexOf('entrydate');
  const contentIndex = header.indexOf('entrycontent');

  // Parse data rows (skip header)
  const dataRows = rows.slice(1);
  let importedCount = 0;

  // Import entries using Drizzle
  for (const row of dataRows) {
    if (row.length > Math.max(dateIndex, contentIndex)) {
      const entryDateStr = row[dateIndex].trim();
      const entryContent = row[contentIndex].trim();

      // Validate date format (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(entryDateStr) && entryContent) {
        // Convert date string to timestamp (start of day)
        const dateMs = new Date(entryDateStr + 'T00:00:00').getTime();
        const now = Date.now();

        await db
          .insert(entries)
          .values({
            note_id: generateUUID(),
            text_content: entryContent,
            created_at: dateMs,
            updated_at: now,
          })
          .onConflictDoNothing(); // Skip if duplicate

        importedCount++;
      }
    }
  }

  return importedCount;
}
