# Spike 0004: restore scale

- Status: host harness passes; physical-device and real-Drive gate open
- Date: 2026-08-08

## Decision rule

Protocol v1 keeps one immutable file per entity version only if a 50,000-object
restore meets every frozen target on both reference devices. Otherwise protocol v1
must gain an immutable checkpoint/index before confirmation. A mutable global head
is forbidden.

## Probe shape

The fixture contains 5,000 entities with ten linear versions each, mixed with
forked and orphan-first delivery from the golden catalog. It measures separately:

- paginated Drive listing and persisted page checkpoints;
- bounded-concurrency download of small canonical JSON files;
- hash/schema verification and JSON parsing;
- ancestry reconstruction, head computation, and orphan completion;
- peak JS heap and time-to-interactive while work continues;
- a kill in the middle of a page followed by resume.

The real probe uses download concurrency 8 initially and may lower it for memory or
rate limits. It must not infer success from a desktop or localhost benchmark.

## Acceptance targets

- interactive <=5 seconds after launch;
- complete text restore <=30 minutes on Wi-Fi;
- peak JS heap <=250 MiB;
- resume replays no more than one listing page.

## Evidence available in this workspace

The checked-in host harness exercises deterministic generation, canonical parsing,
hash verification, head reconstruction, and checkpoint replay. It is a regression
and sizing aid only. There is no physical iPhone and no authorized Drive token, so
the protocol-confirmation measurement remains blocked.

Host run on 2026-08-08 (`bun run phase0:restore-probe`): 50,000 versions / 5,000
entities, 56,136,674 verified bytes, 539 ms total, 105.6 MiB observed JS heap, and
500 objects (one page maximum) replayed after the injected mid-page interruption.
These figures prove the fixture/harness is tractable; they do not include Drive
latency or reference-device constraints and therefore do not satisfy the gate.
