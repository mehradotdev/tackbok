# Phase V7-0 gate

Status: **CLOSED at owner review 2026-08-14** — see
[`review-2026-08-14.md`](./review-2026-08-14.md). §18.5/§18.6/§18.10 are
closed under the owner's delegated approval. One obligation (V1: durable,
re-runnable device fixture probe) carries into V7-1.

Updated: 2026-08-14

A checked item names executed evidence. Design completion does not substitute
for platform execution or owner approval.

## Delivered design

- [x] Exact snapshot-v2 schema, normalized ordering, referential invariants,
  validation order, and candidate cap table are recorded in
  [`0001-snapshot-v2.md`](./0001-snapshot-v2.md).
- [x] Integer serialization, UTF-16 object-key ordering, authored Unicode byte
  preservation, gzip identity boundary, and decompression bounds are recorded
  in [`0002-canonicalization-compression.md`](./0002-canonicalization-compression.md).
- [x] Every scalar, relation, asset descriptor, tombstone, delete/edit, and
  base-unavailable rule is enumerated in
  [`0003-merge-rules.md`](./0003-merge-rules.md).
- [x] Synthetic base/local/remote golden cases and expected outcomes exist at
  [`fixtures/merge-golden-v2.json`](./fixtures/merge-golden-v2.json).
- [x] Every defined **Attention needed** pause has a visible recovery action in
  [`0004-pause-recovery.md`](./0004-pause-recovery.md).
- [x] Base-shadow format 1, atomic replacement, upgrade rule, and conservative
  unreadable-base fallback are recorded in
  [`0005-base-shadow.md`](./0005-base-shadow.md).
- [x] Quiet, one-edit, 2,000-entry import, and fresh-restore request models and
  candidate ceilings are recorded in
  [`0006-drive-request-budget.md`](./0006-drive-request-budget.md).

## Executed evidence

- [x] Host Jest ran 24 tests covering 8 accepted canonical byte/hash vectors,
  11 rejection vectors, 8 complete merge outputs, and deterministic conflict
  IDs: command `bun run v7:phase0:test`, report
  [`evidence/2026-08-14-host-jest.json`](./evidence/2026-08-14-host-jest.json).
- [x] Android API 36.1 emulator/Hermes reproduced all 8 accepted byte/hash
  vectors and rejected all 11 invalid vectors through the beta app runtime:
  [`evidence/2026-08-14-android-api36-canonical.json`](./evidence/2026-08-14-android-api36-canonical.json).
  **Owner review: attested, not verified** — the temporary import was removed
  after capture, so this run cannot be re-executed (finding V1).
- [x] iOS 26.5 simulator/Hermes reproduced all 8 accepted byte/hash vectors and
  rejected all 11 invalid vectors through the beta app runtime:
  [`evidence/2026-08-14-ios-simulator-canonical.json`](./evidence/2026-08-14-ios-simulator-canonical.json).
  **Owner review: attested, not verified** — same V1 qualification.
- [x] A deterministic synthetic 2,000-entry snapshot was measured on the host:
  2,329,562 canonical bytes, 307,027 gzip bytes, 15.68 ms encode, 24.62 ms gzip,
  16.53 ms gunzip/parse/recanonicalize. Report:
  [`measurements/2026-08-14-host-2000.json`](./measurements/2026-08-14-host-2000.json).
- [x] A deterministic synthetic 10,000-entry snapshot was measured on the host:
  11,631,139 canonical bytes, 1,518,981 gzip bytes (1.449 MiB), 84.19 ms encode,
  123.42 ms gzip, 86.42 ms gunzip/parse/recanonicalize. Report:
  [`measurements/2026-08-14-host-10000.json`](./measurements/2026-08-14-host-10000.json).
- [x] The 10,000-entry compressed result is comfortably below the proposed
  16 MiB cap (9.1%), supporting metadata transfer on a permitted non-Wi-Fi
  network. This is a size conclusion, not a physical-device performance claim.
- [x] TypeScript passed with `bun x tsc --noEmit` on 2026-08-14.
- [x] Scope audit shows only `docs/cloud-sync/v7-phase0/` and non-production
  package scripts changed. No file below `src/lib/cloudSync/protocol/`,
  `src/lib/cloudSync/phase0/`, or `src/lib/cloudSync/phase3/` changed.

## Measurement qualifications

- Host RSS/retained heap is recorded but is not Hermes transient peak memory.
- No Android or iOS encode/decode time or memory is claimed; the device runs in
  this phase prove only canonical bytes/rejections/hashes.
- The ~10,000-entry fixture includes 1,000 media descriptors but no media bytes,
  which matches protocol v2's separation of metadata and blobs.
- Drive request counts are a model to enforce in V7-3, not real-Drive evidence.

## Owner closure

- [x] Plan-v7 §18.5: **approved at owner review 2026-08-14.** The 16 MiB
  compressed / 64 MiB uncompressed envelope and the ADR V7-0001 cap table are
  the protocol-v2 candidate limits; the measured 10,000-entry journal sits at
  9.1% of the compressed cap.
- [x] Plan-v7 §18.6: **approved at owner review 2026-08-14.** The ADR V7-0003
  merge table and frozen golden catalog are binding for V7-1; fixtures change
  only via a recorded ADR amendment with owner sign-off, never to make code
  pass.
- [x] Plan-v7 §18.10: **approved at owner review 2026-08-14.** The ADR V7-0006
  logical-request ceilings and the candidate device targets in
  `measurements/README.md` are the numeric targets the V7-3 and V7-5 gates
  must meet or formally reopen.

## Owner-review non-claims

- The Android and iOS canonical-vector runs are attested by the implementing
  agent but cannot be re-executed from the repository (finding V1 in
  [`review-2026-08-14.md`](./review-2026-08-14.md)). V7-1 must make the probe
  durable behind the `__DEV__` dev-diagnostics route and re-capture both
  reports before its gate relies on cross-runtime determinism.
- Host timings and memory numbers close nothing about physical devices; the
  §18.10 device targets are proven or reopened in V7-5.

## Exit rule (resolved)

Closed 2026-08-14: both platform fixture reports recorded (with the V1
qualification above), all three owner decisions approved. V7-1 is authorized.
No production code may switch to protocol v2 before the V7-1..V7-4 gates pass.
