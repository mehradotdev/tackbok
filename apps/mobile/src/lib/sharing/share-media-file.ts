import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SharingUnavailableError } from './share-image';

let sharingInFlight = false;
const CLEANUP_DELAY_MS = 60_000;

export class MediaFileMissingError extends Error {}

/** MIME type and iOS UTI per stored extension; unknown types fall back to generic data. */
const MEDIA_TYPES: Record<string, { mimeType: string; UTI: string }> = {
  jpg: { mimeType: 'image/jpeg', UTI: 'public.jpeg' },
  jpeg: { mimeType: 'image/jpeg', UTI: 'public.jpeg' },
  png: { mimeType: 'image/png', UTI: 'public.png' },
  heic: { mimeType: 'image/heic', UTI: 'public.heic' },
  webp: { mimeType: 'image/webp', UTI: 'org.webmproject.webp' },
  m4a: { mimeType: 'audio/mp4', UTI: 'com.apple.m4a-audio' },
  aac: { mimeType: 'audio/aac', UTI: 'public.aac-audio' },
  mp3: { mimeType: 'audio/mpeg', UTI: 'public.mp3' },
  wav: { mimeType: 'audio/wav', UTI: 'com.microsoft.waveform-audio' },
};
const FALLBACK_MEDIA_TYPE = {
  mimeType: 'application/octet-stream',
  UTI: 'public.data',
};

function getExtension(uri: string): string {
  return uri.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase() ?? '';
}

/** Local `YYYYMMDD-HHmmss`, so exported files sort by when they were shared. */
function formatTimestamp(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

type ShareMediaFileOptions = {
  /** Full `file://` URI of a stored photo or voice note. */
  fileUri: string;
  /** Readable name prefix replacing the internal UUID file name, e.g. `tackbok-photo`. */
  filenamePrefix: string;
  dialogTitle: string;
};

/**
 * Opens the system share sheet for a stored media file. The file is copied to
 * the cache under a readable name so the recipient (Files, Photos, AirDrop…)
 * never sees the internal UUID, and the journal's own copy is never handed out.
 */
export async function shareMediaFile({
  fileUri,
  filenamePrefix,
  dialogTitle,
}: ShareMediaFileOptions): Promise<'shared' | 'busy'> {
  if (sharingInFlight) return 'busy';
  sharingInFlight = true;
  let namedFile: File | null = null;

  try {
    if (!(await Sharing.isAvailableAsync())) throw new SharingUnavailableError();

    const source = new File(fileUri);
    if (!source.exists) throw new MediaFileMissingError();

    const extension = getExtension(fileUri);
    const { mimeType, UTI } = MEDIA_TYPES[extension] ?? FALLBACK_MEDIA_TYPE;
    const safePrefix = filenamePrefix.replace(/[^a-zA-Z0-9_-]/g, '-');
    const suffix = extension ? `.${extension}` : '';
    const baseName = `${safePrefix}-${formatTimestamp(new Date())}`;
    // An earlier share from the same second may still be open in another app
    // or awaiting cleanup, so never reuse its file.
    let candidate = new File(Paths.cache, `${baseName}${suffix}`);
    for (let n = 2; candidate.exists; n++) {
      candidate = new File(Paths.cache, `${baseName}-${n}${suffix}`);
    }
    namedFile = candidate;
    await source.copy(namedFile);

    await Sharing.shareAsync(namedFile.uri, { mimeType, UTI, dialogTitle });

    const cleanupFile = namedFile;
    namedFile = null;
    setTimeout(() => {
      try {
        if (cleanupFile.exists) cleanupFile.delete();
      } catch {
        // The OS cache remains the final cleanup fallback.
      }
    }, CLEANUP_DELAY_MS);
    return 'shared';
  } catch (error) {
    try {
      if (namedFile?.exists) namedFile.delete();
    } catch {
      // Best-effort cleanup only.
    }
    throw error;
  } finally {
    sharingInFlight = false;
  }
}
