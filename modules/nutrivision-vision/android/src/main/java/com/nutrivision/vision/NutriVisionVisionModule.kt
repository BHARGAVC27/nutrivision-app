package com.nutrivision.vision

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Native half of NutriVision's image pipeline.
 *
 * Only the parts that genuinely need native code live here: MediaPipe pose and
 * segmentation inference (no JS binding exists), decoding the captured JPEG,
 * and the pixel-level mask/arm geometry that would be too slow across the
 * bridge. Blur and brightness on the *live preview* are computed in a JS
 * worklet instead — in YUV the Y plane is already grayscale, so that path
 * needs no native code at all. See `src/quality/luma.ts`.
 *
 * Every function returns raw measurements. Thresholds, the accept/reject
 * decision, the 23-feature vector, the MUAC regression and the referral
 * decision all live in `src/`, so the live and capture paths cannot disagree
 * about what "good" means and the model is testable off-device.
 */
class NutriVisionVisionModule : Module() {

  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  /** Lite model: live framing on the preview feed, ~3 fps. */
  private val livePose by lazy { PoseDetector(context, PoseDetector.MODEL_LITE) }

  /** Full model: the Stage 2 measurement on the captured still. */
  private val stillPose by lazy { PoseDetector(context, PoseDetector.MODEL_FULL) }

  private val segmenter by lazy { PersonSegmenter(context) }

  override fun definition() = ModuleDefinition {
    Name("NutriVisionVision")

    /**
     * Pose landmarks for one downsampled grayscale preview frame.
     *
     * The grayscale is replicated across RGB before inference. BlazePose is
     * trained on colour, but the framing check only asks coarse questions —
     * is a person there, how much of the frame do they fill, are they inside
     * the margins — which survive the loss of chroma. The capture-time check
     * runs on the full-colour still.
     *
     * Returns `[x0, y0, visibility0, x1, ...]`, or an empty list when no person
     * was detected.
     */
    AsyncFunction("detectPoseInGrayImage") { gray: ByteArray, width: Int, height: Int ->
      val bitmap = ImageMath.grayToBitmap(gray, width, height)
      try {
        livePose.detect(bitmap).toList()
      } finally {
        bitmap.recycle()
      }
    }

    /**
     * All three Stage 1 measurements for a captured still, given a filesystem
     * path (not a `file://` URL).
     */
    AsyncFunction("analyzePhoto") { path: String ->
      PhotoAnalyzer.analyze(stillPose, path)
    }

    /**
     * Stage 2 on a captured still: pose, person mask, body metrics, arm
     * profile and skin score, as raw pixel quantities. See
     * `MeasurementPipeline` and `src/pipeline/features.ts`.
     */
    AsyncFunction("measurePhoto") { path: String ->
      MeasurementPipeline.measure(stillPose, segmenter, path)
    }

    OnDestroy {
      livePose.close()
      stillPose.close()
      segmenter.close()
    }
  }
}
