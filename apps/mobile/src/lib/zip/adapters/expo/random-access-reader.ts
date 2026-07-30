import { File, type FileHandle } from 'expo-file-system';
import { toSafeNumber } from '../../core';
import { getFileByteSize } from './file-bytes';
import type { ZipReaderSource } from '../../reader/random-access-reader';

/**
 * Adapts Expo FileSystem files into the ZIP random-access reader contract.
 *
 * One file handle is opened lazily and reused across reads — imports issue
 * several reads per entry, and opening a native handle per read is measurable
 * overhead on archives with many entries. The handle is released by close(),
 * which openZipReader/ZipReader.close() always invoke, including on failure.
 */
export function createExpoZipReaderSource(
	fileOrUri: File | string,
): ZipReaderSource {
	const file = typeof fileOrUri === 'string' ? new File(fileOrUri) : fileOrUri;
	const fileSize = getFileByteSize(file);
	let handle: FileHandle | null = null;

	return {
		async size(): Promise<bigint> {
			return BigInt(fileSize);
		},
		async read(offset: bigint, length: number): Promise<Uint8Array> {
			if (length < 0) {
				throw new Error('ZIP read length must not be negative');
			}

			const start = toSafeNumber(offset, 'ZIP read offset');
			const end = start + length;
			if (start < 0 || end > fileSize) {
				throw new Error('Invalid ZIP archive: requested byte range is outside the file');
			}

			handle ??= file.open();
			handle.offset = start;
			return handle.readBytes(length);
		},
		async close(): Promise<void> {
			if (handle) {
				const openHandle = handle;
				handle = null;
				openHandle.close();
			}
		},
	};
}
