# Cloud Backup & Sync

Google Drive backup and multi-device sync for the journal. Plaintext at the
provider in v1, hash-addressed immutable version files, no Tackbok account.

**Start here:** [`plan-v6.md`](./plan-v6.md) — the frozen plan of record.
Section numbers referenced throughout these docs (§4.1, §6.6, §11.5 …) are its
sections. Nothing in this directory overrides it; the gates record whether its
requirements were met.

## Status

| Phase | State |
| --- | --- |
| 0 — format ADR, fixtures, spikes | ✅ conditionally closed ([gate](./phase0/gate.md)) |
| 1 — normalized model + outbox | ✅ closed ([gate](./phase1/gate.md)) |
| 2 — engine vs. the fake provider | ✅ closed ([gate](./phase2/gate.md)) |
| 3 — Google Drive adapter | ✅ conditionally closed ([gate](./phase3/gate.md), [waiver](./phase3/waiver.md)) |
| 4a — durable runtime (no UI) | 🟠 remediation ready for owner re-review ([gate](./phase4/gate.md), [review](./phase4/review-4a-2026-08-09.md)) |
| 4b — UI + translations | not started; blocked on owner acceptance of 4a |
| 5 — hardening + rollout | not started |
| 6 — background-transfer decision | blocked: needs a physical device |

## Layout

- [`plan-v6.md`](./plan-v6.md) — the plan. Frozen; changes need sign-off.
- `phase0/` — protocol v1 ADRs (`0001`–`0005`), the spike write-ups, and the
  Phase-0 gate with its owner waiver. `results/` holds the on-device
  diagnostics runs.
- `phase1/`, `phase2/` — gates and evidence for the local model and the engine.
- `phase4/` — the split Phase-4 runtime gate and redacted machine evidence.
- `phase3/` — the Drive adapter. Read [`gate.md`](./phase3/gate.md) for what was
  proven, [`waiver.md`](./phase3/waiver.md) for what was not and what is owed on
  the first physical device, [`probes.md`](./phase3/probes.md) to re-run the
  owner probe suite, `findings/` for the two Android authorization defects, and
  `evidence/` for the redacted probe reports behind every claim.
- [`review-2026-08-09.md`](./review-2026-08-09.md) — the cross-phase review that
  produced the Phase 1/2 remediation.

## Conventions

- **Gates are evidence, not intent.** A ticked box names what was executed and
  where the report is. An unticked box stays unticked until it is, or a recorded
  owner waiver dispositions it.
- **Findings outlive their fix.** `phase3/findings/` explains why the code looks
  the way it does — why `expiresAt` is reported as 0, why a SecureStore
  connection mark exists. Both look removable without the finding that forced
  them.
- **Evidence is redacted at write time**, not by review: no tokens, account
  emails or stable account identifiers, Drive session URIs, file bodies, media
  bytes, or journal data. `assertReportIsRedacted` throws before a report is
  written or logged.

## Code map

- `src/lib/cloudSync/protocol/` — **frozen protocol v1 primitives.** Canonical
  JSON encoding and the numeric validation caps. Every vault hash depends on
  them; a change here is a new protocol version, not an edit.
- `src/lib/cloudSync/` — `codec/`, `domain/`, `ancestry/`, `conflicts/`,
  `outbox/`, `engine/`, `storage/`, `providers/`, `auth/`.
- `src/lib/cloudSync/phase0/` and `phase3/` — spike and probe harnesses, plus
  the golden fixtures. Dev-only; reachable through the `__DEV__`-gated
  `dev-diagnostics` and `dev-cloud-probes` routes. Kept because the Phase-3
  waiver commits to re-running them on the first physical device.
