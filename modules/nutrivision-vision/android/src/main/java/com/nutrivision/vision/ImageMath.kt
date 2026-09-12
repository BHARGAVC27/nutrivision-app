package com.nutrivision.vision

import android.graphics.Bitmap

/**
 * Pixel math for the Stage 1 quality gate, on the captured still.
 *
 * Ported from `tools/stage1_quality_gate.py`:
 *   blur       = cv2.Laplacian(gray, CV_64F).var()
 *   brightness = gray.mean()
 *
 * The live preview path runs the same two formulas in a JS worklet
 * (`src/quality/luma.ts`) straight off the camera's Y plane. Keep the two in
 * step. The thresholds they are judged against live in exactly one place,
 * `src/quality/gate.ts`.
 */
object ImageMath {

  /** OpenCV's COLOR_BGR2GRAY weights: Y = 0.299R + 0.587G + 0.114B. */
  fun bitmapToGray(bitmap: Bitmap): ByteArray {
    val width = bitmap.width
    val height = bitmap.height
    val pixels = IntArray(width * height)
    bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

    val gray = ByteArray(width * height)
    for (i in pixels.indices) {
      val pixel = pixels[i]
      val r = (pixel shr 16) and 0xFF
      val g = (pixel shr 8) and 0xFF
      val b = pixel and 0xFF
      gray[i] = (0.299 * r + 0.587 * g + 0.114 * b + 0.5).toInt().coerceIn(0, 255).toByte()
    }
    return gray
  }

  /** Replicates a grayscale buffer across RGB so MediaPipe can consume it. */
  fun grayToBitmap(gray: ByteArray, width: Int, height: Int): Bitmap {
    val pixels = IntArray(width * height)
    for (i in pixels.indices) {
      val v = gray[i].toInt() and 0xFF
      pixels[i] = (0xFF shl 24) or (v shl 16) or (v shl 8) or v
    }
    return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
  }

  /** Mean grayscale intensity, 0..255. */
  fun brightness(gray: ByteArray): Double {
    if (gray.isEmpty()) return 0.0
    var sum = 0L
    for (b in gray) sum += (b.toInt() and 0xFF)
    return sum.toDouble() / gray.size
  }

  /**
   * Variance of the Laplacian using OpenCV's default 3x3 kernel
   * ([[0,1,0],[1,-4,1],[0,1,0]], ksize=1), with numpy's population variance
   * (ddof=0).
   *
   * Interior pixels only — OpenCV reflects at the border, but a one-pixel frame
   * contributes negligibly at any real camera resolution.
   */
  fun laplacianVariance(gray: ByteArray, width: Int, height: Int): Double {
    if (width < 3 || height < 3) return 0.0

    var sum = 0.0
    var sumSq = 0.0
    val count = (width - 2).toLong() * (height - 2).toLong()

    for (y in 1 until height - 1) {
      val row = y * width
      val rowAbove = row - width
      val rowBelow = row + width
      for (x in 1 until width - 1) {
        val lap = (
          (gray[rowAbove + x].toInt() and 0xFF) +
            (gray[rowBelow + x].toInt() and 0xFF) +
            (gray[row + x - 1].toInt() and 0xFF) +
            (gray[row + x + 1].toInt() and 0xFF) -
            4 * (gray[row + x].toInt() and 0xFF)
          ).toDouble()
        sum += lap
        sumSq += lap * lap
      }
    }

    if (count == 0L) return 0.0
    val mean = sum / count
    return sumSq / count - mean * mean
  }
}
