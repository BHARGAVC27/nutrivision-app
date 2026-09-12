package com.nutrivision.vision

import android.content.Context
import android.graphics.Bitmap
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker

/**
 * Wraps MediaPipe Tasks' Pose Landmarker.
 *
 * The model files are bundled into `android/app/src/main/assets/` by the Expo
 * config plugin `plugins/with-nutrivision-assets.js`, so MediaPipe can load
 * them through the AssetManager by name.
 *
 * Two instances exist in the app: the *lite* model for the live Stage 1
 * framing check (speed), and the *full* model for the Stage 2 measurement on
 * the captured still (matches the `model_complexity=1` solution the desktop
 * features were extracted with).
 *
 * RunningMode.IMAGE (a synchronous `detect()`) rather than LIVE_STREAM: callers
 * sample at ~3 fps and want the result inline, and LIVE_STREAM's async
 * result-listener plus monotonic-timestamp bookkeeping buys nothing at that
 * rate.
 */
class PoseDetector(private val context: Context, private val modelAsset: String) {

  companion object {
    const val MODEL_LITE = "pose_landmarker_lite.task"
    const val MODEL_FULL = "pose_landmarker_full.task"

    /** MediaPipe / BlazePose emit 33 landmarks. */
    const val LANDMARK_COUNT = 33

    private const val MIN_CONFIDENCE = 0.5f
  }

  @Volatile
  private var landmarker: PoseLandmarker? = null

  private fun requireLandmarker(): PoseLandmarker {
    landmarker?.let { return it }
    return synchronized(this) {
      landmarker ?: PoseLandmarker.createFromOptions(
        context,
        PoseLandmarker.PoseLandmarkerOptions.builder()
          .setBaseOptions(
            BaseOptions.builder().setModelAssetPath(modelAsset).build()
          )
          .setRunningMode(RunningMode.IMAGE)
          .setNumPoses(1)
          .setMinPoseDetectionConfidence(MIN_CONFIDENCE)
          .setMinPosePresenceConfidence(MIN_CONFIDENCE)
          .setMinTrackingConfidence(MIN_CONFIDENCE)
          .build()
      ).also { landmarker = it }
    }
  }

  /**
   * Returns the landmarks flattened as `[x0, y0, visibility0, x1, ...]` in
   * normalized (0..1) image coordinates.
   *
   * An empty array means no person was found. That is a normal result, not an
   * error — the framing check turns it into "No person detected".
   */
  fun detect(bitmap: Bitmap): DoubleArray {
    val result = requireLandmarker().detect(BitmapImageBuilder(bitmap).build())

    val poses = result.landmarks()
    if (poses.isEmpty()) return DoubleArray(0)

    val landmarks = poses[0]
    val out = DoubleArray(landmarks.size * 3)
    landmarks.forEachIndexed { i, landmark ->
      out[i * 3] = landmark.x().toDouble()
      out[i * 3 + 1] = landmark.y().toDouble()
      // `visibility` is an Optional<Float>; absent means the model reported no
      // estimate, which the framing check should read as "not visible".
      out[i * 3 + 2] = landmark.visibility().orElse(0f).toDouble()
    }
    return out
  }

  fun close() {
    synchronized(this) {
      landmarker?.close()
      landmarker = null
    }
  }
}
