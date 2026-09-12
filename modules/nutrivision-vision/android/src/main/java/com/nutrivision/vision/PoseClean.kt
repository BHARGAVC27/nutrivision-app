package com.nutrivision.vision

/**
 * Landmark cleaning + imputation, ported unchanged from the desktop
 * `tools/pose_utils.py` (`run_pose_module`).
 *
 * The Stage 2 features were extracted against the *clean* landmark matrix:
 * anything below the visibility threshold is dropped, then missing joints are
 * filled in from their skeleton neighbours (or mirrored across the body
 * midline) with a low placeholder visibility so downstream geometry stays
 * stable. Feeding the raw landmarks to the measurement instead would shift
 * the arm axis relative to what the calibration was fitted on.
 *
 * A landmark is `[x, y, visibility]` in normalized image coordinates;
 * missing = `[-1, -1, 0]`.
 */
object PoseClean {

  const val VIS_THRESHOLD = 0.45
  private const val MISSING_XY = -1.0
  private const val IMPUTED_VIS = 0.20

  private val MIRROR_PAIRS = mapOf(
    1 to 4, 2 to 5, 3 to 6, 7 to 8, 9 to 10,
    11 to 12, 13 to 14, 15 to 16, 17 to 18, 19 to 20, 21 to 22,
    23 to 24, 25 to 26, 27 to 28, 29 to 30, 31 to 32,
  )

  private val NEIGHBORS = mapOf(
    11 to intArrayOf(13, 23), 12 to intArrayOf(14, 24),
    13 to intArrayOf(11, 15), 14 to intArrayOf(12, 16),
    15 to intArrayOf(13, 17, 19, 21), 16 to intArrayOf(14, 18, 20, 22),
    23 to intArrayOf(11, 24, 25), 24 to intArrayOf(12, 23, 26),
    25 to intArrayOf(23, 27), 26 to intArrayOf(24, 28),
    27 to intArrayOf(25, 29, 31), 28 to intArrayOf(26, 30, 32),
    29 to intArrayOf(27, 31), 30 to intArrayOf(28, 32),
    31 to intArrayOf(27, 29), 32 to intArrayOf(28, 30),
  )

  /** `flat` is the detector's `[x, y, v, ...]`; empty means no pose. */
  fun toMatrix(flat: DoubleArray): Array<DoubleArray> {
    val out = Array(PoseDetector.LANDMARK_COUNT) { doubleArrayOf(MISSING_XY, MISSING_XY, 0.0) }
    val n = minOf(PoseDetector.LANDMARK_COUNT, flat.size / 3)
    for (i in 0 until n) {
      out[i][0] = flat[i * 3]
      out[i][1] = flat[i * 3 + 1]
      out[i][2] = flat[i * 3 + 2]
    }
    return out
  }

  fun clean(raw: Array<DoubleArray>, visThreshold: Double = VIS_THRESHOLD): Array<DoubleArray> {
    val out = Array(raw.size) { raw[it].copyOf() }
    for (lm in out) {
      if (lm[2] < visThreshold) {
        lm[0] = MISSING_XY
        lm[1] = MISSING_XY
        lm[2] = 0.0
      }
    }
    imputeMissing(out)
    return out
  }

  private fun midlineX(lm: Array<DoubleArray>): Double {
    val xs = intArrayOf(11, 12, 23, 24, 0).filter { lm[it][2] > 0 }.map { lm[it][0] }
    return if (xs.isEmpty()) 0.5 else xs.average()
  }

  private fun imputeMissing(out: Array<DoubleArray>) {
    for (idx in out.indices) {
      if (out[idx][2] > 0) continue
      val pts = NEIGHBORS[idx]?.filter { out[it][2] > 0 } ?: emptyList()
      if (pts.isNotEmpty()) {
        out[idx][0] = pts.map { out[it][0] }.average().coerceIn(0.0, 1.0)
        out[idx][1] = pts.map { out[it][1] }.average().coerceIn(0.0, 1.0)
        out[idx][2] = IMPUTED_VIS
      }
    }

    val midX = midlineX(out)
    for ((left, right) in MIRROR_PAIRS) {
      val lVis = out[left][2] > 0
      val rVis = out[right][2] > 0
      if (lVis && !rVis) {
        out[right][0] = (2 * midX - out[left][0]).coerceIn(0.0, 1.0)
        out[right][1] = out[left][1]
        out[right][2] = IMPUTED_VIS
      } else if (rVis && !lVis) {
        out[left][0] = (2 * midX - out[right][0]).coerceIn(0.0, 1.0)
        out[left][1] = out[right][1]
        out[left][2] = IMPUTED_VIS
      }
    }
  }

  fun flatten(lm: Array<DoubleArray>): List<Double> {
    val out = ArrayList<Double>(lm.size * 3)
    for (p in lm) { out.add(p[0]); out.add(p[1]); out.add(p[2]) }
    return out
  }
}
