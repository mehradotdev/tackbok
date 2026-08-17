# V7 rollout and kill switch

Date: 2026-08-15
Status: implemented for Bundle V7-5(a); owner review pending

## Mechanism

`EXPO_PUBLIC_TACKBOK_CLOUD_SYNC_ROLLOUT` is compiled into each native or EAS
Update JavaScript bundle. It supports four channel-level values:

| Value | Protocol-v1 network | Protocol-v2 network | Intended use |
| --- | ---: | ---: | --- |
| `all` | on | on | current alpha transition |
| `v1-only` | on | off | pause v2 while old alpha vaults remain supported |
| `v2-only` | off | on | retirement rollout after the v1 purge/removal gate |
| `off` | off | off | emergency kill switch |

An absent value preserves current alpha behavior (`all`). An explicitly invalid
value fails closed to `off`. Rollout is by reviewed build/update channel, not by
account or a hidden per-user identifier. The dedicated internal
`device-evidence` EAS profile uses `all`; production and preview currently do
the same.

The policy is checked before production provider construction and before
interactive consent, reconnect, revocation, or purge. `off` also unregisters
the background task. Protocol-selective modes may leave the OS task registered,
but its vault-aware engine factory returns without constructing authorization
or a provider when that vault's protocol is disabled.

## Data-preserving rollback invariant

Changing the rollout mode never:

- deletes or rewrites journal rows;
- advances or settles a queued generation;
- deletes a base shadow, pending publication, media ledger row, or staged file;
- signs out or deletes SecureStore credentials;
- creates, updates, or deletes a Drive object; or
- converts a v2 vault back to v1 (or a v1 vault to v2).

It only prevents new provider work. Local editing remains available and new
intent stays durable. Local **Disconnect** and the owner's explicit local reset
remain available because they are device-local user actions, not rollback.
Provider-destructive actions fail before their first provider or local
revocation-state mutation while their protocol is disabled.

Activation is at JavaScript-bundle start/reload. A request already in flight in
the old bundle may finish before the update restarts the runtime; the new bundle
constructs no further provider work. The device round must record zero requests
after that activation boundary, not claim cancellation of an old operating-
system socket.

## Roll-forward and retirement

After the device evidence and v1 purge are accepted, the retirement bundle sets
the normal rollout to `v2-only`, removes the v1 construction/revocation
branches, and runs:

```sh
bun run scripts/cloud-sync-v7-phase5/dependency-audit.ts --expect-retired
```

A bad v2 rollout is paused with `off`; it is never “rolled back” by publishing
the same journal through v1. That would create two independent cloud histories
and violate the approved alpha transition.
