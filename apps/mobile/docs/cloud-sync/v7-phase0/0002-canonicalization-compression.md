# ADR V7-0002: canonical bytes and transfer compression

Status: **proposed for the V7-0 owner gate**  
Date: 2026-08-14

## Identity

```text
canonical payload value
  -> canonical JSON Unicode string
  -> strict UTF-8 bytes (no BOM)
  -> SHA-256
  -> lowercase 64-character snapshot ID
```

The gzip representation is transport/storage encoding only. Its bytes and its
headers do not participate in the snapshot ID. A receiver decompresses with the
bounds in ADR V7-0001 and then verifies the canonical bytes and logical hash.

## Canonical JSON rules

The format is a deliberately small JSON profile rather than an appeal to a
runtime's unspecified object iteration behavior.

1. Values are only `null`, booleans, strings, non-negative safe integers,
   arrays, and plain objects.
2. Object keys are sorted by ascending UTF-16 code units, matching ECMAScript's
   default string comparison and RFC 8785 property ordering. Protocol schema
   keys are ASCII; this rule still fixes behavior for the canonicalizer itself.
3. Arrays preserve their input order. Snapshot-specific arrays must first be
   normalized as listed in ADR V7-0001.
4. Objects have no whitespace and use exactly `:` and `,` separators.
5. Numbers are safe non-negative integers only and are emitted as ordinary
   base-10 digits. `-0`, decimals, exponent-bearing non-integers, unsafe
   integers, `NaN`, and infinities are rejected. Restricting the data model to
   integers removes cross-engine floating-point formatting ambiguity.
6. Strings use JSON escapes for quotation mark, reverse solidus, and U+0000
   through U+001F. Other Unicode scalar values are emitted literally and then
   encoded as UTF-8. `/` is not escaped. Hex digits in `\u00xx` escapes are
   lowercase, as produced by `JSON.stringify`.
7. Authored Unicode is preserved byte-for-byte at the scalar-value level. No
   NFC/NFD normalization, case folding, line-ending conversion, trimming, or
   replacement occurs. Thus `"é"` (U+00E9) and `"e◌́"` (U+0065 U+0301) are
   intentionally different values and hashes.
8. Unpaired UTF-16 surrogates are rejected rather than replaced or encoded.
9. Duplicate JSON object keys are invalid at parse time. A production parser
   must detect them before creating a JavaScript object, because `JSON.parse`
   alone would silently retain the last value.

The frozen proof vectors are in
[`fixtures/canonical-v2.json`](./fixtures/canonical-v2.json). They cover key
ordering, all accepted JSON primitives, integer edges, Arabic/Hebrew/CJK,
emoji and supplementary code points, composed/decomposed accents, CR/LF,
U+2028/U+2029, and invalid numbers/surrogates.

## Compression decision

- Container: gzip (RFC 1952), one member.
- Compressor: DEFLATE level 6, default strategy, 32 KiB window.
- Writer header: `MTIME=0`, no filename/comment/extra fields. Writers normalize
  the OS byte to `255` when their library exposes it.
- Reader: accepts any valid single-member gzip whose decompressed bytes and
  identity pass validation; it rejects concatenated members and trailing data.
- Limits: 16 MiB compressed and 64 MiB output. The output is counted while
  inflating, before JSON allocation.

Deterministic writer bytes are useful for repeatability, but only canonical
uncompressed bytes are a protocol identity. A platform gzip implementation may
legitimately choose a different DEFLATE block layout without creating a new
snapshot.

Gzip was selected because Expo can support it without a custom file format and
Drive stores it as an opaque blob. ZIP was rejected because it adds filenames,
timestamps, central-directory metadata, and multi-member semantics that v2
does not need. Raw SQLite compression was rejected with raw SQLite itself.

## Cross-runtime proof procedure

Each runtime must load the frozen JSON fixture, canonicalize every accepted
value, compare the exact UTF-8 bytes with `canonical`, compute SHA-256, and
compare with `sha256`. It must also reject every negative vector.

- Jest: `bun run v7:phase0:test` (host/Jest evidence).
- Android: run `tools/deviceFixtureProbe.ts` in the beta app's Hermes runtime
  and record only platform, engine, vector counts, and pass/fail.
- iOS: run the same probe in the beta app runtime and record the same redacted
  report.

The fixture contains synthetic text only. Reports never contain fixture bodies,
journal text, identifiers, tokens, email addresses, or Drive data.

The gate may not claim Android or iOS equality based on the host test or on an
emulator of the other platform. Missing device evidence remains visibly open.
