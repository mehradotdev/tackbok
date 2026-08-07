import type React from 'react';
import type { View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

let sharingInFlight = false;
const CLEANUP_DELAY_MS = 60_000;

export class SharingUnavailableError extends Error {}
export class ShareNotReadyError extends Error {}

export async function isNativeSharingAvailable(): Promise<boolean> {
  return Sharing.isAvailableAsync();
}

type ShareViewAsPngOptions = {
  ref: React.RefObject<View | null>;
  dialogTitle: string;
  filenamePrefix: string;
  width: number;
  height: number;
  isReady: boolean;
  beforePresentShareSheet?: () => Promise<void>;
};

export async function shareViewAsPng({
  ref,
  dialogTitle,
  filenamePrefix,
  width,
  height,
  isReady,
  beforePresentShareSheet,
}: ShareViewAsPngOptions): Promise<'shared' | 'busy'> {
  if (sharingInFlight) return 'busy';
  if (!isReady || !ref.current) throw new ShareNotReadyError();
  sharingInFlight = true;
  let capturedFile: File | null = null;
  let namedFile: File | null = null;

  try {
    if (!(await Sharing.isAvailableAsync())) throw new SharingUnavailableError();

    const capturedUri = await captureRef(ref, {
      format: 'png',
      result: 'tmpfile',
      width,
      height,
      quality: 1,
    });
    capturedFile = new File(capturedUri);

    // Both files live in app-local cache, so this is a rename rather than a
    // multi-megabyte copy inside the user-visible tap-to-share-sheet latency.
    const safePrefix = filenamePrefix.replace(/[^a-zA-Z0-9_-]/g, '-');
    namedFile = new File(Paths.cache, `${safePrefix}-${Date.now()}.png`);
    await capturedFile.move(namedFile);
    capturedFile = null;

    await beforePresentShareSheet?.();

    await Sharing.shareAsync(namedFile.uri, {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle,
    });

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
      if (capturedFile?.exists) capturedFile.delete();
      if (namedFile?.exists) namedFile.delete();
    } catch {
      // Best-effort cleanup only.
    }
    throw error;
  } finally {
    sharingInFlight = false;
  }
}
