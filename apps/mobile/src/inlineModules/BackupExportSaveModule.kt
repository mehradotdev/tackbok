package app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException

private const val CREATE_DOCUMENT_REQUEST_CODE = 18073
private const val ZIP_MIME_TYPE = "application/zip"
private const val ERROR_BUSY = "E_BACKUP_EXPORT_BUSY"
private const val ERROR_CANCELLED = "E_BACKUP_EXPORT_CANCELLED"
private const val ERROR_NO_ACTIVITY = "E_BACKUP_EXPORT_NO_ACTIVITY"
private const val ERROR_NO_DESTINATION = "E_BACKUP_EXPORT_NO_DESTINATION"
private const val ERROR_WRITE_FAILED = "E_BACKUP_EXPORT_WRITE_FAILED"

/**
 * Android backup export uses ACTION_CREATE_DOCUMENT so the user picks a concrete destination file.
 * We then copy the already-generated ZIP into that URI through ContentResolver streams.
 */
class BackupExportSaveModule : Module() {
  private var pendingPromise: Promise? = null
  private var pendingSourceUri: Uri? = null

  override fun definition() = ModuleDefinition {
    Name("BackupExportSaveModule")

    AsyncFunction("saveZip") { sourceUriString: String, suggestedFileName: String, promise: Promise
      ->
      if (pendingPromise != null) {
        promise.reject(ERROR_BUSY, "Another backup export is already in progress", null)
        return@AsyncFunction
      }

      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject(ERROR_NO_ACTIVITY, "No active activity", null)
        return@AsyncFunction
      }

      val sourceUri = normalizeUri(sourceUriString)
      val intent =
              Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = ZIP_MIME_TYPE
                putExtra(Intent.EXTRA_TITLE, suggestedFileName)
              }

      // The result comes back asynchronously through OnActivityResult, so keep the request state.
      pendingPromise = promise
      pendingSourceUri = sourceUri

      try {
        activity.startActivityForResult(intent, CREATE_DOCUMENT_REQUEST_CODE)
      } catch (error: Exception) {
        pendingPromise = null
        pendingSourceUri = null
        promise.reject(ERROR_WRITE_FAILED, error.message ?: "Unable to open save dialog", error)
      }
    }

    OnActivityResult { _, (requestCode, resultCode, data) ->
      if (requestCode != CREATE_DOCUMENT_REQUEST_CODE || pendingPromise == null) {
        return@OnActivityResult
      }

      val promise = pendingPromise!!
      val sourceUri = pendingSourceUri
      pendingPromise = null
      pendingSourceUri = null

      if (sourceUri == null) {
        promise.reject(ERROR_WRITE_FAILED, "Backup source file is unavailable", null)
        return@OnActivityResult
      }

      if (resultCode != Activity.RESULT_OK) {
        promise.reject(ERROR_CANCELLED, "Save cancelled", null)
        return@OnActivityResult
      }

      val destinationUri = data?.data
      if (destinationUri == null) {
        promise.reject(ERROR_NO_DESTINATION, "No destination file selected", null)
        return@OnActivityResult
      }

      try {
        copyUriToDocument(sourceUri, destinationUri)
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject(ERROR_WRITE_FAILED, error.message ?: "Failed to save backup", error)
      }
    }

    OnDestroy {
      pendingPromise?.reject(ERROR_CANCELLED, "Save cancelled", null)
      pendingPromise = null
      pendingSourceUri = null
    }
  }

  private fun normalizeUri(sourceUriString: String): Uri {
    return when {
      sourceUriString.startsWith("content://") || sourceUriString.startsWith("file://") -> {
        Uri.parse(sourceUriString)
      }
      else -> Uri.fromFile(File(sourceUriString))
    }
  }

  private fun copyUriToDocument(sourceUri: Uri, destinationUri: Uri) {
    val resolver =
            appContext.reactContext?.contentResolver
                    ?: throw IOException("React context is unavailable")
    val input =
            resolver.openInputStream(sourceUri)
                    ?: throw IOException("Unable to open backup source file")
    // SAF destinations are exposed as content:// URIs, so Android must write through
    // ContentResolver.
    val output =
            resolver.openOutputStream(destinationUri, "w")
                    ?: throw IOException("Unable to open destination document")

    input.use { sourceStream ->
      output.use { destinationStream -> sourceStream.copyTo(destinationStream) }
    }
  }
}