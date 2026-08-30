import CryptoKit
internal import ExpoModulesCore
import Foundation

private let hashBufferBytes = 1024 * 1024

/// Phase-0 native streaming SHA-256 spike. No file bytes cross the JS bridge.
class StreamingHashModule: Module {
  func definition() -> ModuleDefinition {
    Name("StreamingHashModule")

    AsyncFunction("sha256File") { (url: URL) -> [String: Any] in
      guard url.isFileURL else {
        throw StreamingHashException.unsupportedUrl
      }

      let startedAt = ContinuousClock.now
      let handle = try FileHandle(forReadingFrom: url)
      defer { try? handle.close() }

      var hasher = SHA256()
      var byteCount: Int64 = 0
      var maximumRead = 0

      while true {
        let data = try handle.read(upToCount: hashBufferBytes) ?? Data()
        if data.isEmpty { break }
        hasher.update(data: data)
        byteCount += Int64(data.count)
        maximumRead = max(maximumRead, data.count)
      }

      let elapsed = startedAt.duration(to: ContinuousClock.now)
      let elapsedSeconds = Double(elapsed.components.seconds)
        + Double(elapsed.components.attoseconds) / 1_000_000_000_000_000_000

      return [
        "sha256": hasher.finalize().map { String(format: "%02x", $0) }.joined(),
        "bytesRead": byteCount,
        "elapsedMs": elapsedSeconds * 1000,
        "maximumReadBytes": maximumRead,
      ]
    }
  }
}

private enum StreamingHashException: Error {
  case unsupportedUrl
}
