import { CALIBRATION } from './calibration';
import { lmsValue, lmsZ, maczCategory, muacLms, type MaczCategory, type Sex } from './zscore';

/**
 * Stage 4, step 2 — turning a MUAC estimate into a referral decision.
 *
 *   z < -2 and clear of the line   → REFER
 *   z ≥ -2 and clear of the line   → CLEAR
 *   the referral line is within the model's typical error → NOT SURE — measure by hand
 *
 * The third outcome is the one rule that matters most in this app: a single
 * point estimate with a ~1 cm error is not enough to safely say "clear" for a
 * child sitting near the line. The desktop system decides deferral with a
 * risk-controlled threshold on a calibration split (`tools/stage4_safe_clearance.py`);
 * that was measured for a different segmenter and has not been re-run for
 * this configuration, so this v1 uses a simpler, explicit rule:
 *
 *   defer when |muac − muac_at_z=−2| < DEFER_MARGIN_CM
 *
 * with the margin set to the validated MAE of this exact configuration. It is
 * cruder than the desktop rule and must not be quoted with the desktop
 * sensitivity/specificity numbers — re-validate before claiming any.
 */

/** Referral line: MUAC-for-age z = −2 (Mramba-validated undernutrition threshold). */
export const REFERRAL_Z = -2;

/** Defer whenever the referral line lies within one typical error of the estimate. */
export const DEFER_MARGIN_CM = CALIBRATION.maeCm;

/**
 * Half-width of the range shown to the worker. Two MAEs is roughly a 90%
 * interval if residuals are Gaussian (σ ≈ 1.25 × MAE, so 2 MAE ≈ 1.6 σ) and
 * a little under that if they are heavier-tailed — "very likely", not
 * "certainly". Not a calibrated conformal interval; see the note above.
 */
export const CONFIDENCE_BAND_CM = 2 * CALIBRATION.maeCm;

export type DecisionKey = 'refer' | 'clear' | 'unsure';

export type Assessment = {
  muacCm: number;
  z: number;
  category: MaczCategory;
  /** The MUAC at which this child's z would be exactly −2. */
  cutCm: number;
  /** Reference median MUAC for this age and sex. */
  medianCm: number;
  lowCm: number;
  highCm: number;
  decision: DecisionKey;
};

/**
 * Null when the age is outside the 3–228 month reference range — no z-score
 * exists there, so no decision does either.
 */
export function assess(muacCm: number, ageMonths: number, sex: Sex): Assessment | null {
  const lms = muacLms(ageMonths, sex);
  if (!lms) return null;

  const z = lmsZ(muacCm, lms);
  const cutCm = lmsValue(REFERRAL_Z, lms);

  let decision: DecisionKey;
  if (Math.abs(muacCm - cutCm) < DEFER_MARGIN_CM) decision = 'unsure';
  else if (z < REFERRAL_Z) decision = 'refer';
  else decision = 'clear';

  return {
    muacCm,
    z,
    category: maczCategory(z),
    cutCm,
    medianCm: lms.M,
    lowCm: muacCm - CONFIDENCE_BAND_CM,
    highCm: muacCm + CONFIDENCE_BAND_CM,
    decision,
  };
}
