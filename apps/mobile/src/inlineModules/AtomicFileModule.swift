import Darwin
internal import ExpoModulesCore
import Foundation

/// ADR V7-0005 durability primitive: fsynced temp writes and atomic rename.
class AtomicFileModule: Module {
  func definition() -> ModuleDefinition {
    Name("AtomicFileModule")

    AsyncFunction("writeAndSync") { (url: URL, bytes: Data) in
      guard url.isFileURL else { throw AtomicFileError.nonFileURL }
      try FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      if !FileManager.default.fileExists(atPath: url.path) {
        FileManager.default.createFile(atPath: url.path, contents: nil)
      }
      let handle = try FileHandle(forWritingTo: url)
      defer { try? handle.close() }
      try handle.truncate(atOffset: 0)
      try handle.write(contentsOf: bytes)
      try handle.synchronize()
    }

    AsyncFunction("replaceAndSync") { (source: URL, destination: URL) in
      guard source.isFileURL, destination.isFileURL else {
        throw AtomicFileError.nonFileURL
      }
      let result = source.path.withCString { sourcePath in
        destination.path.withCString { destinationPath in
          Darwin.rename(sourcePath, destinationPath)
        }
      }
      if result != 0 {
        throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
      }
      let directoryPath = destination.deletingLastPathComponent().path
      let descriptor = Darwin.open(directoryPath, O_RDONLY)
      if descriptor < 0 {
        throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
      }
      defer { Darwin.close(descriptor) }
      if Darwin.fsync(descriptor) != 0 {
        throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
      }
    }
  }
}

private enum AtomicFileError: Error {
  case nonFileURL
}
