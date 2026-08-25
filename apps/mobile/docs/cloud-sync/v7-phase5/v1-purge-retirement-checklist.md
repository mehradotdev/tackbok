# V1 purge and retirement checklist

Status: **c1 complete by owner no-actionable-v1 disposition 2026-08-25; c2 is
authorized as a separate removal bundle**

The owner has attested that no other alpha tester holds a protocol-v1 vault.
Bundle c1 became actionable after the owner accepted the physical Android Debug
D1 transport evidence and moved the unexecuted Wi-Fi-only scenario to the
store-submission gate. The owner supplied fresh destructive confirmation on
2026-08-25, but the redacted local preflight proved the connected vault was
protocol v2 and therefore outside the authorized target.

## Bundle (c1): disposable v1 vault purge

- [x] The owner confirmed the connected identity was disposable; target
  eligibility was verified from local protocol state rather than its label.
- [x] The sole configured vault was protocol v2, so the authorized v1 purge did
  not run and the v2 backup was not substituted as a target.
- [x] No protocol-v1-connected emulator/device installation remains. The owner
  is the only alpha tester, so any inaccessible orphan follows the explicit
  alpha abandonment rule in plan §18.3.
- [x] Redacted evidence contains counts/status only—no vault ID, Drive file
  ID, logical key, account label, body, token, or session URI.
- [x] The local journal remains present; no provider mutation or destructive UI
  action was performed. See
  [`evidence/2026-08-25-v1-purge-disposition.json`](./evidence/2026-08-25-v1-purge-disposition.json).
- [x] The disposable OAuth grant is deliberately retained until remaining v2
  device testing ends, then must be removed manually.

If no disposable v1 vault exists, the owner records that disposition instead of
manufacturing a purge. Alpha vaults outside the owner's disposable test scope
follow plan §18.3 and are not silently discovered or deleted.

## Bundle (c2): separate v6 removal diff

- [x] Start only after Bundle (c1) owner review and a passing b1 200 MiB v2
  upload/hash/restore result.
- [ ] Remove v1 production construction, reconnect, revoke, materialization,
  and outbox fallback paths identified in `v1-dependency-audit.md`.
- [ ] Preserve normalized journal data, v2 state, auth/SecureStore,
  retained-media safety, migration history, and historical docs/gates.
- [ ] Do not rewrite historical verdicts and do not prune audit docs.
- [ ] Run `dependency-audit.ts --expect-retired`; reachable v1 count is zero.
- [ ] Re-run the complete v2/runtime/UI/full-Jest/typecheck/lint evidence set.
- [ ] Hand the removal bundle back for owner review before merge.
