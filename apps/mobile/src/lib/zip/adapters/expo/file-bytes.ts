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
