package com.nutrivision.vision

/**
 * Stage 2 end to end on one captured still: pose -> clean landmarks -> person
 * mask -> body metrics -> arm profile -> skin score.
 *
 * Mirrors `_measure_view` in `tools/extract_stage2_features.py`, the routine
 * that produced the training features the shipped calibration was fitted on.
 * Everything comes back as raw pixel quantities; the JS side
 * (`src/pipeline/features.ts`) forms the ratios so the feature definitions
 * live in exactly one place and can be unit-tested without a device.
 *
 * Nothing here decides anything. A failed step is reported with the same
 * reason string the desktop pipeline uses, and the screens turn that into a
 * "cannot assess" explanation — never into a substitute number.
 */
object MeasurementPipeline {

  fun measure(pose: PoseDetector, segmenter: PersonSegmenter, path: String): Map<String, Any?> {
    val bitmap = PhotoAnalyzer.loadUpright(path)
    try {
      val w = bitmap.width
      val h = bitmap.height

      val raw = pose.detect(bitmap)
      if (raw.isEmpty()) {
        return mapOf("ok" to false, "reason" to "no_person_detected", "width" to w, "height" to h)
      }
      val lm = PoseClean.clean(PoseClean.toMatrix(raw))

      val seg = segmenter.segmentPerson(bitmap, lm)
      val mask = seg.mask
      if (!seg.ok || mask == null) {
        return mapOf(
          "ok" to false, "reason" to seg.reason, "width" to w, "height" to h,
          "landmarks" to PoseClean.flatten(lm),
        )
      }

      val bm = ArmProfile.bodyMetrics(mask, lm)
        ?: return mapOf(
          "ok" to false, "reason" to "empty_mask", "width" to w, "height" to h,
          "landmarks" to PoseClean.flatten(lm),
        )

      val ap = ArmProfile.extract(mask, lm, bm.heightPx)
      val skin = if (ap.ok) ArmProfile.skinScore(bitmap, lm, ap.side) else Double.NaN

      return mapOf(
        "ok" to true,
        "reason" to "ok",
        "width" to w,
        "height" to h,
        "landmarks" to PoseClean.flatten(lm),
        "segmentation" to mapOf(
          "usedRefinement" to seg.usedRefinement,
          "feetOk" to seg.feetOk,
          "areaRatio" to bm.areaPx / (w.toDouble() * h),
        ),
        "body" to mapOf(
          "heightPx" to bm.heightPx,
          "widthPx" to bm.widthPx,
          "areaPx" to bm.areaPx,
          "bbox" to listOf(bm.left, bm.top, bm.right, bm.bottom),
          "shoulderPx" to bm.shoulderPx,
          "hipPx" to bm.hipPx,
          "torsoPx" to bm.torsoPx,
        ),
        "arm" to mapOf(
          "ok" to ap.ok,
          "reason" to ap.reason,
          "side" to ap.side,
          "armLenPx" to nanToNull(ap.armLenPx),
          "armVis" to nanToNull(ap.armVis),
          "nOk" to ap.nOk,
          "nImplausible" to ap.nImplausible,
          "nSeparated" to ap.nSeparated,
          "radiusPxMed" to nanToNull(ap.radiusPxMed),
          "radiusPxIqr" to nanToNull(ap.radiusPxIqr),
          "samples" to ap.samples.map { s ->
            mapOf(
              "fraction" to s.fraction,
              "ok" to s.ok,
              "plausible" to s.plausible,
              "separated" to s.separated,
              "radiusPx" to nanToNull(s.radiusPx),
              "x" to nanToNull(s.x),
              "y" to nanToNull(s.y),
            )
          },
        ),
        "skinScore" to nanToNull(skin),
      )
    } finally {
      bitmap.recycle()
    }
  }

  /** NaN does not survive the bridge as a number; null is what JS expects for "not computed". */
  private fun nanToNull(v: Double): Double? = if (v.isNaN()) null else v
}
