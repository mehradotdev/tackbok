# Phase V7-5 — device hardening and v6 retirement

Phase V7-5 is deliberately split because its final deletion depends on evidence
that only the owner can produce. The binding order is:

1. **Bundle (a), host preparation:** X3 durability, dependency audit,
   rollout/kill switch, synthetic device fixtures, redacted evidence tooling,
   and runnable owner checklists.
2. **Bundle (b1), emulator/simulator evidence:** exercise what virtual devices
   can genuinely falsify, including the 200 MiB v2 boundary.
3. **Bundle (b2), hardware remainder:** explicitly waived during development
   but merge-blocking for store submission.
4. **Bundle (c1), disposable purge:** use the reviewed v1 delete path after b1.
5. **Bundle (c2), retirement:** remove v1 production code in a separate review
   only after Z1 and the b1 large-media obligation are closed.

The development phase is not closed until a/b1/c1/c2 pass; b2 remains a store-
submission blocker. Bundle (a) does not claim
physical-device, release-build, Drive-transfer, power-loss, background, or
memory evidence.

Bundle b1 has partial physical Debug evidence for
[`finding 0001`](./findings/0001-v2-large-media-whole-buffer-oom.md): the
pre-remediation v2 upload materialized the full 200 MiB file and failed on the
API-36 emulator. The replacement passed real-Drive upload and download
interruption/resume, fresh restore, and frozen-hash verification on a physical
Android API-33 device. The owner accepted that transport evidence and moved the
untested Wi-Fi-only behavior to the store-submission gate in
[`wifi-only-media-waiver.md`](./wifi-only-media-waiver.md). Bundle c1 is now
authorized; retirement remains sequenced after c1 and must be a separate
reviewed diff.

## Start here

- [`gate.md`](./gate.md) — evidence state and non-claims.
- [`v1-dependency-audit.md`](./v1-dependency-audit.md) — current production
  reachability and the retirement boundary.
- [`rollout-and-kill-switch.md`](./rollout-and-kill-switch.md) — channel modes,
  activation semantics, and rollback invariant.
- [`device-round-checklist.md`](./device-round-checklist.md) — owner-run Android
  and iOS procedure.
- [`wifi-only-media-waiver.md`](./wifi-only-media-waiver.md) — narrow owner
  disposition moving the unexecuted policy check to store submission.
- [`v1-purge-retirement-checklist.md`](./v1-purge-retirement-checklist.md) —
  sequenced but deliberately not executable until device evidence is accepted.
- [`templates/`](./templates/) — non-evidence report templates. A report enters
  `evidence/` only through the finalizing validator.

## Commands

From `apps/mobile`:

```sh
bun run v7:phase5a:test
bun run v7:phase5:audit-v1
bun run v7:phase5:generate-journal-fixture -- 10000 /tmp/tackbok-v7-10k.csv
bun run v7:phase5:generate-media-fixture -- /tmp/tackbok-v7-200mib.bin
bun run v7:phase5:validate-device-evidence -- validate-template \
  docs/cloud-sync/v7-phase5/templates/android-emulator-evidence.example.json
```

Final owner evidence is written atomically only after validation:

```sh
bun run v7:phase5:validate-device-evidence -- finalize \
  /path/to/completed-report.json \
  docs/cloud-sync/v7-phase5/evidence/YYYY-MM-DD-android-device.json
```

Do not put account labels, tokens, Drive IDs, upload-session URIs, file bodies,
media bytes, or journal text in a report. The schema accepts only bounded
scenario IDs, numeric measurements, booleans, and short enumerated note codes.
