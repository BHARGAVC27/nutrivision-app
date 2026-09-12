import NutriVisionVision, { type ArmSample } from '@modules/nutrivision-vision';

import { CALIBRATION, predictMuac } from './calibration';
import { assess, type Assessment } from './decide';
import { buildFeatures, type ChildInputs, type FeatureName } from './features';
import { MACZ_MAX_MONTHS, MACZ_MIN_MONTHS } from './zscore';

/**
 * One screening, end to end: photo → Stage 2 (native) → 23 features →
 * Stage 3 MUAC → Stage 4 decision.
 *
 * Every way this can fail maps to one of four "cannot assess" reasons the
 * screens know how to explain. None of them produces a number.
 */

export type CannotReason = 'person' | 'arm' | 'age' | 'weight';

/** Where on the photo the arm was read, for the provenance overlay. */
export type ProvenancePoint = { x: number; y: number; used: boolean };

export type ScreeningResult = Assessment & {
  /** Which arm the profile was taken from. */
  armSide: 'left' | 'right';
  /** Outer diameter of the upper arm in photo pixels (2 × median radius). */
  armWidthPx: number;
  /** Sample points that survived the plausibility check, of 5. */
  pointsUsed: number;
  points: ProvenancePoint[];
  /** Person mask height in photo pixels — the denominator of every ratio feature. */
  heightPx: number;
  /** Features that took their training median for this photo. */
  imputed: FeatureName[];
  /** Calibration identity, so a later re-fit can be told apart in history. */
  model: string;
  /** Photo dimensions, so points can be drawn on a resized preview. */
  photoWidth: number;
  photoHeight: number;
};

export type ScreeningOutcome =
  | { ok: true; result: ScreeningResult; /** ISO time the measurement finished. */ completedAt: string }
  | { ok: false; reason: CannotReason; detail: string };

export type ProgressStage = 'pose' | 'arm' | 'muac';

function toPoints(samples: ArmSample[]): ProvenancePoint[] {
  return samples
    .filter((s) => s.x != null && s.y != null)
    .map((s) => ({ x: s.x!, y: s.y!, used: s.ok && s.plausible }));
}

export async function runScreening(
  photoPath: string,
  child: ChildInputs,
  onProgress?: (stage: ProgressStage) => void
): Promise<ScreeningOutcome> {
  // Inputs first: no point measuring an arm we cannot interpret.
  if (!Number.isFinite(child.weightKg) || child.weightKg <= 0) {
    return { ok: false, reason: 'weight', detail: 'weight_missing' };
  }
  if (child.ageMonths < MACZ_MIN_MONTHS || child.ageMonths > MACZ_MAX_MONTHS) {
    return { ok: false, reason: 'age', detail: 'age_out_of_reference_range' };
  }

  onProgress?.('pose');
  const m = await NutriVisionVision.measurePhoto(photoPath);
  if (!m.ok) {
    return { ok: false, reason: 'person', detail: m.reason };
  }

  onProgress?.('arm');
  if (!m.arm.ok) {
    return { ok: false, reason: 'arm', detail: m.arm.reason };
  }

  onProgress?.('muac');
  const features = buildFeatures(m, child);
  const { muacCm, imputed } = predictMuac(features);

  // A value outside what the training data treated as a real child is a
  // pipeline failure, not a finding.
  const [lo, hi] = CALIBRATION.plausibleRangeCm;
  if (!Number.isFinite(muacCm) || muacCm < lo || muacCm > hi) {
    return { ok: false, reason: 'arm', detail: `implausible_estimate_${muacCm.toFixed(1)}` };
  }

  const assessment = assess(muacCm, child.ageMonths, child.sex);
  if (!assessment) {
    return { ok: false, reason: 'age', detail: 'age_out_of_reference_range' };
  }

  return {
    ok: true,
    completedAt: new Date().toISOString(),
    result: {
      ...assessment,
      armSide: m.arm.side,
      armWidthPx: Math.round(2 * (m.arm.radiusPxMed ?? 0)),
      pointsUsed: m.arm.nOk,
      points: toPoints(m.arm.samples),
      heightPx: m.body.heightPx,
      imputed,
      model: CALIBRATION.id,
      photoWidth: m.width,
      photoHeight: m.height,
    },
  };
}
