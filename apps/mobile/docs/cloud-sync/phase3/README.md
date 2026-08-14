# Cloud sync Phase 3

> **Historical plan-v6 evidence with reusable provider/auth findings.** The
> snapshot-v2 proposal lives in [`plan-v7.md`](../plan-v7.md). Keep these real
> Drive probes, authorization findings, waivers, and redacted reports; v7 is
> expected to reuse part of this adapter and its security boundaries.

Phase 3 supplies the Google authorization and Drive adapter code.

Phase 3 is **conditionally closed** as of 2026-08-09: the owner ran the probe
suite against real Google Drive on both platforms with disposable accounts, five
of seven merge-blocking probes closed on evidence, and the remaining two are
dispositioned by [`waiver.md`](./waiver.md). Phase 4 may begin.

Read before touching this code:

- [`gate.md`](./gate.md) — what was proven and what was not.
- [`waiver.md`](./waiver.md) — the physical-device waiver and the obligations it
  carries forward to the first real device and to store submission.
- [`probes.md`](./probes.md) — how to re-run the owner probe suite.
- [`findings/`](./findings/) — two Android authorization findings; 0002 is fixed
  and verified, 0001 is open and not merge-blocking.

Run the account-independent suite with:

```sh
bun run phase3:test
```
