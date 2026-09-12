import { NativeModule, requireNativeModule } from 'expo';

/** Raw measurements for a captured still. No thresholds applied — see `gate.ts`. */
export type PhotoAnalysis = {
  blurScore: number;
  brightness: number;
  width: number;
  height: number;
  /** Flat `[x, y, visibility, ...]`; empty when no person was detected. */
  landmarks: number[];
};

/** One of the five upper-arm sample points (`ARM_FRACTIONS` on the native side). */
export type ArmSample = {
  /** Position along shoulder->elbow, 0.30 … 0.70. */
  fraction: number;
  /** A ray was cast and reached a silhouette edge. */
  ok: boolean;
  /** `radiusPx / heightPx` sat inside the plausible band. */
  plausible: boolean;
  /** The inner (torso-side) edge was the arm's own edge, not the torso. */
  separated: boolean;
  radiusPx: number | null;
  /** Sample point in normalized image coordinates, for the provenance overlay. */
  x: number | null;
  y: number | null;
};

export type ArmMeasurement = {
  ok: boolean;
  /** Desktop pipeline's reason strings: `ok`, `arm_landmarks_missing`, `degenerate_arm_axis`, `all_samples_implausible`, `no_valid_width_samples`. */
  reason: string;
  side: 'left' | 'right';
  armLenPx: number | null;
  /** Weighted shoulder/elbow/wrist chain visibility, best side. */
  armVis: number | null;
  nOk: number;
  nImplausible: number;
  nSeparated: number;
  radiusPxMed: number | null;
  radiusPxIqr: number | null;
  samples: ArmSample[];
};

export type BodyMetrics = {
  /** Vertical extent of the person mask — the denominator of every ratio feature. */
  heightPx: number;
  widthPx: number;
  areaPx: number;
  bbox: [number, number, number, number];
  shoulderPx: number | null;
  hipPx: number | null;
  torsoPx: number | null;
};

/** Stage 2 output for one still, as raw pixel quantities. See `src/pipeline/features.ts`. */
export type PhotoMeasurement =
  | {
      ok: false;
      /** `no_person_detected` or `empty_mask`. */
      reason: string;
      width: number;
      height: number;
      landmarks?: number[];
    }
  | {
      ok: true;
      reason: 'ok';
      width: number;
      height: number;
      /** Cleaned + imputed 33x3, flat `[x, y, visibility, ...]`. */
      landmarks: number[];
      segmentation: { usedRefinement: boolean; feetOk: boolean; areaRatio: number };
      body: BodyMetrics;
      arm: ArmMeasurement;
      /** 0–1, or null when no arm patch could be read. */
      skinScore: number | null;
    };

declare class NutriVisionVisionModule extends NativeModule {
  /**
   * Pose landmarks for a downsampled grayscale preview frame.
   * Returns a flat `[x, y, visibility, ...]` array, empty if no person.
   */
  detectPoseInGrayImage(gray: Uint8Array, width: number, height: number): Promise<number[]>;

  /** Runs all three Stage 1 measurements on a captured still. */
  analyzePhoto(path: string): Promise<PhotoAnalysis>;

  /** Runs Stage 2 (pose, mask, arm profile, skin score) on a captured still. */
  measurePhoto(path: string): Promise<PhotoMeasurement>;
}

export default requireNativeModule<NutriVisionVisionModule>('NutriVisionVision');
