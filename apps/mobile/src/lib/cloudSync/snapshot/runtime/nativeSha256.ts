import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { hexDigestHasher } from '../sha256';

/**
 * Native SHA-256 for media bytes already in memory. The pure-JS hash froze the
 * Android JS thread for 11-22 s per ~600 kB photo; the native digest takes ms.
 */
export const nativeSha256Bytes = hexDigestHasher((bytes) =>
  // Upload and download buffers are never backed by a SharedArrayBuffer.
  digest(CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>),
);
