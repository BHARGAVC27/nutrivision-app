import type { Strings } from '@/i18n/strings';
import { CALIBRATION } from '@/pipeline/calibration';
import type { DecisionKey } from '@/pipeline/decide';
import type { ScreeningResult } from '@/pipeline/run';
import type { MaczCategory, Sex } from '@/pipeline/zscore';
import { useApp } from '@/store/app-state';

/**
 * The result and explain screens show either the screening just completed or
 * a saved record. This flattens both into one shape so the screens do not
 * care which it is.
 */
export type ResultView = {
  name: string;
  ageMonths: number;
  sex: Sex;
  weightKg: number;
  result: ScreeningResult;
  /** ISO time the screening was saved, or when the measurement finished for a fresh one. */
  when: string;
  /** Saved-record id, or null for a fresh result. */
  recordId: string | null;
  /** The photo, only while the screening is unsaved. */
  photoPath: string | null;
};

export function useResultView(): ResultView | null {
  const { records, viewingId, outcome, draft } = useApp();
  if (viewingId) {
    const r = records.find((x) => x.id === viewingId);
    if (!r) return null;
    return { name: r.name, ageMonths: r.ageMonths, sex: r.sex, weightKg: r.weightKg, result: r.result, when: r.createdAt, recordId: r.id, photoPath: null };
  }
  if (outcome?.ok) {
    return {
      name: draft.name,
      ageMonths: draft.ageMonths,
      sex: draft.sex,
      weightKg: parseFloat(draft.weight),
      result: outcome.result,
      when: outcome.completedAt,
      recordId: null,
      photoPath: draft.photoPath,
    };
  }
  return null;
}

export function decisionText(decision: DecisionKey, L: Strings): { label: string; plain: string } {
  switch (decision) {
    case 'refer':
      return { label: L.dec_refer, plain: L.plain_low };
    case 'unsure':
      return { label: L.dec_unsure, plain: L.plain_edge };
    default:
      return { label: L.dec_clear, plain: L.plain_ok };
  }
}

export function categoryText(category: MaczCategory, L: Strings): string {
  switch (category) {
    case 'severe':
      return L.zbin_sev;
    case 'moderate':
      return L.zbin_mod;
    case 'at_risk':
      return L.zbin_risk;
    default:
      return L.zbin_normal;
  }
}

/** Was this record produced by the calibration the app currently ships? */
export function isCurrentModel(model: string): boolean {
  return model === CALIBRATION.id;
}
