import { File } from 'expo-file-system';
import { toSafeNumber } from '../../core';
import { getFileByteSize, readFileBytesRange } from './file-bytes';
import type { ZipReaderSource } from '../../reader/random-access-reader';

/**
 * Adapts Expo FileSystem files into the ZIP random-access reader contract.
 */
export function createExpoZipReaderSource(
	fileOrUri: File | string,
): ZipReaderSource {
	const file = typeof fileOrUri === 'string' ? new File(fileOrUri) : fileOrUri;
	const fileSize = getFileByteSize(file);

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

			return readFileBytesRange(file, start, length);
		},
	};
}
