/**
 * Stage 1 — the quality gate.
 *
 * This module is the single source of truth for the three checks' thresholds
 * and their pass/fail logic. Both the live preview path (worklet -> JS) and the
 * capture path (native analysis of the still) funnel their raw measurements
 * through the same functions here, so the two can never drift apart on the
 * decision itself.
 *
 * Ported from `tools/stage1_quality_gate.py` in the desktop pipeline, frontal
 * view only. The thresholds are NOT defaults — they were empirically tuned
 * against this project's child-anthropometry dataset (29.44 "derived
 * specifically for children's anthropometry images", 0.025 "tuned from a
 * generic 0.18 default for child-scale subjects"). See
 * docs/ANDROID_APP_BRIEF.md §4. Do not round or "tidy" them.
 */

export const QualityThresholds = {
  /** Variance of the Laplacian, on grayscale. */
  blurMin: 29.44,
  /** Mean grayscale intensity, 0–255. */
  brightnessMin: 40,
  brightnessMax: 220,
  /** Mean pose visibility across the five framing landmarks. */
  framingVisibilityMin: 0.5,
  /** Bounding box of the framing landmarks, as a fraction of frame area. */
  bboxAreaRatioMin: 0.025,
  /** Fraction of observed framing landmarks that must sit inside the margin. */
  inBoundsRatioMin: 0.8,
  /** Edge margin, as a fraction of frame width/height. */
  edgeMargin: 0.05,
  /** Below this visibility a landmark is treated as not observed at all. */
  landmarkPresenceMin: 0.1,
} as const;

/**
 * Standard MediaPipe / BlazePose 33-point indices. The Pose Landmarker Task
 * emits landmarks in this same order as the legacy `mp.solutions.pose`
 * solution, so the desktop pipeline's indices carry over unchanged.
 */
export const FramingLandmarks = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
} as const;

const FRAMING_INDICES: readonly number[] = Object.values(FramingLandmarks);

export type Landmark = {
  /** Normalized 0–1 frame coordinate. */
  x: number;
  y: number;
  visibility: number;
};

export type CheckName = 'blur' | 'brightness' | 'framing';

/** Machine-readable outcome, so the UI can pick the right localized string. */
export type CheckCode = 'ok' | 'blur' | 'dark' | 'bright' | 'noperson' | 'edge' | 'small' | 'visibility';

export type CheckResult = {
  name: CheckName;
  passed: boolean;
  code: CheckCode;
  /** The raw measured value this check was decided on. */
  score: number;
  /** Faithful description, matching the desktop pipeline's wording. */
  message: string;
  /** Short imperative instruction for the person holding the phone. */
  hint: string;
};

export type QualityDecision = {
  accepted: boolean;
  checks: CheckResult[];
  /** Only the failing checks, in the order they should be acted on. */
  failures: CheckResult[];
  /** One combined line for the live overlay. */
  statusText: string;
};

export function checkBlur(blurScore: number): CheckResult {
  const passed = blurScore >= QualityThresholds.blurMin;
  return {
    name: 'blur',
    passed,
    code: passed ? 'ok' : 'blur',
    score: blurScore,
    message: passed ? 'Sharp' : 'Too blurry',
    hint: passed ? 'Sharp' : 'Hold still — too blurry',
  };
}

export function checkBrightness(brightness: number): CheckResult {
  const tooDark = brightness < QualityThresholds.brightnessMin;
  const tooBright = brightness > QualityThresholds.brightnessMax;
  const passed = !tooDark && !tooBright;
  return {
    name: 'brightness',
    passed,
    code: tooDark ? 'dark' : tooBright ? 'bright' : 'ok',
    score: brightness,
    message: tooDark ? 'Too dark' : tooBright ? 'Too bright' : 'Good lighting',
    hint: tooDark ? 'Too dark — find more light' : tooBright ? 'Too bright' : 'Good lighting',
  };
}

/**
 * `landmarks` is the full 33-point array, or an empty array / null when pose
 * detection found no person. No person is a normal outcome, not an error — it
 * fails the framing check with "No person detected".
 */
export function checkFraming(landmarks: readonly Landmark[] | null | undefined): CheckResult {
  const points = landmarks?.length ? FRAMING_INDICES.map((i) => landmarks[i]) : [];

  if (points.length !== FRAMING_INDICES.length || points.some((p) => p == null)) {
    return {
      name: 'framing',
      passed: false,
      code: 'noperson',
      score: 0,
      message: 'No person detected',
      hint: 'No person detected',
    };
  }

  // Frontal view averages visibility over all five points, but measures extent
  // and bounds only over the ones actually observed.
  const avgVisibility = points.reduce((sum, p) => sum + p.visibility, 0) / points.length;
  const observed = points.filter((p) => p.visibility > QualityThresholds.landmarkPresenceMin);

  const margin = QualityThresholds.edgeMargin;
  const inBoundsRatio = observed.length
    ? observed.filter(
        (p) => p.x >= margin && p.x <= 1 - margin && p.y >= margin && p.y <= 1 - margin
      ).length / observed.length
    : 0;

  let bboxAreaRatio = 0;
  if (observed.length) {
    const xs = observed.map((p) => p.x);
    const ys = observed.map((p) => p.y);
    bboxAreaRatio = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  }

  const messages: string[] = [];
  const hints: string[] = [];
  const codes: CheckCode[] = [];
  if (avgVisibility < QualityThresholds.framingVisibilityMin) {
    messages.push('low visibility');
    hints.push('Face the camera');
    codes.push('visibility');
  }
  if (bboxAreaRatio < QualityThresholds.bboxAreaRatioMin) {
    messages.push('subject too small / far');
    hints.push('Move closer');
    codes.push('small');
  }
  if (inBoundsRatio < QualityThresholds.inBoundsRatioMin) {
    messages.push('subject cut at image edge');
    hints.push('Step back — subject is cut off');
    codes.push('edge');
  }

  const passed = messages.length === 0;
  // When several fail, the cut-off edge is the one to fix first: stepping
  // back usually fixes the size and visibility complaints with it.
  const code: CheckCode = passed ? 'ok' : codes.includes('edge') ? 'edge' : codes.includes('small') ? 'small' : 'visibility';
  return {
    name: 'framing',
    passed,
    code,
    score: avgVisibility,
    message: passed ? 'Person well framed' : messages.join('; '),
    hint: passed ? 'Well framed' : hints[0],
  };
}

/**
 * Combines the three checks. Failures are ordered by what the health worker
 * should fix first: get a person in shot, then the light, then hold steady.
 */
export function decide(
  blurScore: number,
  brightness: number,
  landmarks: readonly Landmark[] | null | undefined
): QualityDecision {
  const checks = [checkBlur(blurScore), checkBrightness(brightness), checkFraming(landmarks)];

  const order: CheckName[] = ['framing', 'brightness', 'blur'];
  const failures = order
    .map((name) => checks.find((c) => c.name === name))
    .filter((c): c is CheckResult => c != null && !c.passed);

  return {
    accepted: failures.length === 0,
    checks,
    failures,
    statusText: failures.length === 0 ? 'Ready' : failures[0].hint,
  };
}

/** Unpacks the flat `[x, y, visibility, ...]` array the native module returns. */
export function unflattenLandmarks(flat: readonly number[] | null | undefined): Landmark[] {
  if (!flat?.length) return [];
  const out: Landmark[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) {
    out.push({ x: flat[i], y: flat[i + 1], visibility: flat[i + 2] });
  }
  return out;
}
