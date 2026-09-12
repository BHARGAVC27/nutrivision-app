package com.nutrivision.vision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.ByteBufferExtractor
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.imagesegmenter.ImageSegmenter
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * MediaPipe Selfie Segmenter (general 256x256 model) wrapped to hand back a
 * person mask, plus the `segment_person` orchestration around it.
 *
 * This is the `mp-selfie` segmenter the shipped calibration was fitted on
 * (`tools/stage2_segmentation.py::MediaPipeSelfieSegmenter`). The chain after
 * the model — resize, bilateral filter, threshold, open/close, largest
 * component, bottom padding, pose repair, lower-body refinement pass — is
 * ported step for step, because every ratio feature is normalised by a body
 * height read off this mask and a different chain gives a different height.
 */
class PersonSegmenter(private val context: Context) {

  companion object {
    private const val MODEL_ASSET = "selfie_segmenter.tflite"

    // SEG_CONFIG in tools/stage2_segmentation.py. The imgsz/conf entries are
    // YOLO-only; the MediaPipe path uses just the binarisation thresholds.
    const val PASS1_BIN_THRESH = 0.52f
    const val PASS2_BIN_THRESH = 0.44f
    const val PASS1_PAD_RATIO = 0.12
    const val PASS2_PAD_RATIO = 0.20
    const val PASS2_TOP_FRACTION = 0.35
    const val PAD_GRAY = 127
  }

  @Volatile
  private var segmenter: ImageSegmenter? = null

  private fun requireSegmenter(): ImageSegmenter {
    segmenter?.let { return it }
    return synchronized(this) {
      segmenter ?: ImageSegmenter.createFromOptions(
        context,
        ImageSegmenter.ImageSegmenterOptions.builder()
          .setBaseOptions(BaseOptions.builder().setModelAssetPath(MODEL_ASSET).build())
          .setRunningMode(RunningMode.IMAGE)
          .setOutputConfidenceMasks(true)
          .setOutputCategoryMask(false)
          .build()
      ).also { segmenter = it }
    }
  }

  class Segmentation(val mask: Mask?, val ok: Boolean, val reason: String, val usedRefinement: Boolean, val feetOk: Boolean)

  /**
   * `_add_bottom_padding`: a strip of flat grey below the image so a subject
   * whose feet touch the frame edge still gets a closed silhouette.
   */
  private fun padBottom(src: Bitmap, padRatio: Double): Bitmap {
    val pad = max(8, (src.height * padRatio).roundToInt())
    val out = Bitmap.createBitmap(src.width, src.height + pad, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    canvas.drawColor(Color.rgb(PAD_GRAY, PAD_GRAY, PAD_GRAY))
    canvas.drawBitmap(src, 0f, 0f, null)
    return out
  }

  private fun maskToFloats(img: MPImage): FloatArray {
    val buf = ByteBufferExtractor.extract(img).order(ByteOrder.nativeOrder()).asFloatBuffer()
    val out = FloatArray(img.width * img.height)
    buf.rewind()
    buf.get(out)
    return out
  }

  /**
   * Person probability map at the bitmap's own resolution. `landmarks` (clean
   * 33x3, normalized to this bitmap) settle which confidence channel is the
   * person: the channel that scores high at the torso joints wins. Without
   * landmarks, the channel with the lower mean is taken (a standing child
   * rarely fills more than half the frame).
   */
  private fun probability(bitmap: Bitmap, landmarks: Array<DoubleArray>?): FloatArray? {
    val result = requireSegmenter().segment(BitmapImageBuilder(bitmap).build())
    val masks = result.confidenceMasks().orElse(null) ?: return null
    if (masks.isEmpty()) return null

    val w = bitmap.width
    val h = bitmap.height
    val channels = masks.map { m -> MaskOps.resizeBilinear(maskToFloats(m), m.width, m.height, w, h) }
    if (channels.size == 1) return channels[0]

    fun torsoScore(p: FloatArray): Double {
      var sum = 0.0; var n = 0
      if (landmarks != null) {
        for (idx in intArrayOf(11, 12, 23, 24)) {
          val lm = landmarks[idx]
          if (lm[2] <= 0) continue
          val x = (lm[0] * w).toInt().coerceIn(0, w - 1)
          val y = (lm[1] * h).toInt().coerceIn(0, h - 1)
          sum += p[y * w + x]; n++
        }
      }
      if (n > 0) return sum / n
      // No landmarks: prefer the sparser channel.
      var s = 0.0
      for (v in p) s += v
      return 1.0 - s / p.size
    }

    return channels.maxByOrNull { torsoScore(it) }
  }

  /** `MediaPipeSelfieSegmenter.infer`: probability -> filtered binary mask, or null if empty. */
  private fun infer(bitmap: Bitmap, binThresh: Float, landmarks: Array<DoubleArray>?): Mask? {
    val w = bitmap.width
    val h = bitmap.height
    val prob = probability(bitmap, landmarks) ?: return null
    val smooth = MaskOps.bilateral(prob, w, h)
    var m = MaskOps.threshold(smooth, w, h, binThresh)
    m = MaskOps.open(m)
    m = MaskOps.close(m)
    m = MaskOps.largestComponent(m)
    return if (m.isEmpty()) null else m
  }

  /**
   * `segment_person`: two-pass, pose-repaired person segmentation.
   *
   * Pass 1 runs on the bottom-padded full frame. If the result still touches
   * the bottom edge, or the feet landmarks fall outside it, a second pass on
   * the lower 65% at a looser threshold is unioned in.
   */
  fun segmentPerson(image: Bitmap, landmarks: Array<DoubleArray>?): Segmentation {
    val h = image.height
    val w = image.width

    val padded = padBottom(image, PASS1_PAD_RATIO)
    val m1Full = try { infer(padded, PASS1_BIN_THRESH, landmarksForPadded(landmarks, h, padded.height)) } finally { padded.recycle() }
      ?: return Segmentation(null, false, "no_person_detected", false, false)
    val m1 = MaskOps.repairWithPose(MaskOps.cropRows(m1Full, h), landmarks)

    val needRefine = MaskOps.touchesBottom(m1) || !MaskOps.feetOk(m1, landmarks)

    var merged = m1
    var usedRefine = false
    if (needRefine) {
      val y0 = (PASS2_TOP_FRACTION * h).toInt()
      val lower = Bitmap.createBitmap(image, 0, y0, w, h - y0)
      val lowerPadded = try { padBottom(lower, PASS2_PAD_RATIO) } finally { lower.recycle() }
      val m2 = try {
        infer(lowerPadded, PASS2_BIN_THRESH, landmarksForCrop(landmarks, y0, h, lowerPadded.height))
      } finally { lowerPadded.recycle() }
      if (m2 != null) {
        val full = Mask(w, h)
        val rows = h - y0
        System.arraycopy(m2.data, 0, full.data, y0 * w, w * rows)
        merged = MaskOps.repairWithPose(MaskOps.union(m1, full), landmarks)
        usedRefine = true
      }
    }

    return Segmentation(merged, true, "ok", usedRefine, MaskOps.feetOk(merged, landmarks))
  }

  /** Re-normalise landmark y for the padded image so the channel pick stays right. */
  private fun landmarksForPadded(lm: Array<DoubleArray>?, h: Int, paddedH: Int): Array<DoubleArray>? {
    if (lm == null) return null
    val scale = h.toDouble() / paddedH
    return Array(lm.size) { i -> doubleArrayOf(lm[i][0], lm[i][1] * scale, lm[i][2]) }
  }

  private fun landmarksForCrop(lm: Array<DoubleArray>?, y0: Int, h: Int, paddedH: Int): Array<DoubleArray>? {
    if (lm == null) return null
    return Array(lm.size) { i ->
      val y = lm[i][1] * h - y0
      if (lm[i][2] <= 0 || y < 0) doubleArrayOf(-1.0, -1.0, 0.0)
      else doubleArrayOf(lm[i][0], y / paddedH, lm[i][2])
    }
  }

  fun close() {
    synchronized(this) {
      segmenter?.close()
      segmenter = null
    }
  }
}
