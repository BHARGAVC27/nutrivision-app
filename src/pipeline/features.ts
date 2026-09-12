import type { PhotoMeasurement } from '@modules/nutrivision-vision';

/**
 * Stage 2 → Stage 3 hand-off: the 23-feature vector.
 *
 * Definitions are ported from `_measure_view` in
 * `tools/extract_stage2_features.py` and `load_joined` in
 * `tools/run_muac_evaluation.py` — the code that produced the training table
 * the calibration was fitted on. Where docs/ANDROID_APP_BRIEF.md paraphrases
 * a feature differently (e.g. `f_arm_vis`), the extraction code wins, because
 * that is what the coefficients were fitted against.
 *
 * `NaN` means "not computed for this photo"; the calibration substitutes the
 * training median for that one feature (`calibration.ts`). Only the arm
 * measurement failing outright is fatal, and that is decided before we get
 * here.
 */

export const FEATURE_NAMES = [
  'Age',
  'sex_male',
  'Weight',
  'f_diam_ratio',
  'f_radius_ratio',
  'f_radius_iqr_ratio',
  'f_armlen_ratio',
  'f_area_over_h2',
  'f_bodywidth_ratio',
  'f_shoulder_ratio',
  'f_hip_ratio',
  'f_torso_ratio',
  'f_arm_vis',
  'f_skin_score',
  'f_n_sep',
  'f_r_f30',
  'f_r_f40',
  'f_r_f50',
  'f_r_f60',
  'f_r_f70',
  'f_r_min',
  'f_r_p25',
  'f_r_mean',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export type FeatureVector = Record<FeatureName, number>;

export type ChildInputs = {
  ageMonths: number;
  sex: 'M' | 'F';
  weightKg: number;
};

/** numpy.nanpercentile with linear interpolation; NaN if nothing survives. */
export function nanPercentile(values: readonly number[], p: number): number {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return NaN;
  if (xs.length === 1) return xs[0];
  const idx = (p / 100) * (xs.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(xs.length - 1, lo + 1);
  return xs[lo] + (idx - lo) * (xs[hi] - xs[lo]);
}

function nanMin(values: readonly number[]): number {
  const xs = values.filter((v) => Number.isFinite(v));
  return xs.length ? Math.min(...xs) : NaN;
}

function nanMean(values: readonly number[]): number {
  const xs = values.filter((v) => Number.isFinite(v));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

const orNaN = (v: number | null | undefined) => (v == null ? NaN : v);

/**
 * Assembles the feature vector. Requires a successful measurement with a
 * successful arm profile — callers must route the failure cases to the
 * "cannot assess" screen instead of calling this.
 */
export function buildFeatures(
  m: Extract<PhotoMeasurement, { ok: true }>,
  child: ChildInputs
): FeatureVector {
  if (!m.arm.ok) {
    throw new Error(`buildFeatures called with a failed arm profile (${m.arm.reason})`);
  }
  const h = Math.max(1, m.body.heightPx);

  // Per-fraction radius ratios, kept only for samples that were both read and
  // plausible — exactly the rows the extraction script writes.
  const byFraction = new Map<number, number>();
  for (const s of m.arm.samples) {
    if (s.ok && s.plausible && s.radiusPx != null) {
      byFraction.set(Math.round(s.fraction * 100), s.radiusPx / h);
    }
  }
  const rf = [30, 40, 50, 60, 70].map((f) => byFraction.get(f) ?? NaN);

  const radiusMed = orNaN(m.arm.radiusPxMed);

  return {
    Age: child.ageMonths,
    sex_male: child.sex === 'M' ? 1 : 0,
    Weight: child.weightKg,
    f_diam_ratio: (2 * radiusMed) / h,
    f_radius_ratio: radiusMed / h,
    f_radius_iqr_ratio: orNaN(m.arm.radiusPxIqr) / h,
    f_armlen_ratio: orNaN(m.arm.armLenPx) / h,
    f_area_over_h2: m.body.areaPx / (h * h),
    f_bodywidth_ratio: m.body.widthPx / h,
    f_shoulder_ratio: orNaN(m.body.shoulderPx) / h,
    f_hip_ratio: orNaN(m.body.hipPx) / h,
    f_torso_ratio: orNaN(m.body.torsoPx) / h,
    f_arm_vis: orNaN(m.arm.armVis),
    f_skin_score: orNaN(m.skinScore),
    f_n_sep: m.arm.nSeparated,
    f_r_f30: rf[0],
    f_r_f40: rf[1],
    f_r_f50: rf[2],
    f_r_f60: rf[3],
    f_r_f70: rf[4],
    f_r_min: nanMin(rf),
    f_r_p25: nanPercentile(rf, 25),
    f_r_mean: nanMean(rf),
  };
}
