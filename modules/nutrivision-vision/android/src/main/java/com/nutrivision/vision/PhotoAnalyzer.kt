package com.nutrivision.vision

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.IOException

/**
 * Runs all three Stage 1 measurements against a captured still.
 *
 * This is the authoritative pass: the live preview check is guidance computed
 * on a small preview buffer, while this one runs on the photo that would
 * actually be used. Both are judged against the same thresholds in
 * `src/quality/gate.ts` — this returns raw numbers only, and deliberately makes
 * no accept/reject decision of its own.
 */
object PhotoAnalyzer {

  /**
   * Safety net against OOM on very large captures. The photo output requests a
   * ~1920px-wide still, so this normally does not trigger; if a device hands
   * back something much larger, subsampling keeps the decode bounded. Note that
   * variance-of-the-Laplacian is resolution dependent, so a subsampled decode
   * would shift the blur score.
   */
  private const val MAX_LONG_EDGE = 2048

  fun analyze(detector: PoseDetector, path: String): Map<String, Any> {
    val bitmap = loadUpright(path)
    try {
      val gray = ImageMath.bitmapToGray(bitmap)
      return mapOf(
        "blurScore" to ImageMath.laplacianVariance(gray, bitmap.width, bitmap.height),
        "brightness" to ImageMath.brightness(gray),
        "width" to bitmap.width,
        "height" to bitmap.height,
        "landmarks" to detector.detect(bitmap).toList()
      )
    } finally {
      bitmap.recycle()
    }
  }

  /** Decodes a still, bounded in size and rotated to match what the viewfinder showed. */
  fun loadUpright(path: String): Bitmap {
    val file = File(path)
    if (!file.exists()) {
      throw IllegalArgumentException("No photo at $path")
    }
    val bitmap = decodeBounded(path)
      ?: throw IllegalStateException("Could not decode photo at $path")
    return applyExifRotation(file, bitmap)
  }

  private fun decodeBounded(path: String): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)

    var sampleSize = 1
    val longEdge = maxOf(bounds.outWidth, bounds.outHeight)
    while (longEdge / sampleSize > MAX_LONG_EDGE) {
      sampleSize *= 2
    }

    return BitmapFactory.decodeFile(
      path,
      BitmapFactory.Options().apply {
        inSampleSize = sampleSize
        inPreferredConfig = Bitmap.Config.ARGB_8888
      }
    )
  }

  /**
   * Applies the JPEG's EXIF orientation. Without this, pose landmarks would be
   * normalized against a sideways image and the framing check would disagree
   * with what the health worker saw in the viewfinder.
   */
  private fun applyExifRotation(file: File, bitmap: Bitmap): Bitmap {
    val orientation = try {
      ExifInterface(file.absolutePath)
        .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    } catch (e: IOException) {
      ExifInterface.ORIENTATION_NORMAL
    }

    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
      else -> return bitmap
    }

    val rotated =
      Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    if (rotated !== bitmap) bitmap.recycle()
    return rotated
  }
}
