package app

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

private const val DEFAULT_BITRATE = 64000
private const val CODEC_TIMEOUT_US = 10_000L
private const val ERROR_ENCODE = "E_AUDIO_ENCODE"

/**
 * Inline native module that encodes a WAV file to M4A (AAC) using Android's
 * MediaCodec + MediaMuxer with no extra native dependencies.
 */
class AudioEncoderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioEncoderModule")

    AsyncFunction("encodeWavToM4a") { wavUriString: String, bitrate: Int?, promise: Promise ->
      try {
        val actualBitrate = bitrate ?: DEFAULT_BITRATE
        val wavFile = resolveFile(wavUriString)
        val outputFile = File(
          appContext.reactContext?.cacheDir ?: throw IOException("Cache dir unavailable"),
          "encoded_${System.currentTimeMillis()}.m4a"
        )

        encodeWavToM4a(wavFile, outputFile, actualBitrate)
        promise.resolve(Uri.fromFile(outputFile).toString())
      } catch (e: Exception) {
        promise.reject(ERROR_ENCODE, e.message ?: "Audio encoding failed", e)
      }
    }
  }

  private fun resolveFile(uriString: String): File {
    return if (uriString.startsWith("file://")) {
      File(Uri.parse(uriString).path ?: throw IOException("Invalid file URI"))
    } else {
      File(uriString)
    }
  }

  private data class WavHeader(
    val sampleRate: Int,
    val channels: Int,
    val bitsPerSample: Int,
    val dataOffset: Int,
    val dataSize: Int
  )

  private fun parseWavHeader(file: File): WavHeader {
    FileInputStream(file).use { fis ->
      val header = ByteArray(44)
      val bytesRead = fis.read(header)
      if (bytesRead < 44) {
        throw IOException("File too small to contain a WAV header")
      }

      val buf = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN)
      val riff = String(header, 0, 4)
      val wave = String(header, 8, 4)
      if (riff != "RIFF" || wave != "WAVE") {
        throw IOException("Not a valid WAV file")
      }

      val fmtMarker = String(header, 12, 4)
      if (fmtMarker != "fmt ") {
        throw IOException("Missing fmt chunk")
      }

      val audioFormat = buf.getShort(20).toInt() and 0xFFFF
      if (audioFormat != 1) {
        throw IOException("Only PCM WAV files are supported (got format $audioFormat)")
      }

      val channels = buf.getShort(22).toInt() and 0xFFFF
      val sampleRate = buf.getInt(24)
      val bitsPerSample = buf.getShort(34).toInt() and 0xFFFF

      val dataMarker = String(header, 36, 4)
      if (dataMarker != "data") {
        throw IOException("Missing data chunk at expected offset")
      }
      val dataSize = buf.getInt(40)

      return WavHeader(sampleRate, channels, bitsPerSample, 44, dataSize)
    }
  }

  private fun encodeWavToM4a(wavFile: File, outputFile: File, bitrate: Int) {
    val wav = parseWavHeader(wavFile)
    val format = MediaFormat.createAudioFormat(
      MediaFormat.MIMETYPE_AUDIO_AAC,
      wav.sampleRate,
      wav.channels
    ).apply {
      setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
      setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
      setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384)
    }

    val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
    var muxer: MediaMuxer? = null
    var trackIndex = -1
    var muxerStarted = false
    var encoderStarted = false

    try {
      encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      muxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      encoder.start()
      encoderStarted = true

      FileInputStream(wavFile).use { fis ->
        fis.skip(wav.dataOffset.toLong())

        val bufferInfo = MediaCodec.BufferInfo()
        var totalBytesRead = 0
        val bytesPerSample = wav.bitsPerSample / 8
        val bytesPerFrame = bytesPerSample * wav.channels
        var presentationTimeUs = 0L
        var inputDone = false

        while (true) {
          if (!inputDone) {
            val inputIndex = encoder.dequeueInputBuffer(CODEC_TIMEOUT_US)
            if (inputIndex >= 0) {
              val inputBuffer = encoder.getInputBuffer(inputIndex)!!
              inputBuffer.clear()

              val bytesToRead = minOf(inputBuffer.remaining(), wav.dataSize - totalBytesRead)
              if (bytesToRead <= 0) {
                encoder.queueInputBuffer(
                  inputIndex,
                  0,
                  0,
                  presentationTimeUs,
                  MediaCodec.BUFFER_FLAG_END_OF_STREAM
                )
                inputDone = true
              } else {
                val tempBuffer = ByteArray(bytesToRead)
                val read = fis.read(tempBuffer, 0, bytesToRead)
                if (read <= 0) {
                  encoder.queueInputBuffer(
                    inputIndex,
                    0,
                    0,
                    presentationTimeUs,
                    MediaCodec.BUFFER_FLAG_END_OF_STREAM
                  )
                  inputDone = true
                } else {
                  inputBuffer.put(tempBuffer, 0, read)
                  totalBytesRead += read

                  val framesInBuffer = read / bytesPerFrame
                  encoder.queueInputBuffer(inputIndex, 0, read, presentationTimeUs, 0)
                  presentationTimeUs += (framesInBuffer * 1_000_000L) / wav.sampleRate
                }
              }
            }
          }

          val outputIndex = encoder.dequeueOutputBuffer(bufferInfo, CODEC_TIMEOUT_US)
          when {
            outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
              if (!muxerStarted) {
                trackIndex = muxer.addTrack(encoder.outputFormat)
                muxer.start()
                muxerStarted = true
              }
            }

            outputIndex >= 0 -> {
              val outputBuffer = encoder.getOutputBuffer(outputIndex) ?: continue

              if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
                encoder.releaseOutputBuffer(outputIndex, false)
                continue
              }

              if (bufferInfo.size > 0 && muxerStarted) {
                outputBuffer.position(bufferInfo.offset)
                outputBuffer.limit(bufferInfo.offset + bufferInfo.size)
                muxer.writeSampleData(trackIndex, outputBuffer, bufferInfo)
              }

              encoder.releaseOutputBuffer(outputIndex, false)

              if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                break
              }
            }
          }
        }
      }
    } catch (error: Exception) {
      if (outputFile.exists()) outputFile.delete()
      throw error
    } finally {
      if (encoderStarted) {
        try {
          encoder.stop()
        } catch (_: Exception) {
          // Ignore cleanup errors.
        }
      }
      encoder.release()

      try {
        if (muxerStarted) muxer?.stop()
      } catch (_: Exception) {
        // Ignore cleanup errors.
      } finally {
        muxer?.release()
      }
    }
  }
}
