package com.nutrivision.vision

import android.graphics.Bitmap
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Stage 2B — the arm profile and body metrics, ported from
 * `tools/stage2_features.py`. Same sample fractions, same ray-cast, same
 * plausibility bounds, same median; the JS side turns these pixel quantities
 * into the 23 ratio features (see `src/pipeline/features.ts`).
 */
object ArmProfile {

  /** Sample points along shoulder->elbow (WHO measures MUAC at 0.5). */
  val ARM_FRACTIONS = doubleArrayOf(0.30, 0.40, 0.50, 0.60, 0.70)

  /** Hard stop so a ray can never run off across the image. */
  private const val MAX_SCAN_PX = 400

  /** Plausible upper-arm radius as a fraction of standing body height. */
  private const val RADIUS_RATIO_MIN = 0.008
  private const val RADIUS_RATIO_MAX = 0.048

  class BodyMetrics(
    val heightPx: Double, val widthPx: Double, val areaPx: Double,
    val left: Int, val top: Int, val right: Int, val bottom: Int,
    val shoulderPx: Double?, val hipPx: Double?, val torsoPx: Double?,
  )

  class Sample(
    val fraction: Double, val ok: Boolean,
    val radiusPx: Double = Double.NaN, val separated: Boolean = false, val plausible: Boolean = false,
    /** Sample point in normalized image coordinates, for the provenance overlay. */
    val x: Double = Double.NaN, val y: Double = Double.NaN,
  )

  class Profile(
    val ok: Boolean, val reason: String, val side: String,
    val armLenPx: Double = Double.NaN, val armVis: Double = Double.NaN,
    val nOk: Int = 0, val nImplausible: Int = 0, val nSeparated: Int = 0,
    val radiusPxMed: Double = Double.NaN, val radiusPxIqr: Double = Double.NaN,
    val samples: List<Sample> = emptyList(),
  )

  /** `body_metrics_from_mask`: body-scale references in pixels. */
  fun bodyMetrics(mask: Mask, lm: Array<DoubleArray>?): BodyMetrics? {
    val w = mask.width; val h = mask.height
    var minX = w; var maxX = -1; var minY = h; var maxY = -1
    var area = 0L
    for (y in 0 until h) for (x in 0 until w) if (mask[x, y]) {
      area++
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
    if (maxX < 0) return null
    val heightPx = (maxY - minY + 1).toDouble()

    fun pt(i: Int): DoubleArray? {
      val p = lm?.get(i) ?: return null
      return if (p[2] <= 0) null else doubleArrayOf(p[0] * w, p[1] * h)
    }
    fun dist(a: DoubleArray, b: DoubleArray) = hypot(a[0] - b[0], a[1] - b[1])

    val lSh = pt(11); val rSh = pt(12); val lHip = pt(23); val rHip = pt(24)
    val shoulder = if (lSh != null && rSh != null) dist(lSh, rSh) else null
    val hip = if (lHip != null && rHip != null) dist(lHip, rHip) else null
    val torso = if (lSh != null && rSh != null && lHip != null && rHip != null)
      dist(doubleArrayOf((lSh[0] + rSh[0]) / 2, (lSh[1] + rSh[1]) / 2), doubleArrayOf((lHip[0] + rHip[0]) / 2, (lHip[1] + rHip[1]) / 2))
    else null

    return BodyMetrics(
      heightPx, (maxX - minX + 1).toDouble(), area.toDouble(),
      minX, minY, maxX, maxY, shoulder, hip, torso,
    )
  }

  private fun inMask(mask: Mask, x: Double, y: Double): Boolean {
    val xi = x.roundToInt(); val yi = y.roundToInt()
    return xi in 0 until mask.width && yi in 0 until mask.height && mask[xi, yi]
  }

  /** Distance (px) from start along a unit direction until the mask ends; null if it runs off-frame. */
  private fun scanToEdge(mask: Mask, sx: Double, sy: Double, dx: Double, dy: Double): Double? {
    for (step in 1..MAX_SCAN_PX) {
      val x = (sx + step * dx).roundToInt()
      val y = (sy + step * dy).roundToInt()
      if (x < 0 || x >= mask.width || y < 0 || y >= mask.height) return null
      if (!mask[x, y]) return step.toDouble()
    }
    return null
  }

  /** Pose landmarks can sit a few px outside the silhouette; snap inside. */
  private fun nudgeIntoMask(mask: Mask, x: Double, y: Double, maxR: Int = 12): DoubleArray? {
    if (inMask(mask, x, y)) return doubleArrayOf(x, y)
    for (r in 1..maxR) {
      for (k in 0 until 8) {
        val ang = 2 * PI * k / 8
        val qx = x + r * cos(ang); val qy = y + r * sin(ang)
        if (inMask(mask, qx, qy)) return doubleArrayOf(qx, qy)
      }
    }
    return null
  }

  /** numpy.percentile with linear interpolation. */
  fun percentile(sorted: DoubleArray, p: Double): Double {
    if (sorted.isEmpty()) return Double.NaN
    if (sorted.size == 1) return sorted[0]
    val idx = (p / 100.0) * (sorted.size - 1)
    val lo = idx.toInt()
    val hi = min(sorted.size - 1, lo + 1)
    val frac = idx - lo
    return sorted[lo] + frac * (sorted[hi] - sorted[lo])
  }

  fun median(values: DoubleArray): Double = percentile(values.sortedArray(), 50.0)

  /** `extract_arm_profile`: upper-arm thickness along a five-point profile. */
  fun extract(mask: Mask, lm: Array<DoubleArray>, heightPx: Double?): Profile {
    val w = mask.width; val h = mask.height

    fun vis(i: Int) = lm[i][2]
    val leftVis = 0.2 * vis(11) + 0.4 * vis(13) + 0.4 * vis(15)
    val rightVis = 0.2 * vis(12) + 0.4 * vis(14) + 0.4 * vis(16)
    val side = if (leftVis >= rightVis) "left" else "right"
    val shI = if (side == "left") 11 else 12
    val elI = if (side == "left") 13 else 14

    if (lm[shI][2] <= 0 || lm[elI][2] <= 0) return Profile(false, "arm_landmarks_missing", side)

    val shX = lm[shI][0] * w; val shY = lm[shI][1] * h
    val elX = lm[elI][0] * w; val elY = lm[elI][1] * h
    val axX = elX - shX; val axY = elY - shY
    val armLen = hypot(axX, axY)
    if (armLen < 5) return Profile(false, "degenerate_arm_axis", side, armLenPx = armLen)
    val ux = axX / armLen; val uy = axY / armLen
    var px = -uy; var py = ux

    // Outward = away from the torso centre, so the scan heads for the free
    // silhouette edge rather than into the body.
    var tcx = 0.0; var tcy = 0.0; var tn = 0
    for (i in intArrayOf(11, 12, 23, 24)) if (lm[i][2] > 0) { tcx += lm[i][0] * w; tcy += lm[i][1] * h; tn++ }
    if (tn > 0) {
      tcx /= tn; tcy /= tn
      val midX = 0.5 * (shX + elX); val midY = 0.5 * (shY + elY)
      if (px * (midX - tcx) + py * (midY - tcy) <= 0) { px = -px; py = -py }
    }

    val samples = ArrayList<Sample>()
    for (f in ARM_FRACTIONS) {
      val p0x = shX + f * axX; val p0y = shY + f * axY
      val nx = p0x / w; val ny = p0y / h
      val p = nudgeIntoMask(mask, p0x, p0y)
      if (p == null) { samples.add(Sample(f, false, x = nx, y = ny)); continue }
      val dOut = scanToEdge(mask, p[0], p[1], px, py)
      val dIn = scanToEdge(mask, p[0], p[1], -px, -py)
      if (dOut == null) { samples.add(Sample(f, false, x = nx, y = ny)); continue }
      // Both-sides width only means something when the inner edge is the
      // arm's own edge rather than the far side of the torso.
      val separated = dIn != null && dIn <= 3.0 * dOut
      var plausible = true
      if (heightPx != null && heightPx > 0) {
        val ratio = dOut / heightPx
        plausible = ratio in RADIUS_RATIO_MIN..RADIUS_RATIO_MAX
      }
      samples.add(Sample(f, true, dOut, separated, plausible, nx, ny))
    }

    val good = samples.filter { it.ok && it.plausible }
    val nImpl = samples.count { it.ok && !it.plausible }
    if (good.isEmpty()) {
      return Profile(
        false, if (nImpl > 0) "all_samples_implausible" else "no_valid_width_samples", side,
        armLenPx = armLen, nImplausible = nImpl, samples = samples,
      )
    }

    val radii = good.map { it.radiusPx }.toDoubleArray().sortedArray()
    return Profile(
      true, "ok", side,
      armLenPx = armLen,
      armVis = max(leftVis, rightVis),
      nOk = good.size,
      nImplausible = nImpl,
      nSeparated = good.count { it.separated },
      radiusPxMed = percentile(radii, 50.0),
      radiusPxIqr = percentile(radii, 75.0) - percentile(radii, 25.0),
      samples = samples,
    )
  }

  /**
   * `skin_visibility`: a continuous 0–1 score for how much bare skin the upper
   * arm shows. A feature, never a gate (docs/ANDROID_APP_BRIEF.md §6).
   */
  fun skinScore(image: Bitmap, lm: Array<DoubleArray>, side: String): Double {
    val w = image.width; val h = image.height
    val shI = if (side == "left") 11 else 12
    val elI = if (side == "left") 13 else 14
    val wrI = if (side == "left") 15 else 16
    if (lm[shI][2] <= 0 || lm[elI][2] <= 0) return Double.NaN

    val shX = lm[shI][0] * w; val shY = lm[shI][1] * h
    val elX = lm[elI][0] * w; val elY = lm[elI][1] * h

    // Patch bounds follow the Python `int()` truncation exactly.
    fun patch(cx: Double, cy: Double, half: Int): IntArray? {
      val x0 = max(0, cx.toInt() - half); val x1 = min(w, cx.toInt() + half)
      val y0 = max(0, cy.toInt() - half); val y1 = min(h, cy.toInt() + half)
      if (x1 <= x0 || y1 <= y0) return null
      val pw = x1 - x0; val ph = y1 - y0
      val out = IntArray(pw * ph + 2)
      out[0] = pw; out[1] = ph
      image.getPixels(out, 2, pw, x0, y0, pw, ph)
      return out
    }

    fun meanRgb(p: IntArray): DoubleArray {
      var r = 0.0; var g = 0.0; var b = 0.0
      val n = p.size - 2
      for (i in 2 until p.size) {
        val c = p[i]
        r += (c shr 16) and 0xFF; g += (c shr 8) and 0xFF; b += c and 0xFF
      }
      return doubleArrayOf(r / n, g / n, b / n)
    }

    val refX = if (lm[wrI][2] > 0) lm[wrI][0] * w else elX
    val refY = if (lm[wrI][2] > 0) lm[wrI][1] * h else elY
    val ref = patch(refX, refY, 10)
    val refMean = if (ref != null) meanRgb(ref) else doubleArrayOf(0.0, 0.0, 0.0)

    var best = Double.NaN
    for (f in ARM_FRACTIONS) {
      val pt = patch(shX + f * (elX - shX), shY + f * (elY - shY), 12) ?: continue
      val pw = pt[0]; val ph = pt[1]
      val n = pw * ph

      // YCrCb skin range (OpenCV BGR2YCrCb constants), Y unconstrained.
      var skin = 0
      val gray = DoubleArray(n)
      for (i in 0 until n) {
        val c = pt[i + 2]
        val r = ((c shr 16) and 0xFF).toDouble()
        val g = ((c shr 8) and 0xFF).toDouble()
        val b = (c and 0xFF).toDouble()
        val yy = 0.299 * r + 0.587 * g + 0.114 * b
        val cr = (r - yy) * 0.713 + 128.0
        val cb = (b - yy) * 0.564 + 128.0
        if (cr.roundToInt() in 133..173 && cb.roundToInt() in 77..127) skin++
        gray[i] = (yy + 0.5).toInt().coerceIn(0, 255).toDouble()
      }
      val skinRatio = skin.toDouble() / max(1, n)

      val lap = laplacianVarianceReflect(gray, pw, ph)
      val m = meanRgb(pt)
      val delta = sqrt((m[0] - refMean[0]).let { it * it } + (m[1] - refMean[1]).let { it * it } + (m[2] - refMean[2]).let { it * it })

      val score = 0.50 * skinRatio + 0.30 * (1.0 - min(1.0, lap / 500.0)) + 0.20 * (1.0 - min(1.0, delta / 80.0))
      if (best.isNaN() || score > best) best = score
    }
    return best
  }

  /**
   * `cv2.Laplacian(gray, CV_64F).var()` on a small patch, with OpenCV's default
   * BORDER_REFLECT_101. On a 24x24 patch the border rows are a sixth of the
   * pixels, so unlike the full-frame blur check they cannot be skipped.
   */
  private fun laplacianVarianceReflect(g: DoubleArray, w: Int, h: Int): Double {
    if (w < 2 || h < 2) return 0.0
    fun rx(x: Int) = if (x < 0) -x else if (x >= w) 2 * w - x - 2 else x
    fun ry(y: Int) = if (y < 0) -y else if (y >= h) 2 * h - y - 2 else y
    fun at(x: Int, y: Int) = g[ry(y) * w + rx(x)]
    var sum = 0.0; var sumSq = 0.0
    for (y in 0 until h) for (x in 0 until w) {
      val lap = at(x, y - 1) + at(x, y + 1) + at(x - 1, y) + at(x + 1, y) - 4 * at(x, y)
      sum += lap; sumSq += lap * lap
    }
    val n = (w * h).toDouble()
    val mean = sum / n
    return sumSq / n - mean * mean
  }
}
