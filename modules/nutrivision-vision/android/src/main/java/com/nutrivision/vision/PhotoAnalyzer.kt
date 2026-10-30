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
   * Every analyzed still is normalized to this long edge before scoring. The
   * camera capture path already targets ~1920px for exactly this reason (see
   * capture.tsx), and the blur threshold in `src/quality/gate.ts` (29.44) is
   * calibrated against images at that scale — variance-of-the-Laplacian is
   * resolution dependent, so a gallery photo at its native resolution (often
   * 4000px+) would score very differently for the same real sharpness.
   * Downscaling only (never up) keeps this a normalization, not an upscale
   * blur-hiding trick.
   */
  private const val TARGET_LONG_EDGE = 1920

  /** Safety net against OOM decoding a very large gallery photo, ahead of the precise resize to TARGET_LONG_EDGE above. */
  private const val DECODE_MAX_LONG_EDGE = 3072

  /**
   * The Stage 1 pixel checks (blur, brightness) run on the photo as it is,
   * up to this long edge. `tools/stage1_quality_gate.py` read every training
   * photo with `cv2.imread` and never resized it, and the 29.44 blur threshold
   * was tuned on those native-resolution scores. Variance-of-the-Laplacian
   * falls as an image is downscaled, so scoring a shrunken copy against the
   * same number rejects sharp photos the desktop gate would accept. A camera
   * still is captured at 1920px (capture.tsx), so for it "native" is 1920 and
   * this changes nothing; a gallery photo keeps its own resolution. 4096 is a
   * memory bound (a 12 MP bitmap is ~50 MB), not a normalisation.
   */
  private const val NATIVE_MAX_LONG_EDGE = 4096

  fun analyze(detector: PoseDetector, path: String): Map<String, Any> {
    val file = File(path)
    if (!file.exists()) {
      throw IllegalArgumentException("No photo at $path")
    }
    val native = applyExifRotation(
      file,
      decodeBounded(path, NATIVE_MAX_LONG_EDGE) ?: throw IllegalStateException("Could not decode photo at $path")
    )
    val blurLongEdge = maxOf(native.width, native.height)
    val gray = ImageMath.bitmapToGray(native)
    val blurScore = ImageMath.laplacianVariance(gray, native.width, native.height)
    val brightness = ImageMath.brightness(gray)

    // Framing is judged on the same normalised image Stage 2 measures on.
    val bitmap = normalizeScale(native)
    try {
      return mapOf(
        "blurScore" to blurScore,
        "brightness" to brightness,
        "blurLongEdge" to blurLongEdge,
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
    val bitmap = decodeBounded(path, DECODE_MAX_LONG_EDGE)
      ?: throw IllegalStateException("Could not decode photo at $path")
    return normalizeScale(applyExifRotation(file, bitmap))
  }

  private fun decodeBounded(path: String, maxLongEdge: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)

    var sampleSize = 1
    val longEdge = maxOf(bounds.outWidth, bounds.outHeight)
    while (longEdge / sampleSize > maxLongEdge) {
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

  /** Resizes down to TARGET_LONG_EDGE, preserving aspect ratio. A source already at or below that scale is left alone. */
  private fun normalizeScale(bitmap: Bitmap): Bitmap {
    val longEdge = maxOf(bitmap.width, bitmap.height)
    if (longEdge <= TARGET_LONG_EDGE) return bitmap
    val scale = TARGET_LONG_EDGE.toFloat() / longEdge
    val targetW = (bitmap.width * scale).toInt().coerceAtLeast(1)
    val targetH = (bitmap.height * scale).toInt().coerceAtLeast(1)
    val resized = Bitmap.createScaledBitmap(bitmap, targetW, targetH, true)
    if (resized !== bitmap) bitmap.recycle()
    return resized
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
