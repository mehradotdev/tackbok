import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { IGratitudeDBLog } from '~/types';
import { db, getGratitudeLogs } from '~/database';
import { format } from 'date-fns';

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
 * Converts gratitude logs to CSV format.
 */
function logsToCSV(logs: IGratitudeDBLog[]): string {
  const header = 'entryDate,entryContent';
  const rows = logs.map(
    (log) => `${escapeCSVValue(log.entryDate)},${escapeCSVValue(log.entryContent)}`,
  );
  return [header, ...rows].join('\n');
}

/**
 * Exports all gratitude logs to a CSV file.
 * On Android: Uses Storage Access Framework to show native "Save As" dialog
 * On iOS: Uses share sheet
 */
export async function exportToCSV(): Promise<void> {
  // Fetch all logs from database
  const logs = await getGratitudeLogs();

  if (logs.length === 0) {
    throw new Error('No entries to export');
  }

  // Convert to CSV
  const csvContent = logsToCSV(logs);

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

  await db.withTransactionAsync(async () => {
    for (const row of dataRows) {
      if (row.length > Math.max(dateIndex, contentIndex)) {
        const entryDate = row[dateIndex].trim();
        const entryContent = row[contentIndex].trim();

        // Validate date format (YYYY-MM-DD)
        if (/^\d{4}-\d{2}-\d{2}$/.test(entryDate) && entryContent) {
          await db.runAsync(
            'INSERT OR REPLACE INTO gratitudeLogs (entryDate, entryContent) VALUES (?, ?)',
            [entryDate, entryContent],
          );
          importedCount++;
        }
      }
    }
  });

  return importedCount;
}
