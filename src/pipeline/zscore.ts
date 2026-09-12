import muac0to5 from './reference/muac_0to5.json';
import muac5to19 from './reference/muac_5to19.json';
import wfa0to5 from './reference/wfa_0to5.json';
import wfa5to10 from './reference/wfa_5to10.json';

/**
 * Stage 4, step 1 — LMS z-scores against the growth references.
 *
 * Ported from `tools/who_zscore.py`. Two references are stitched together to
 * cover the full paediatric range, because WHO publishes no arm-circumference
 * reference past 60 months:
 *
 *   3–60 months   WHO 2006 arm circumference-for-age (`acanthro.txt`, day-indexed)
 *   60–228 months Mramba et al., BMJ 2017;358:j3423 (month-indexed)
 *
 * Deliberately does NOT extrapolate: outside 3–228 months the z-score is
 * undefined and the caller shows that, rather than a number.
 *
 * The tables are generated from the research repo's `who_reference_tables/`
 * by `scripts/build-reference-tables.mjs`; provenance is in that folder's
 * README.
 */

export type Sex = 'M' | 'F';

type Row = [age: number, L: number, M: number, S: number];
type Table = { unit: 'days' | 'months'; sexes: { m: Row[]; f: Row[] } };

const MUAC_0_5 = muac0to5 as unknown as Table;
const MUAC_5_19 = muac5to19 as unknown as Table;
const WFA_0_5 = wfa0to5 as unknown as Table;
const WFA_5_10 = wfa5to10 as unknown as Table;

/** WHO's own convention for months -> days. */
export const DAYS_PER_MONTH = 30.4375;

/** The MUAC-for-age reference is defined on exactly this window. */
export const MACZ_MIN_MONTHS = 3;
export const MACZ_MAX_MONTHS = 228;
/** WHO 2006 standard covers to here; Mramba takes over above. */
const MACZ_SWITCH_MONTHS = 60;

/** WHO defines weight-for-age only to 120 months. */
export const WFA_MAX_MONTHS = 120;
const WFA_SWITCH_MONTHS = 61;

export type LMS = { L: number; M: number; S: number };

/** numpy.interp on a sorted table, clamped to the table's range. */
function interpLms(rows: Row[], axisValue: number): LMS {
  const x = Math.min(rows[rows.length - 1][0], Math.max(rows[0][0], axisValue));
  let lo = 0;
  let hi = rows.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (rows[mid][0] <= x) lo = mid;
    else hi = mid;
  }
  const a = rows[lo];
  const b = rows[hi];
  const t = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
  return {
    L: a[1] + t * (b[1] - a[1]),
    M: a[2] + t * (b[2] - a[2]),
    S: a[3] + t * (b[3] - a[3]),
  };
}

function rowsFor(table: Table, sex: Sex): Row[] {
  return sex === 'M' ? table.sexes.m : table.sexes.f;
}

export function lmsZ(value: number, { L, M, S }: LMS): number {
  if (L === 0) return Math.log(value / M) / S;
  return (Math.pow(value / M, L) - 1) / (L * S);
}

/** Inverse of `lmsZ`: the measurement that sits at a given z. */
export function lmsValue(z: number, { L, M, S }: LMS): number {
  if (L === 0) return M * Math.exp(S * z);
  return M * Math.pow(1 + L * S * z, 1 / L);
}

/** MUAC-for-age LMS parameters, or null outside 3–228 months. */
export function muacLms(ageMonths: number, sex: Sex): LMS | null {
  if (!Number.isFinite(ageMonths) || ageMonths < MACZ_MIN_MONTHS || ageMonths > MACZ_MAX_MONTHS) {
    return null;
  }
  if (ageMonths <= MACZ_SWITCH_MONTHS) {
    return interpLms(rowsFor(MUAC_0_5, sex), ageMonths * DAYS_PER_MONTH);
  }
  return interpLms(rowsFor(MUAC_5_19, sex), ageMonths);
}

/** MUAC-for-age z-score (`macz` on the desktop), or null outside the reference range. */
export function macz(muacCm: number, ageMonths: number, sex: Sex): number | null {
  const lms = muacLms(ageMonths, sex);
  return lms ? lmsZ(muacCm, lms) : null;
}

/** Weight-for-age z-score, or null past 120 months (WHO defines none). */
export function waz(weightKg: number, ageMonths: number, sex: Sex): number | null {
  if (!Number.isFinite(ageMonths) || ageMonths < 0 || ageMonths > WFA_MAX_MONTHS) return null;
  const lms =
    ageMonths < WFA_SWITCH_MONTHS
      ? interpLms(rowsFor(WFA_0_5, sex), ageMonths * DAYS_PER_MONTH)
      : interpLms(rowsFor(WFA_5_10, sex), ageMonths);
  return lmsZ(weightKg, lms);
}

export type MaczCategory = 'severe' | 'moderate' | 'at_risk' | 'normal';

/**
 * Undernutrition category from a MUAC-for-age z-score (`macz_category`).
 * z < -2 is the validated undernutrition threshold; z < -3 mirrors the WHO
 * severe cut-off used under five.
 */
export function maczCategory(z: number): MaczCategory {
  if (z < -3) return 'severe';
  if (z < -2) return 'moderate';
  if (z < -1) return 'at_risk';
  return 'normal';
}

/** Ages (months) the growth-curve chart samples, log-spaced like the design. */
export const CURVE_AGES = [3, 4, 6, 9, 12, 18, 24, 36, 48, 60, 72, 96, 120, 144, 168, 192, 228];

/** Reference median and ±2 SD MUAC at each of `CURVE_AGES`, for the explain screen. */
export function muacCurve(sex: Sex): { age: number; median: number; lo: number; hi: number }[] {
  return CURVE_AGES.map((age) => {
    const lms = muacLms(age, sex)!;
    return { age, median: lms.M, lo: lmsValue(-2, lms), hi: lmsValue(2, lms) };
  });
}
