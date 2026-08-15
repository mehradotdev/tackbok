# Phase V7-4 — production runtime and UI replacement

Phase V7-4 connects protocol v2 to the production normalized journal, keeps
protocol v1 available for already-configured alpha vaults, and migrates new
Google Drive connections and the Cloud Backup & Sync UI to snapshot sync.

Start with [`gate.md`](./gate.md); the owner review is
[`review-2026-08-15.md`](./review-2026-08-15.md). The phase is **closed**:
host claims were verified at owner review and the four interactive acceptance
checks passed on the owner's API-36 emulator Debug build with the disposable
account on 2026-08-15. Host evidence is in
[`evidence/2026-08-15-host-tests.json`](./evidence/2026-08-15-host-tests.json).

Important implementation entry points:

- `src/lib/cloudSync/v2/storage/productionJournal.ts` — complete normalized
  snapshot capture/apply, retained-media bookkeeping, and pending-media
  hydration;
- `src/lib/cloudSync/v2/runtime/productionEngine.ts` — production v2 engine,
  Wi-Fi media policy, bounded hashing/hydration, and coarse analytics;
- `src/lib/cloudSync/runtime/production.ts` — protocol-selective v1/v2 runtime
  construction;
- `src/lib/cloudSync/ui/production.ts` and
  `src/screens/cloudBackup/index.tsx` — v2 setup, restore, status, conflicts,
  revocation, and localized Attention actions;
- migration `0010_mysterious_eternals.sql` — v2 tombstones, exact conflict
  envelopes, and entry recovery provenance.

V7-5 remains responsible for protocol-v1 retirement, physical-device evidence,
iOS `F_FULLFSYNC`, and real large-media transfer.
