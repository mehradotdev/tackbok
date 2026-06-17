import ExpoModulesCore
import AVFoundation

private let defaultBitrate = 64000
private let errorEncode = "E_AUDIO_ENCODE"

/// Inline native module that encodes a WAV file to M4A (AAC) using
/// AVAssetReader + AVAssetWriter — zero extra dependencies, hardware-accelerated.
public class AudioEncoderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioEncoderModule")

    AsyncFunction("encodeWavToM4a") { (wavUriString: String, bitrate: Int?) -> String in
      let actualBitrate = bitrate ?? defaultBitrate
      let wavURL = try self.resolveFileURL(wavUriString)

      let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
      let outputURL = cacheDir.appendingPathComponent("encoded_\(Int(Date().timeIntervalSince1970 * 1000)).m4a")

      // Remove output file if it somehow already exists
      try? FileManager.default.removeItem(at: outputURL)

      try await self.encodeWavToM4a(source: wavURL, destination: outputURL, bitrate: actualBitrate)
      return outputURL.absoluteString
    }
  }

  /// Resolve a file:// URI or plain path to a URL.
  private func resolveFileURL(_ uriString: String) throws -> URL {
    if uriString.hasPrefix("file://") {
      guard let url = URL(string: uriString), url.isFileURL else {
        throw Exception(name: errorEncode, description: "Invalid WAV file URI")
      }
      return url
    }
    return URL(fileURLWithPath: uriString)
  }

  /// Core encoding using AVAssetReader (source) + AVAssetWriter (destination).
  private func encodeWavToM4a(source: URL, destination: URL, bitrate: Int) async throws {
    let asset = AVURLAsset(url: source)

    // Load the audio track
    let tracks = try await asset.loadTracks(withMediaType: .audio)
    guard let audioTrack = tracks.first else {
      throw Exception(name: errorEncode, description: "No audio track found in WAV file")
    }

    // --- Reader (PCM input) ---
    let reader = try AVAssetReader(asset: asset)
    let readerOutputSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false
    ]
    let readerOutput = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: readerOutputSettings)
    readerOutput.alwaysCopiesSampleData = false
    reader.add(readerOutput)

    // --- Writer (AAC output) ---
    let writer = try AVAssetWriter(outputURL: destination, fileType: .m4a)

    // Load format descriptions to get sample rate and channel count
    let formatDescriptions = try await audioTrack.load(.formatDescriptions)
    var sampleRate = 44100.0
    var channelCount: UInt32 = 1
    if let formatDesc = formatDescriptions.first {
      let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc)
      if let asbd = asbd?.pointee {
        sampleRate = asbd.mSampleRate
        channelCount = asbd.mChannelsPerFrame
      }
    }

    let writerInputSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: sampleRate,
      AVNumberOfChannelsKey: channelCount,
      AVEncoderBitRateKey: bitrate
    ]
    let writerInput = AVAssetWriterInput(mediaType: .audio, outputSettings: writerInputSettings)
    writerInput.expectsMediaDataInRealTime = false
    writer.add(writerInput)

    // Start reading and writing
    reader.startReading()
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)

    // Process samples on a background queue
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      let queue = DispatchQueue(label: "dev.mehra.tackbok.audio-encoder")
      writerInput.requestMediaDataWhenReady(on: queue) {
        while writerInput.isReadyForMoreMediaData {
          if let sampleBuffer = readerOutput.copyNextSampleBuffer() {
            writerInput.append(sampleBuffer)
          } else {
            writerInput.markAsFinished()

            if reader.status == .failed {
              writer.cancelWriting()
              continuation.resume(throwing: Exception(
                name: errorEncode,
                description: reader.error?.localizedDescription ?? "Reader failed"
              ))
              return
            }

            writer.finishWriting {
              if writer.status == .failed {
                continuation.resume(throwing: Exception(
                  name: errorEncode,
                  description: writer.error?.localizedDescription ?? "Writer failed"
                ))
              } else {
                continuation.resume()
              }
            }
            return
          }
        }
      }
    }
  }
}
