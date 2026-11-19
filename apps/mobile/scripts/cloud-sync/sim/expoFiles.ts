/**
 * A small `expo-file-system` stand-in backed by real files under one temp
 * directory: what the ZIP adapters, the backup import and backup history
 * use (File, Directory, Paths, sync file handles). Install it with
 * `mock.module('expo-file-system', () => expoFiles(root))`.
 */
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

const pathOf = (uri: string) => (uri.startsWith('file://') ? uri.slice(7) : uri);

export function expoFiles(root: string) {
  type Part = string | { uri: string };
  const joined = (parts: Part[]) =>
    join(...parts.map((part) => pathOf(typeof part === 'string' ? part : part.uri)));

  class Directory {
    readonly uri: string;
    constructor(...parts: Part[]) {
      this.uri = `file://${joined(parts)}`;
    }
    get exists() {
      return existsSync(pathOf(this.uri));
    }
    create() {
      mkdirSync(pathOf(this.uri), { recursive: true });
    }
    delete() {
      rmSync(pathOf(this.uri), { recursive: true, force: true });
    }
  }

  class File {
    uri: string;
    constructor(...parts: Part[]) {
      this.uri = `file://${joined(parts)}`;
    }
    get exists() {
      return existsSync(pathOf(this.uri));
    }
    get size() {
      return statSync(pathOf(this.uri)).size;
    }
    create() {
      mkdirSync(dirname(pathOf(this.uri)), { recursive: true });
      writeFileSync(pathOf(this.uri), new Uint8Array(0));
    }
    delete() {
      rmSync(pathOf(this.uri), { force: true });
    }
    writeSync(bytes: Uint8Array | string) {
      mkdirSync(dirname(pathOf(this.uri)), { recursive: true });
      writeFileSync(pathOf(this.uri), bytes);
    }
    async move(destination: { uri: string }) {
      renameSync(pathOf(this.uri), pathOf(destination.uri));
      this.uri = destination.uri;
    }
    open() {
      const fd = openSync(pathOf(this.uri), 'r+');
      return {
        offset: 0,
        get size() {
          return fstatSync(fd).size;
        },
        readBytesSync(length: number) {
          const buffer = new Uint8Array(length);
          const read = readSync(fd, buffer, 0, length, this.offset);
          this.offset += read;
          return buffer.subarray(0, read);
        },
        writeBytesSync(bytes: Uint8Array) {
          const written = writeSync(fd, bytes, 0, bytes.byteLength, this.offset);
          this.offset += written;
        },
        close() {
          closeSync(fd);
        },
      };
    }
  }

  return {
    File,
    Directory,
    Paths: {
      cache: new Directory(root, 'cache'),
      document: new Directory(root, 'document'),
    },
  };
}
