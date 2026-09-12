package com.nutrivision.vision

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** A binary person mask, one byte per pixel, 1 = person. */
class Mask(val width: Int, val height: Int, val data: ByteArray = ByteArray(width * height)) {
  operator fun get(x: Int, y: Int): Boolean = data[y * width + x].toInt() != 0
  fun set(x: Int, y: Int, on: Boolean) { data[y * width + x] = if (on) 1 else 0 }
  fun copy() = Mask(width, height, data.copyOf())
  fun isEmpty(): Boolean = data.none { it.toInt() != 0 }
  fun count(): Int { var n = 0; for (b in data) if (b.toInt() != 0) n++; return n }
}

/**
 * The mask post-processing chain from `tools/stage2_segmentation.py`,
 * reimplemented without OpenCV. Every routine mirrors the OpenCV call it
 * replaces (kernel shape, border handling, variance convention) because the
 * calibration was fitted on masks produced by exactly that chain.
 */
object MaskOps {

  /** Bilinear resample of a float map. Stands in for `cv2.resize`. */
  fun resizeBilinear(src: FloatArray, sw: Int, sh: Int, dw: Int, dh: Int): FloatArray {
    if (sw == dw && sh == dh) return src
    val out = FloatArray(dw * dh)
    val sx = sw.toFloat() / dw
    val sy = sh.toFloat() / dh
    for (y in 0 until dh) {
      val fy = ((y + 0.5f) * sy - 0.5f).coerceIn(0f, (sh - 1).toFloat())
      val y0 = fy.toInt()
      val y1 = min(sh - 1, y0 + 1)
      val wy = fy - y0
      for (x in 0 until dw) {
        val fx = ((x + 0.5f) * sx - 0.5f).coerceIn(0f, (sw - 1).toFloat())
        val x0 = fx.toInt()
        val x1 = min(sw - 1, x0 + 1)
        val wx = fx - x0
        val top = src[y0 * sw + x0] * (1 - wx) + src[y0 * sw + x1] * wx
        val bot = src[y1 * sw + x0] * (1 - wx) + src[y1 * sw + x1] * wx
        out[y * dw + x] = top * (1 - wy) + bot * wy
      }
    }
    return out
  }

  /**
   * `cv2.bilateralFilter(prob, d=5, sigmaColor=0.08, sigmaSpace=4)` on a
   * float probability map. d=5 means a 5x5 window (radius 2). OpenCV's
   * coefficient convention: weight = exp(-0.5 * r² / σ²).
   */
  fun bilateral(prob: FloatArray, w: Int, h: Int, d: Int = 5, sigmaColor: Float = 0.08f, sigmaSpace: Float = 4f): FloatArray {
    val radius = d / 2
    val spaceCoeff = -0.5f / (sigmaSpace * sigmaSpace)
    val colorCoeff = -0.5f / (sigmaColor * sigmaColor)

    val offsets = ArrayList<Int>()
    val spaceW = ArrayList<Float>()
    for (dy in -radius..radius) for (dx in -radius..radius) {
      val r2 = (dx * dx + dy * dy).toFloat()
      if (r2 > radius * radius) continue
      offsets.add(dy * w + dx)
      spaceW.add(exp(r2 * spaceCoeff))
    }
    val offs = offsets.toIntArray()
    val sw = spaceW.toFloatArray()
    val dxs = IntArray(offs.size); val dys = IntArray(offs.size)
    run {
      var k = 0
      for (dy in -radius..radius) for (dx in -radius..radius) {
        if (dx * dx + dy * dy > radius * radius) continue
        dxs[k] = dx; dys[k] = dy; k++
      }
    }

    // Probabilities live in [0, 1]; a 1024-entry LUT on |Δ| is plenty.
    val lut = FloatArray(1025) { exp((it / 1024f) * (it / 1024f) * colorCoeff) }

    val out = FloatArray(w * h)
    for (y in 0 until h) {
      for (x in 0 until w) {
        val i = y * w + x
        val c = prob[i]
        var sum = 0f
        var wsum = 0f
        for (k in offs.indices) {
          val xx = x + dxs[k]
          val yy = y + dys[k]
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue
          val v = prob[i + offs[k]]
          val cw = lut[min(1024, (abs(v - c) * 1024f).toInt())] * sw[k]
          sum += v * cw
          wsum += cw
        }
        out[i] = if (wsum > 0f) sum / wsum else c
      }
    }
    return out
  }

  fun threshold(prob: FloatArray, w: Int, h: Int, thr: Float): Mask {
    val m = Mask(w, h)
    for (i in prob.indices) if (prob[i] >= thr) m.data[i] = 1
    return m
  }

  /**
   * 3x3 ellipse structuring element (`cv2.getStructuringElement(MORPH_ELLIPSE,
   * (3,3))` is the plus/cross shape). Erosion treats out-of-frame as 1 and
   * dilation as 0, matching OpenCV's default border behaviour.
   */
  private fun erode(m: Mask): Mask {
    val w = m.width; val h = m.height
    val out = Mask(w, h)
    for (y in 0 until h) for (x in 0 until w) {
      val i = y * w + x
      if (m.data[i].toInt() == 0) continue
      var keep = true
      if (x > 0 && m.data[i - 1].toInt() == 0) keep = false
      else if (x < w - 1 && m.data[i + 1].toInt() == 0) keep = false
      else if (y > 0 && m.data[i - w].toInt() == 0) keep = false
      else if (y < h - 1 && m.data[i + w].toInt() == 0) keep = false
      if (keep) out.data[i] = 1
    }
    return out
  }

  private fun dilate(m: Mask): Mask {
    val w = m.width; val h = m.height
    val out = Mask(w, h)
    for (y in 0 until h) for (x in 0 until w) {
      val i = y * w + x
      if (m.data[i].toInt() != 0) { out.data[i] = 1; continue }
      if ((x > 0 && m.data[i - 1].toInt() != 0) ||
        (x < w - 1 && m.data[i + 1].toInt() != 0) ||
        (y > 0 && m.data[i - w].toInt() != 0) ||
        (y < h - 1 && m.data[i + w].toInt() != 0)
      ) out.data[i] = 1
    }
    return out
  }

  fun open(m: Mask): Mask = dilate(erode(m))
  fun close(m: Mask): Mask = erode(dilate(m))

  /** `largest_component`: keep the biggest 8-connected blob. */
  fun largestComponent(m: Mask): Mask {
    val w = m.width; val h = m.height
    val labels = IntArray(w * h)
    var next = 0
    var bestLabel = 0
    var bestArea = 0
    val stack = IntArray(w * h)
    for (start in 0 until w * h) {
      if (m.data[start].toInt() == 0 || labels[start] != 0) continue
      next++
      var sp = 0
      stack[sp++] = start
      labels[start] = next
      var area = 0
      while (sp > 0) {
        val i = stack[--sp]
        area++
        val x = i % w; val y = i / w
        for (dy in -1..1) {
          val yy = y + dy
          if (yy < 0 || yy >= h) continue
          for (dx in -1..1) {
            if (dx == 0 && dy == 0) continue
            val xx = x + dx
            if (xx < 0 || xx >= w) continue
            val j = yy * w + xx
            if (m.data[j].toInt() != 0 && labels[j] == 0) {
              labels[j] = next
              stack[sp++] = j
            }
          }
        }
      }
      if (area > bestArea) { bestArea = area; bestLabel = next }
    }
    if (next <= 1) return m
    val out = Mask(w, h)
    for (i in labels.indices) if (labels[i] == bestLabel) out.data[i] = 1
    return out
  }

  fun union(a: Mask, b: Mask): Mask {
    val out = Mask(a.width, a.height)
    for (i in out.data.indices) if (a.data[i].toInt() != 0 || b.data[i].toInt() != 0) out.data[i] = 1
    return out
  }

  fun cropRows(m: Mask, rows: Int): Mask {
    val r = min(rows, m.height)
    return Mask(m.width, r, m.data.copyOfRange(0, m.width * r))
  }

  private fun fillCircle(m: Mask, cx: Int, cy: Int, r: Int) {
    val r2 = r * r
    for (y in max(0, cy - r)..min(m.height - 1, cy + r)) {
      for (x in max(0, cx - r)..min(m.width - 1, cx + r)) {
        val dx = x - cx; val dy = y - cy
        if (dx * dx + dy * dy <= r2) m.data[y * m.width + x] = 1
      }
    }
  }

  /** Thick line as a swept disk — a close stand-in for `cv2.line(thickness=t)`. */
  private fun thickLine(m: Mask, x0: Int, y0: Int, x1: Int, y1: Int, thickness: Int) {
    val r = max(1, ceil(thickness / 2.0).toInt())
    val len = hypot((x1 - x0).toDouble(), (y1 - y0).toDouble())
    val steps = max(1, ceil(len).toInt())
    for (s in 0..steps) {
      val t = s.toDouble() / steps
      fillCircle(m, (x0 + t * (x1 - x0)).roundToInt(), (y0 + t * (y1 - y0)).roundToInt(), r)
    }
  }

  /**
   * `_repair_with_pose`: patch the thin extremities segmentation tends to
   * drop (hands, feet, forearms, shins) using pose priors, then close and
   * keep the largest blob.
   */
  fun repairWithPose(mask: Mask, lm: Array<DoubleArray>?): Mask {
    if (lm == null) return mask
    val w = mask.width; val h = mask.height
    val out = mask.copy()

    var minX = w; var maxX = -1; var minY = h; var maxY = -1
    for (y in 0 until h) for (x in 0 until w) if (mask[x, y]) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
    if (maxX < 0) return out
    val diag = hypot(max(1, maxX - minX).toDouble(), max(1, maxY - minY).toDouble())
    val jointR = max(3, (0.010 * diag).toInt())
    val limbT = max(2, (0.008 * diag).toInt())

    fun px(idx: Int): IntArray? {
      val p = lm[idx]
      if (p[2] <= 0) return null
      return intArrayOf(
        (p[0] * w).toInt().coerceIn(0, w - 1),
        (p[1] * h).toInt().coerceIn(0, h - 1)
      )
    }

    for (idx in intArrayOf(15, 16, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32)) {
      val pt = px(idx) ?: continue
      if (!out[pt[0], pt[1]]) fillCircle(out, pt[0], pt[1], jointR)
    }
    val limbs = arrayOf(
      intArrayOf(11, 13), intArrayOf(13, 15), intArrayOf(12, 14), intArrayOf(14, 16),
      intArrayOf(23, 25), intArrayOf(25, 27), intArrayOf(24, 26), intArrayOf(26, 28),
      intArrayOf(27, 29), intArrayOf(29, 31), intArrayOf(28, 30), intArrayOf(30, 32),
    )
    for (ab in limbs) {
      val pa = px(ab[0]) ?: continue
      val pb = px(ab[1]) ?: continue
      thickLine(out, pa[0], pa[1], pb[0], pb[1], limbT)
    }
    return largestComponent(close(out))
  }

  /** `_feet_ok`: are the feet landmarks inside the mask (or does it reach the bottom)? */
  fun feetOk(mask: Mask, lm: Array<DoubleArray>?): Boolean {
    val w = mask.width; val h = mask.height
    var maxY = -1
    for (y in h - 1 downTo 0) {
      var any = false
      for (x in 0 until w) if (mask[x, y]) { any = true; break }
      if (any) { maxY = y; break }
    }
    val bottomGapRatio = if (maxY >= 0) (h - 1 - maxY).toDouble() / max(1, h) else 1.0
    var visible = 0; var inside = 0
    if (lm != null) {
      for (idx in intArrayOf(27, 28, 29, 30, 31, 32)) {
        val p = lm[idx]
        if (p[2] <= 0) continue
        visible++
        val x = (p[0] * w).toInt().coerceIn(0, w - 1)
        val y = (p[1] * h).toInt().coerceIn(0, h - 1)
        if (mask[x, y]) inside++
      }
    }
    if (visible >= 2) return inside.toDouble() / visible >= 0.50
    return bottomGapRatio <= 0.10
  }

  fun touchesBottom(mask: Mask): Boolean {
    val w = mask.width; val h = mask.height
    for (y in max(0, h - 2) until h) for (x in 0 until w) if (mask[x, y]) return true
    return false
  }
}
