package app

import android.content.ClipData
import android.content.ClipDescription
import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.webkit.MimeTypeMap
import android.widget.EditText
import androidx.core.view.ContentInfoCompat
import androidx.core.view.OnReceiveContentListener
import androidx.core.view.ViewCompat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.io.InputStream
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val TAG = "ImageReceivingInput"
private val IMAGE_MIME_TYPES = arrayOf("image/*")

// Larger than typical camera photos and keyboard stickers, small enough to keep a
// stray video-sized file or decompression bomb away from the photo pipeline.
private const val MAX_IMAGE_BYTES = 20L * 1024 * 1024
// A small, highly compressed file can still decode to gigabytes; 50 MP covers 48 MP
// camera photos while keeping the decoded bitmap around 200 MB at most.
private const val MAX_IMAGE_PIXELS = 50_000_000L
private const val COPY_DIR = "received-images"
private const val STALE_COPY_MS = 60L * 60 * 1000

/**
 * Lets the [EditText] child receive images from the keyboard (clipboard chip and
 * commitContent stickers/GIFs), long-press Paste and drag and drop on Android.
 * Text payloads are passed back to the EditText unchanged.
 */
class ImageReceivingInputModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ImageReceivingInputModule")

    View(ImageReceivingInputView::class) {
      Events("onImageReceived", "onImageRejected")
    }
  }
}

class ImageReceivingInputView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext) {
  private val onImageReceived by EventDispatcher()
  private val onImageRejected by EventDispatcher()
  private val copyDir = File(context.cacheDir, COPY_DIR)
  private var editText: EditText? = null

  private val listener = OnReceiveContentListener { _, payload -> receive(payload) }

  init {
    appContext.backgroundCoroutineScope.launch { deleteStaleCopies() }
  }

  // React Native lays out the wrapped input, as in ReactViewGroup. Without these, an
  // Android layout pass (e.g. while typing) shrinks the input to its wrap-content width.
  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(
      MeasureSpec.getSize(widthMeasureSpec),
      MeasureSpec.getSize(heightMeasureSpec),
    )
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) = Unit

  override fun onViewAdded(child: View) {
    super.onViewAdded(child)
    val found = findEditText(child) ?: return
    editText = found
    ViewCompat.setOnReceiveContentListener(found, IMAGE_MIME_TYPES, listener)
    // Keyboards read the accepted MIME types when the input connection starts.
    if (found.isFocused) {
      context.getSystemService(InputMethodManager::class.java)?.restartInput(found)
    }
  }

  override fun onViewRemoved(child: View) {
    super.onViewRemoved(child)
    val current = editText ?: return
    if (findEditText(child) === current) {
      ViewCompat.setOnReceiveContentListener(current, null, null)
      editText = null
    }
  }

  private fun findEditText(view: View): EditText? {
    if (view is EditText) return view
    if (view !is ViewGroup) return null
    for (i in 0 until view.childCount) {
      findEditText(view.getChildAt(i))?.let { return it }
    }
    return null
  }

  /** Runs on the main thread. Returns the payload items the EditText should still handle. */
  private fun receive(payload: ContentInfoCompat): ContentInfoCompat? {
    val images = mutableListOf<Pair<InputStream, String>>()
    val split = payload.partition { item: ClipData.Item ->
      val uri = item.uri ?: return@partition false
      val mimeType = imageMimeType(uri, payload.clip.description) ?: return@partition false
      // Open now: keyboard and drag-and-drop grants can end when this listener returns,
      // but a stream opened within the grant stays readable.
      val input = try {
        context.contentResolver.openInputStream(uri)
      } catch (e: Exception) {
        Log.w(TAG, "Could not open received image", e)
        null
      }
      if (input == null) onImageRejected(mapOf("reason" to "invalid"))
      else images += input to mimeType
      true
    }

    if (images.isNotEmpty()) {
      appContext.backgroundCoroutineScope.launch {
        for ((input, mimeType) in images) copyAndEmit(input, mimeType)
      }.invokeOnCompletion {
        // Also runs when the job is cancelled before or during the copies.
        images.forEach { (input) -> runCatching { input.close() } }
      }
    }
    return split.second
  }

  private fun imageMimeType(uri: Uri, description: ClipDescription): String? {
    val mimeType = runCatching { context.contentResolver.getType(uri) }.getOrNull()
      ?: (0 until description.mimeTypeCount).map(description::getMimeType)
        .firstOrNull { it.startsWith("image/") }
    return mimeType?.takeIf { it.startsWith("image/") }
  }

  private suspend fun copyAndEmit(input: InputStream, mimeType: String) {
    val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType) ?: "img"
    val file = File(copyDir, "${UUID.randomUUID()}.$extension")
    val result = try {
      val withinLimit = input.use {
        copyDir.mkdirs()
        copyWithLimit(it, file)
      }
      if (withinLimit) checkDecodedSize(file) else "too-large"
    } catch (e: Exception) {
      Log.w(TAG, "Could not copy received image", e)
      "invalid"
    }

    if (result != null) file.delete()
    try {
      withContext(Dispatchers.Main) {
        if (result == null) {
          onImageReceived(mapOf("uri" to Uri.fromFile(file).toString(), "mimeType" to mimeType))
        } else {
          onImageRejected(mapOf("reason" to result))
        }
      }
    } catch (e: CancellationException) {
      file.delete()
      throw e
    }
  }

  /** Copies at most [MAX_IMAGE_BYTES]; returns false (leaving a partial file) when larger. */
  private fun copyWithLimit(input: InputStream, file: File): Boolean {
    file.outputStream().use { output ->
      val buffer = ByteArray(64 * 1024)
      var total = 0L
      while (true) {
        val read = input.read(buffer)
        if (read < 0) return true
        total += read
        if (total > MAX_IMAGE_BYTES) return false
        output.write(buffer, 0, read)
      }
    }
  }

  /** Returns a rejection reason, or null when the file decodes to an acceptable size. */
  private fun checkDecodedSize(file: File): String? {
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, options)
    return when {
      options.outWidth <= 0 || options.outHeight <= 0 -> "invalid"
      options.outWidth.toLong() * options.outHeight > MAX_IMAGE_PIXELS -> "too-large"
      else -> null
    }
  }

  /** Removes copies JS never handled, e.g. when the editor closed mid-copy. */
  private fun deleteStaleCopies() {
    val cutoff = System.currentTimeMillis() - STALE_COPY_MS
    copyDir.listFiles()?.filter { it.lastModified() < cutoff }?.forEach { it.delete() }
  }
}
