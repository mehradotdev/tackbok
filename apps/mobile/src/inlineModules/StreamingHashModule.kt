package app

import android.net.Uri
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.security.MessageDigest

private const val HASH_BUFFER_BYTES = 1024 * 1024

/** Phase-0 native streaming SHA-256 spike. No file bytes cross the JS bridge. */
class StreamingHashModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StreamingHashModule")

    AsyncFunction("sha256File") { uriString: String ->
      val startedAt = SystemClock.elapsedRealtimeNanos()
      val digest = MessageDigest.getInstance("SHA-256")
      var byteCount = 0L
      var maximumRead = 0

      openInput(uriString).use { input ->
        val buffer = ByteArray(HASH_BUFFER_BYTES)
        while (true) {
          val read = input.read(buffer)
          if (read < 0) break
          if (read == 0) continue
          digest.update(buffer, 0, read)
          byteCount += read
          maximumRead = maxOf(maximumRead, read)
        }
      }

      val elapsedMs = (SystemClock.elapsedRealtimeNanos() - startedAt) / 1_000_000.0
      mapOf(
        "sha256" to digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) },
        "bytesRead" to byteCount,
        "elapsedMs" to elapsedMs,
        "maximumReadBytes" to maximumRead,
      )
    }
  }

  private fun openInput(uriString: String): InputStream {
    val uri = Uri.parse(uriString)
    return when (uri.scheme) {
      "content" ->
        appContext.reactContext?.contentResolver?.openInputStream(uri)
          ?: error("Unable to open content URI")
      "file" -> FileInputStream(File(requireNotNull(uri.path) { "File URI has no path" }))
      null, "" -> FileInputStream(File(uriString))
      else -> error("Unsupported file URI scheme: ${uri.scheme}")
    }
  }
}
