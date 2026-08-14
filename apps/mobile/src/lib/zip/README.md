# ZIP Module Architecture

This folder is organized as if it were already split into publishable packages.

It exposes two usage modes:

- scalable file-backed ZIP access for real app flows
- explicit in-memory ZIP helpers for tests and small archives

For most app code, prefer the top-level facade from `~/lib/zip`.

## Why This ZIP Library Exists

This ZIP module is intentionally custom and self-contained.

Its goals are:

- support app backups without pulling in a large third-party ZIP dependency
- offer both in-memory helpers and scalable ZIP APIs in one consistent surface
- support ZIP64 metadata so backup archives are not limited by classic ZIP 16-bit and 32-bit fields
- keep the pure ZIP implementation separate from Expo-specific file adapters

If this code is extracted into a standalone package later, the intended value proposition is:

- in-memory APIs for small archives and tests
- lazy random-access reads for larger archives
- sequential ZIP writing for file-backed exports
- ZIP64-aware parsing and writing
- no third-party ZIP codec dependency in `core/`, `reader/`, or `writer/`

## Verified Features

- Supports two read modes:
	- eager in-memory reads via `parseZipArchive(bytes)`
	- lazy random-access reads via `openZipReader(reader)`
- Supports two write modes:
	- eager in-memory archive building via `createMemoryZipWriter()`
	- sequential sink-based writing via `createZipWriter(sink)`
- Supports Expo file adapters for backup-style mobile workflows:
	- `createExpoZipReaderSource(fileOrUri)`
	- `createExpoZipWriter(fileOrUri)`
- Supports ZIP64 metadata for reading and writing:
	- ZIP64 central directory values
	- ZIP64 EOCD records and locator records
	- ZIP64 offsets, entry counts, and sizes when classic ZIP fields overflow
- Supports classic stored entries and DEFLATE-compressed entries
- Supports deterministic, single-member RFC 1952 gzip encoding and strict
  bounded decoding through `encodeGzip()` and `decodeGzipBounded()`
- Supports full UTF-8 ZIP entry filename handling, including emoji and other non-BMP code points
- Keeps entry payload reads lazy on the scalable read path
- Avoids loading the entire archive into memory when using the random-access reader
- Avoids building one giant output buffer when using the sequential writer

## Verified Limitations

- No encryption support
- No multi-disk ZIP archive support
- No compression methods beyond:
	- store
	- deflate
- No tar, tar.gz archive workflow, 7z, or LZMA support
- Gzip support is intentionally an in-memory single-member codec; it is not a
  multi-member or file-streaming API
- No true streaming decompression API yet:
	- `openZipReader` reads metadata lazily
	- `readEntryBytes()` still materializes the requested entry in memory
- In-memory APIs are intentionally bounded:
	- they are for tests and smaller archives
	- very large entries or archives are rejected with guidance to use the scalable APIs instead

## Dependency Notes

- `core/`, `reader/`, and `writer/` do not rely on a third-party ZIP library
- `adapters/expo/` depends on Expo FileSystem because it bridges the pure ZIP APIs to file-backed mobile usage

## Core Folder Structure

Current `core/` files and responsibilities:

- `byte-io.ts`: Low-level little-endian field read/write and ZIP64 bigint range guards.
- `filename-codec.ts`: ZIP filename encoding/decoding (IBM CP437 fallback + UTF-8 read/write helpers).
- `zip-constants.ts`: All ZIP and ZIP64 signatures, flags, method IDs, versions, and sentinel max values.
- `zip-parser.ts`: Binary parsers for EOCD/ZIP64 EOCD, central directory entries, ZIP64 extras, and local file headers.
- `archive-bytes-reader.ts`: In-memory materialization path that maps parsed metadata to decoded entry payloads.
- `archive-bytes-writer.ts`: In-memory archive serializer that builds local headers, central directory, and EOCD records.
- `deflate-codec.ts`: Pure DEFLATE encode/decode implementation used by ZIP read/write paths.
- `crc32.ts`: CRC32 checksum implementation for ZIP entry integrity fields.
- `gzip-codec.ts`: Deterministic single-member gzip framing and bounded,
  strict gzip validation over the shared DEFLATE/CRC32 primitives.
- `types.ts`: Public ZIP core types shared across modules.
- `index.ts`: Core facade exports used by higher layers and tests.
- `core-safety.test.ts`: Regression tests for low-level numeric/bitstream safety guarantees.

Why this structure helps:

- each file has one clear reason to change
- easier targeted tests and code review
- less accidental coupling between constants/parsers/codec internals
- safer future extraction into standalone packages

## Terminology

### Lazy Random-Access Reader

The scalable read path in this library is a lazy random-access reader.

That means:

- it reads ZIP metadata first
- it does not materialize every entry up front
- it reads entry payload bytes only when a specific entry is requested

In this library, that API is `openZipReader(source)`.

This is different from a fully in-memory parse like `parseZipArchive(bytes)`, which eagerly loads all entries.

### True Streaming Decompression

True streaming decompression would decode one ZIP entry incrementally and emit decompressed output in chunks instead of returning one full `Uint8Array`.

That kind of API would typically:

- expose an async iterable or stream of decompressed chunks
- write decompressed output directly to a sink or file
- avoid holding the full decompressed entry in memory at once

This library does not have that yet.

Current behavior:

- `openZipReader(reader)` is lazy for metadata and compressed entry access
- `readEntryBytes()` still materializes the requested decompressed entry in memory

### True Streaming Compression

True streaming compression means an entry can be compressed while input chunks are arriving, without first buffering the whole entry in memory.

This library partially supports streaming writes:

- `createZipWriter(sink)` writes the archive sequentially
- `addStored(path, source)` is truly streaming for stored entries because it writes chunks directly without compressing them first

But it is not fully streaming for DEFLATE-compressed entry input yet:

- `addBytes()` and `addText()` still compress in memory before writing

### Store vs Deflate

ZIP calls both of these compression methods:

- `store`: method 0, meaning no compression
- `deflate`: method 8, meaning DEFLATE compression

So when this README says the library supports store and deflate, it means:

- entries can be written uncompressed
- entries can be written using DEFLATE compression

No other ZIP compression methods are currently supported.

### In-Memory Bounds

The in-memory APIs intentionally reject very large allocations.

Current implementation limits:

- max in-memory decoded entry size: `0x7fffffff` bytes (2,147,483,647 bytes, about 2,147.48 MB / 2.15 GB, about 2.00 GiB)
- max in-memory encoded archive size: `0x7fffffff` bytes (2,147,483,647 bytes, about 2,147.48 MB / 2.15 GB, about 2.00 GiB)

These are implementation safeguards, not ZIP format limits.

In practice, larger archives should use the scalable APIs instead of raising these in-memory limits.

## Layers

- `core/`: Pure ZIP codec and binary structure utilities. No Expo dependencies.
- `reader/`: Read-side APIs for in-memory and random-access ZIP reading.
- `writer/`: Write-side APIs for in-memory and sequential ZIP generation.
- `adapters/expo/`: Expo FileSystem adapters for random-access reads and file-backed writes.

## Dependency Direction

- `core` -> no dependencies on higher layers
- `reader` / `writer` -> may depend on `core`
- `adapters/expo` -> may depend on `reader` and `writer`
- app code -> should import from `src/lib/zip` facade whenever possible

## Extraction Plan

The current structure maps directly to future packages:

- `core` -> `@tackbok/zip-core`
- `reader` + `writer` -> `@tackbok/zip-streaming`
- `adapters/expo` -> `@tackbok/zip-expo`

## Public API

### Recommended default APIs

- `openZipReader(reader)`
- `createZipWriter(sink)`
- `createExpoZipWriter(fileOrUri)`
- `createExpoZipReaderSource(fileOrUri)`
- `encodeGzip(bytes)` for bounded in-memory transfer payloads
- `decodeGzipBounded(bytes, limits)` for strict single-member decoding

These are the APIs to prefer for real backup import/export flows because they avoid loading the entire archive into memory.

### Explicit in-memory APIs

- `parseZipArchive(bytes)`
- `createMemoryZipWriter()`
- `readZipEntryBytes()`
- `readZipEntryText()`
- `readZipEntryJson()`

These are still useful for tests, fixtures, tiny archives, and cases where the ZIP already exists as a `Uint8Array`.

They are deliberately **not** exported from the top-level `~/lib/zip` facade, so app code cannot grow accidental dependencies on them. Import them directly from their modules instead:

- `~/lib/zip/reader/memory-reader`
- `~/lib/zip/writer/memory-writer`

Ownership is explicit by layer:

- in-memory reader helpers live under `reader/memory-reader`
- in-memory writer helpers live under `writer/memory-writer`

These wrappers are intentionally different from `core/archive-bytes-reader.ts` and `core/archive-bytes-writer.ts`:

- `core/archive-bytes-reader.ts` and `core/archive-bytes-writer.ts` are low-level codec engines.
	- they parse/serialize ZIP binary structures
	- they do not provide app-facing ergonomics, cloning policy, or error normalization
- `reader/memory-reader.ts` and `writer/memory-writer.ts` are app-facing convenience wrappers.
	- they expose stable APIs (`parseZipArchive`, `createMemoryZipWriter`)
	- they apply defensive copying and normalized error messages
	- they encode/decode text and keep call sites independent from core internals

In short: `core/*` does the binary ZIP work; `memory-*` provides the developer-friendly in-memory API layer.

## Reader Types

### `ZipReader`

`ZipReader` is the scalable read path.

Characteristics:

- reads the central directory first
- keeps ZIP metadata in memory
- reads entry payloads only when requested
- works well for larger backups and media-heavy archives
- requires a `ZipReaderSource`

Use it when:

- opening a ZIP file from disk
- importing backups
- reading only a few files from a larger archive

### `ZipArchive`

`ZipArchive` is the in-memory read path returned by `parseZipArchive`.

Characteristics:

- materializes all entries up front
- simple synchronous API after parse
- best for tests and small byte-array archives

Use it when:

- the ZIP is already loaded into memory
- you want the simplest possible test setup
- the archive is small enough that eager materialization is acceptable
- you need deterministic in-memory assertions in tests

## Writer Types

### `ZipWriter`

`ZipWriter` is the scalable write path created by `createZipWriter`.

Characteristics:

- writes sequentially to a sink
- does not need one large output buffer
- ideal for archive export and large media payloads

Use it when:

- generating ZIPs directly to a file or output sink
- exporting larger backups
- adding large assets incrementally

### `MemoryZipWriter`

`MemoryZipWriter` is the in-memory write path created by `createMemoryZipWriter`.

Characteristics:

- accumulates entries in memory
- produces one final `Uint8Array` via `toBytes()`
- best for tests and small generated archives

Use it when:

- building a small ZIP entirely in memory
- writing tests around ZIP contents
- you explicitly need the final bytes in one buffer
- you want an in-memory writer without any file/sink adapter setup

## Expo Adapters

The Expo adapter layer bridges the pure ZIP logic to file-backed mobile flows.

Main entry points:

- `createExpoZipReaderSource(fileOrUri)`
- `createExpoZipWriter(fileOrUri)`

These are the preferred adapters for app code in this repo.

`createExpoZipWriter(fileOrUri)` returns an `ExpoZipWriter`, which includes the
standard writer methods:

- `addText(path, text)`
- `addBytes(path, bytes, noCompress?)`
- `addStored(path, source)`

It also adds the Expo-specific helper:

- `addFile(path: string, fileOrUri: File | string): Promise<void>`

`addFile()` is implemented in
`adapters/expo/file-zip-writer.ts` and lets app code write an existing Expo
`File` or file URI directly into the ZIP without first materializing the whole
payload as a `Uint8Array`.

## Sample Usage

### Read a ZIP file via random-access from disk

```ts
import { createExpoZipReaderSource, openZipReader } from '~/lib/zip';

const source = createExpoZipReaderSource(fileUri);
const zip = await openZipReader(source);

const manifest = await zip.readEntryJson<{ format: string }>('manifest.json');
const photoBytes = await zip.readEntryBytes('backup-media/photos/image-1.jpg');

await zip.close();
```

Why use this path:

- avoids parsing every entry payload up front
- better for larger archives
- matches real import flows in the app

### Write a ZIP file directly to disk

```ts
import { File, Paths } from 'expo-file-system';
import { createExpoZipWriter } from '~/lib/zip';

const outputFile = new File(Paths.cache, 'backup.zip');
const zip = createExpoZipWriter(outputFile);

await zip.addText('manifest.json', JSON.stringify({ format: 'demo' }, null, 2));
await zip.addFile('media/photo.jpg', sourcePhotoFile);

await zip.close();
```

Why use this path:

- avoids building one large ZIP buffer in memory
- ideal for backup export
- supports large assets cleanly

### Build a small ZIP in memory

```ts
import { createMemoryZipWriter } from '~/lib/zip/writer/memory-writer';

const zip = createMemoryZipWriter();
zip.addText('manifest.json', JSON.stringify({ ok: true }));
zip.addBytes('notes/entry.txt', new TextEncoder().encode('hello'));

const zipBytes = zip.toBytes();
```

Why use this path:

- very simple for tests
- good when the whole archive is intentionally tiny
- easy to pass around as a single `Uint8Array`

### Parse a small ZIP already loaded into memory

```ts
import {
  parseZipArchive,
  readZipEntryJson,
  readZipEntryText,
} from '~/lib/zip/reader/memory-reader';

const archive = parseZipArchive(zipBytes);
const manifest = readZipEntryJson<{ ok: boolean }>(archive, 'manifest.json');
const note = readZipEntryText(archive, 'notes/entry.txt');
```

Why use this path:

- simplest API once bytes are already in memory
- useful for tests and fixtures

## Which API Should I Use?

Use `openZipReader` when reading a ZIP file from disk.

Use `createExpoZipWriter` when exporting a ZIP file to disk.

Use `createMemoryZipWriter` when building a small ZIP in memory.

Use `parseZipArchive` when you already have ZIP bytes in memory and the archive is small.

## Design Notes

- The top-level facade exposes only the scalable path; the explicit in-memory helpers are imported from their own modules (tests and fixtures only).
- `core/` is intentionally platform-agnostic so it can be extracted later without Expo code.
- `adapters/expo/` is intentionally thin so file-backed behavior stays outside the pure ZIP logic.
