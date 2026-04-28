import { File } from 'expo-file-system';

function resolveFile(fileOrUri: File | string): File {
	return typeof fileOrUri === 'string' ? new File(fileOrUri) : fileOrUri;
}

/**
 * Returns the byte length for an Expo file-like input.
 */
export function getFileByteSize(fileOrUri: File | string): number {
	return resolveFile(fileOrUri).size;
}

/**
 * Reads an exact byte range from an Expo file.
 */
export function readFileBytesRange(
	fileOrUri: File | string,
	offset: number,
	length: number,
): Uint8Array {
	const file = resolveFile(fileOrUri);
	const end = offset + length;

	if (offset < 0 || length < 0 || end > file.size) {
		throw new Error('Requested byte range is outside the file');
	}

	const handle = file.open();
	try {
		handle.offset = offset;
		return handle.readBytes(length);
	} finally {
		handle.close();
	}
}
