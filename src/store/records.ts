import { Directory, File, Paths } from 'expo-file-system';

import type { DecisionKey } from '@/pipeline/decide';
import type { ScreeningResult } from '@/pipeline/run';
import type { Sex } from '@/pipeline/zscore';

/**
 * The on-phone register. One JSON file in the app's private documents
 * directory; nothing is uploaded anywhere. Records are small (no photo —
 * the photo is deleted the moment a screening is saved), so a few thousand
 * of them are still well under a megabyte.
 */

export type ScreeningRecord = {
  id: string;
  /** Name or ID as typed; may be empty. */
  name: string;
  ageMonths: number;
  sex: Sex;
  weightKg: number;
  /** ISO timestamp of when the screening was saved. */
  createdAt: string;
  result: ScreeningResult;
};

type RegisterFile = { version: 1; records: ScreeningRecord[] };

const REGISTER_NAME = 'screenings.json';
const EXPORT_DIR = 'exports';

function registerFile(): File {
  return new File(Paths.document, REGISTER_NAME);
}

export function loadRecords(): ScreeningRecord[] {
  try {
    const f = registerFile();
    if (!f.exists) return [];
    const parsed = JSON.parse(f.textSync()) as Partial<RegisterFile>;
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch {
    // A corrupt register is not worth crashing the app over; the worker can
    // still screen. It will be overwritten on the next save.
    return [];
  }
}

export function saveRecords(records: ScreeningRecord[]): void {
  const payload: RegisterFile = { version: 1, records };
  registerFile().write(JSON.stringify(payload));
}

/** Size of the register on disk, in KB, for the settings screen. */
export function registerSizeKb(): number {
  try {
    const f = registerFile();
    return f.exists ? Math.max(1, Math.round(f.size / 1024)) : 0;
  } catch {
    return 0;
  }
}

export function newRecordId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Sort key: newest first. */
export function byNewest(a: ScreeningRecord, b: ScreeningRecord): number {
  return b.createdAt.localeCompare(a.createdAt);
}

export function decisionOf(r: ScreeningRecord): DecisionKey {
  return r.result.decision;
}

const CSV_COLUMNS = [
  'id',
  'saved_at',
  'name_or_id',
  'age_months',
  'sex',
  'weight_kg',
  'muac_cm',
  'muac_for_age_z',
  'category',
  'decision',
  'referral_line_cm',
  'range_low_cm',
  'range_high_cm',
  'arm_side',
  'points_used',
  'imputed_features',
  'model',
] as const;

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function recordsToCsv(records: ScreeningRecord[]): string {
  const rows = records.map((r) =>
    [
      r.id,
      r.createdAt,
      r.name,
      r.ageMonths,
      r.sex,
      r.weightKg,
      r.result.muacCm.toFixed(2),
      r.result.z.toFixed(3),
      r.result.category,
      r.result.decision,
      r.result.cutCm.toFixed(2),
      r.result.lowCm.toFixed(2),
      r.result.highCm.toFixed(2),
      r.result.armSide,
      r.result.pointsUsed,
      r.result.imputed.join(' '),
      r.result.model,
    ]
      .map(csvCell)
      .join(',')
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}

/**
 * Writes the register as CSV into the app's documents folder and returns the
 * file. The caller may hand it to the share sheet; nothing here uploads.
 */
export function exportCsv(records: ScreeningRecord[]): File {
  const dir = new Directory(Paths.document, EXPORT_DIR);
  if (!dir.exists) dir.create();
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const file = new File(dir, `baazu-export-${stamp}.csv`);
  file.write(recordsToCsv(records));
  return file;
}
