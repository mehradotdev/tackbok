# V1 purge and retirement checklist

Status: **c1 authorized only after accepted b1 evidence; c2 remains blocked**

The owner has attested that no other alpha tester holds a protocol-v1 vault.
Bundle c1 becomes actionable after b1 emulator evidence is accepted; skipping
the hardware round means the old path is no longer needed for that round. A
purge remains destructive and requires a fresh, explicit owner confirmation at
execution time.

## Bundle (c1): disposable v1 vault purge

- [ ] Identify only owner-created disposable protocol-v1 test vaults. Never use
  a personal account or infer a target from an unverified label.
- [ ] Using the still-present reviewed v1 production path, run **Delete cloud
  backup**/revocation and allow the purge to reach zero remaining objects.
- [ ] Re-run the retained Phase-3 marker-preservation/permanent-delete checks as
  required by the accepted device round.
- [ ] Record redacted evidence with counts/status only—no vault ID, Drive file
  ID, logical key, account label, body, token, or session URI.
- [ ] Confirm the local journal remains present unless the owner explicitly
  chose **Delete journal everywhere**.
- [ ] Manually remove the throwaway account's Tackbok OAuth grant in Google
  Account settings after all device testing and purges finish.

If no disposable v1 vault exists, the owner records that disposition instead of
manufacturing a purge. Alpha vaults outside the owner's disposable test scope
follow plan §18.3 and are not silently discovered or deleted.

## Bundle (c2): separate v6 removal diff

- [ ] Start only after Bundle (c1) owner review and a passing b1 200 MiB v2
  upload/hash/restore result.
- [ ] Remove v1 production construction, reconnect, revoke, materialization,
  and outbox fallback paths identified in `v1-dependency-audit.md`.
- [ ] Preserve normalized journal data, v2 state, auth/SecureStore,
  retained-media safety, migration history, and historical docs/gates.
- [ ] Do not rewrite historical verdicts and do not prune audit docs.
- [ ] Run `dependency-audit.ts --expect-retired`; reachable v1 count is zero.
- [ ] Re-run the complete v2/runtime/UI/full-Jest/typecheck/lint evidence set.
- [ ] Hand the removal bundle back for owner review before merge.
