import calibrationJson from './calibration.json';
import { FEATURE_NAMES, type FeatureName, type FeatureVector } from './features';

/**
 * Stage 3 — the MUAC regression.
 *
 * Not a neural network: 23 inputs, 23 coefficients, one dot product. The
 * JSON is `results/muac_calibration_ridge_weight_mpselfie.json` from the
 * research repo, copied verbatim — it reconstructs scikit-learn's own
 * predictions to 1.8e-14 cm, so nothing beyond this formula is needed:
 *
 *   muac_cm = intercept + Σ coef[i] * (x[i] - mean[i]) / scale[i]
 *
 * Missing-feature policy (docs/ANDROID_APP_BRIEF.md §7): a feature that could
 * not be computed for this photo takes its training median, matching the
 * `SimpleImputer(median)` step the model was fitted behind. Only the whole arm
 * measurement failing aborts — and that never reaches this function.
 */

type CalibrationFile = {
  status: string;
  model: string;
  fitted_on_segmenter: string;
  fitted_on_frame_count: string;
  features: string[];
  intercept: number;
  coefficients: number[];
  means: number[];
  scales: number[];
  _impute_medians_optional: { values: number[] };
};

const cal = calibrationJson as CalibrationFile;

if (cal.features.length !== FEATURE_NAMES.length || cal.features.some((f, i) => f !== FEATURE_NAMES[i])) {
  throw new Error('calibration.json feature order does not match FEATURE_NAMES');
}

/** What this model is, for the record stamp and the About screen. */
export const CALIBRATION = {
  /** Stored on every saved record so a re-fit can be told apart later. */
  id: `${cal.model}/${cal.fitted_on_segmenter}/${cal.fitted_on_frame_count}`,
  model: cal.model,
  segmenter: cal.fitted_on_segmenter,
  frames: cal.fitted_on_frame_count,
  /**
   * 20-seed paired cross-validation on this exact configuration (weight-
   * anchored inputs, mp-selfie segmenter, single frame). This number belongs
   * to *this* configuration only — the desktop pipeline's 1.433 cm is a
   * different segmenter with different inputs.
   */
  maeCm: 1.0865,
  /** MUAC values the training data treated as data-entry errors. */
  plausibleRangeCm: [8, 35] as const,
} as const;

export type Prediction = {
  muacCm: number;
  /** Features that were not computed for this photo and took the training median. */
  imputed: FeatureName[];
};

export function predictMuac(features: FeatureVector): Prediction {
  const imputed: FeatureName[] = [];
  let y = cal.intercept;
  for (let i = 0; i < FEATURE_NAMES.length; i++) {
    const name = FEATURE_NAMES[i];
    let x = features[name];
    if (!Number.isFinite(x)) {
      x = cal._impute_medians_optional.values[i];
      imputed.push(name);
    }
    y += (cal.coefficients[i] * (x - cal.means[i])) / cal.scales[i];
  }
  return { muacCm: y, imputed };
}
