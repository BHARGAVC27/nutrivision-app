package com.nutrivision.vision

import android.speech.tts.TextToSpeech
import expo.modules.kotlin.Promise
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

    /**
     * BCP-47 tags of the languages the phone can speak *offline, right now*.
     *
     * Not the vision pipeline, but it has to be native: expo-speech's
     * `getAvailableVoicesAsync` returns `TextToSpeech.getVoices()` unfiltered,
     * and Android lists voices whose data has never been downloaded (feature
     * `notInstalled`) and voices that only work with a network connection.
     * Indian-language voices are downloadable packs, so on a phone that has
     * never been online that list still says "Hindi: yes" — precisely the case
     * Settings needs to warn about. The two flags that tell the difference
     * are only on the Android `Voice` object.
     *
     * Resolves to an empty list when there is no TTS engine at all.
     */
    AsyncFunction("offlineVoiceLanguages") { promise: Promise ->
      var tts: TextToSpeech? = null
      tts = TextToSpeech(context) { status ->
        val langs = if (status == TextToSpeech.SUCCESS) {
          try {
            tts?.voices
              ?.filter { v ->
                !v.isNetworkConnectionRequired &&
                  !v.features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)
              }
              ?.map { it.locale.toLanguageTag() }
              ?.distinct()
              ?: emptyList()
          } catch (e: Exception) {
            emptyList()
          }
        } else {
          emptyList()
        }
        promise.resolve(langs)
        tts?.shutdown()
      }
    }

    OnDestroy {
      livePose.close()
      stillPose.close()
      segmenter.close()
    }
  }
}
