package app

import android.net.Uri
import android.system.Os
import android.system.OsConstants
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

/** Durability primitive for fsynced temporary writes and atomic rename. */
class AtomicFileModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AtomicFileModule")

    AsyncFunction("writeAndSync") { uriString: String, bytes: ByteArray ->
      val file = fileFromUri(uriString)
      file.parentFile?.mkdirs()
      FileOutputStream(file, false).use { output ->
        output.write(bytes)
        output.flush()
        output.fd.sync()
      }
    }

    AsyncFunction("appendAndSync") { uriString: String, bytes: ByteArray ->
      val file = fileFromUri(uriString)
      file.parentFile?.mkdirs()
      FileOutputStream(file, true).use { output ->
        output.write(bytes)
        output.flush()
        output.fd.sync()
      }
    }

    AsyncFunction("replaceAndSync") { sourceUri: String, destinationUri: String ->
      val source = fileFromUri(sourceUri)
      val destination = fileFromUri(destinationUri)
      destination.parentFile?.mkdirs()
      Os.rename(source.absolutePath, destination.absolutePath)
      val directory = destination.parentFile ?: error("Atomic destination has no parent")
      val descriptor = Os.open(directory.absolutePath, OsConstants.O_RDONLY, 0)
      try {
        Os.fsync(descriptor)
      } finally {
        Os.close(descriptor)
      }
    }
  }

  private fun fileFromUri(value: String): File {
    val uri = Uri.parse(value)
    return when (uri.scheme) {
      "file" -> File(requireNotNull(uri.path) { "File URI has no path" })
      null, "" -> File(value)
      else -> error("Atomic files require an app-private file URI")
    }
  }
}
