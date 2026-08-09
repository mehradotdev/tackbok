# Cloud sync Phase 3

Phase 3 supplies the Google authorization and Drive adapter code. Implementation
has stopped at the owner-dependent part of the gate, exactly as directed.

Read [`gate.md`](./gate.md) before merging or beginning Phase 4. The mocked
contract suite and native compilation are green, but Phase 3 is **not closed**:
the remaining probes require the owner's disposable Google test account and
interactive consent.

Run the account-independent suite with:

```sh
bun run phase3:test
```
