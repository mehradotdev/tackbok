import { requireNativeModule } from 'expo';
import { Directory, File, Paths } from 'expo-file-system';

import type { BaseShadowFileStore } from './types';

interface AtomicFileNativeModule {
  writeAndSync(uri: string, bytes: Uint8Array): Promise<void>;
  replaceAndSync(sourceUri: string, destinationUri: string): Promise<void>;
}

function nativeModule(): AtomicFileNativeModule {
  return requireNativeModule<AtomicFileNativeModule>('AtomicFileModule');
}

function assertBaseName(fileName: string): void {
  if (!/^[a-z0-9.-]+$/.test(fileName) || fileName.includes('..')) {
    throw new Error('Base-shadow filename must be a safe relative basename');
  }
}

/** App-private file adapter for durable base-shadow checkpoints. */
export class ExpoBaseShadowFileStore implements BaseShadowFileStore {
  private readonly directory = new Directory(Paths.document, 'cloud-sync-v2-base');

  constructor() {
    this.directory.create({ intermediates: true, idempotent: true });
  }

  private file(fileName: string): File {
    assertBaseName(fileName);
    return new File(this.directory, fileName);
  }

  async writeTempAndFsync(fileName: string, bytes: Uint8Array): Promise<void> {
    await nativeModule().writeAndSync(this.file(fileName).uri, bytes);
  }

  async read(fileName: string): Promise<Uint8Array> {
    const file = this.file(fileName);
    if (!file.exists) throw new Error('Base-shadow file is missing');
    return file.bytes();
  }

  async replaceAndFsync(tempFileName: string, finalFileName: string): Promise<void> {
    await nativeModule().replaceAndSync(
      this.file(tempFileName).uri,
      this.file(finalFileName).uri,
    );
  }

  async quarantine(fileName: string): Promise<void> {
    const source = this.file(fileName);
    if (!source.exists) return;
    const quarantineName = `quarantine-${Date.now()}-${fileName}`;
    await nativeModule().replaceAndSync(source.uri, this.file(quarantineName).uri);
  }

  async delete(fileName: string): Promise<void> {
    const file = this.file(fileName);
    if (file.exists) file.delete();
  }
}
