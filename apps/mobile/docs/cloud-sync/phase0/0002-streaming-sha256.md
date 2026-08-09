# Spike 0002: streaming SHA-256

- Status: Android debug and iOS simulator builds compile; physical-device gate open
- Date: 2026-08-08

## Candidate decision

Use a small inline Expo module over platform SHA-256 implementations:
Kotlin `MessageDigest` and Swift `CryptoKit.SHA256`. This avoids a full-file JS
buffer, a JSI dependency, a WebAssembly compatibility risk, and a paid package.
It streams a file in bounded 1 MiB reads and returns only the digest and benchmark
metadata over the bridge.

Prototype files:

- `src/inlineModules/StreamingHashModule.kt`
- `src/inlineModules/StreamingHashModule.swift`
- `src/lib/cloudSync/phase0/streamingHashSpike.ts`

The input URI comes from Expo FileSystem; native code performs the bounded reads.
Android accepts `file://`, plain paths, and `content://`; iOS accepts file URLs.

## Required acceptance run

On a release-signed beta build on a physical mid-tier 2022 Android device and the
oldest supported physical iPhone:

1. Hash the same deterministic 200 MiB fixture twice.
2. Independently verify the expected SHA-256.
3. Record `bytesRead`, `maximumReadBytes`, `elapsedMs`, and MiB/s from
   `runStreamingHashSpike`.
4. Require identical hashes, `maximumReadBytes <= 1 MiB`, and throughput
   `>= 25 MiB/s` on both devices.
5. Measure timeline fps and entry-save p95 while hashing; require >=55 fps and
   <=25 ms added p95 save latency.

## Evidence available in this workspace

- Android emulator is connected; it is not a qualifying physical reference device.
- No physical iPhone is connected.
- Android `:app:compileDebugKotlin` and the complete iOS simulator Debug build
  pass. These prove integration and type compatibility, not release signing or
  physical-device performance.

The candidate is not final until the physical measurements pass. If either
platform fails, reduce the native read buffer only if memory—not throughput—is the
problem; otherwise evaluate `react-native-quick-crypto`, then the frozen
chunk-manifest fallback.
