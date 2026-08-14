# V7-0 snapshot measurements

These reports were generated from `tools/measureSnapshot.ts` on 2026-08-14.
The fixture is deterministic and synthetic: 720-character multilingual bodies,
two tag relations per entry, 32 tags, 16 prompts, and one media descriptor per
ten entries. Media bytes are correctly excluded.

| Entries | Canonical bytes | gzip level 6 | Ratio | Encode | gzip | gunzip + parse + recanonicalize |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2,000 | 2,329,562 (2.22 MiB) | 307,027 (0.293 MiB) | 7.59:1 | 15.68 ms | 24.62 ms | 16.53 ms |
| 10,000 | 11,631,139 (11.09 MiB) | 1,518,981 (1.449 MiB) | 7.66:1 | 84.19 ms | 123.42 ms | 86.42 ms |

The 10,000-entry compressed result is 9.1% of the proposed 16 MiB compressed
cap and supports plan-v7 §18.11's decision that Wi-Fi-only applies to media,
not metadata. The uncompressed result is 17.3% of the proposed 64 MiB cap.

Memory is not a device claim. The reports include host process RSS and retained
heap deltas only. The 10,000-entry run reached about 402 MiB host-process peak
RSS because the measurement deliberately retains the generated object,
canonical string, compressed bytes, decoded tree, and recanonicalized string at
once. Production V7-1 must avoid that all-at-once shape where practical, and
V7-5 must measure transient Hermes heap on physical devices. These numbers do
not close any device memory target.

## Candidate device targets for owner decision §18.10

These are proposed gates, not claims from the host run:

| Physical-device scenario | Candidate target |
| --- | ---: |
| 2,000-entry canonicalize + gzip | ≤ 1 second |
| 2,000-entry gunzip + parse + validate + recanonicalize | ≤ 1 second |
| 10,000-entry canonicalize + gzip | ≤ 5 seconds |
| 10,000-entry gunzip + parse + validate + recanonicalize | ≤ 5 seconds |
| 10,000-entry codec additional peak JS heap | ≤ 128 MiB |
| 10,000-entry codec total process RSS | ≤ 250 MiB |
| Fresh 10,000-entry text snapshot validate + transactional apply | ≤ 2 minutes, off the launch-critical path |

The targets apply to the oldest supported iPhone and a defined mid-tier Android
reference device in V7-5. Failure reopens the implementation strategy (streaming
encode/parse, chunked domain apply, or tighter caps); it is not waived by these
host timings.

Re-run:

```sh
bun run v7:phase0:measure:2k
bun run v7:phase0:measure:10k
```
