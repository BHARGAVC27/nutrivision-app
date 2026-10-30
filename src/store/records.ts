import { Directory, File, Paths } from 'expo-file-system';

import type { Diet } from '@/nutrition/plan';
import type { DecisionKey } from '@/pipeline/decide';
import type { ScreeningResult } from '@/pipeline/run';
import type { Sex } from '@/pipeline/zscore';

/**
 * The on-phone register. One JSON file in the app's private documents
 * directory; nothing is uploaded anywhere. A saved screening's photo moves
 * into `photos/<id>` alongside it and lives as long as the record does —
 * deleting the record (or clearing all records) deletes its photo too.
 *
 * The register is the only copy of a worker's day. It is written the way a
 * database writes: the new contents go to a temporary file first and are
 * renamed over the old one only once they are fully on disk, and the previous
 * good file is kept as `.bak`. A crash or kill mid-write therefore leaves
 * either the old register or the new one — never a half-written file that
 * would read back as "no records".
 */

export type ScreeningRecord = {
  id: string;
  /** Name or ID as typed; may be empty. */
  name: string;
  ageMonths: number;
  sex: Sex;
  weightKg: number;
  /** Diet answer for the food plan; null or absent (records saved before it existed) = not asked. */
  diet?: Diet | null;
  /** ISO timestamp of when the screening was saved. */
  createdAt: string;
  result: ScreeningResult;
  /** Filesystem path of the still used for this screening, or null if it could not be kept. */
  photoPath: string | null;
};

type RegisterFile = { version: 1; records: ScreeningRecord[] };

const REGISTER_NAME = 'screenings.json';
const REGISTER_TMP = 'screenings.json.tmp';
const REGISTER_BAK = 'screenings.json.bak';
const PHOTOS_DIR = 'photos';

function photosDirectory(): Directory {
  const dir = new Directory(Paths.document, PHOTOS_DIR);
  if (!dir.exists) dir.create();
  return dir;
}

/**
 * Moves a screening's temporary still into permanent per-record storage, so
 * it survives past the screening it was taken for. Returns the new path, or
 * null if the source is already gone (the record then falls back to the
 * schematic provenance view).
 */
export function persistPhoto(tempPath: string, recordId: string): string | null {
  try {
    const source = new File(tempPath.startsWith('file://') ? tempPath : `file://${tempPath}`);
    if (!source.exists) return null;
    const dest = new File(photosDirectory(), `${recordId}${source.extension || '.jpg'}`);
    source.moveSync(dest);
    return dest.uri.replace('file://', '');
  } catch {
    return null;
  }
}

function registerFile(): File {
  return new File(Paths.document, REGISTER_NAME);
}

/** Parses one candidate register file; null if absent or unreadable. */
function readRegister(f: File): ScreeningRecord[] | null {
  try {
    if (!f.exists) return null;
    const parsed = JSON.parse(f.textSync()) as Partial<RegisterFile>;
    return Array.isArray(parsed.records) ? parsed.records : null;
  } catch {
    return null;
  }
}

/**
 * The register, or the last good backup if the register itself is unreadable.
 * Only when neither can be read does this return an empty list — and in that
 * case the unreadable file is left in place rather than overwritten, so it can
 * still be recovered by hand.
 */
export function loadRecords(): ScreeningRecord[] {
  const main = readRegister(registerFile());
  if (main) return main;
  const backup = readRegister(new File(Paths.document, REGISTER_BAK));
  if (backup) {
    console.warn('[records] register unreadable; using backup');
    return backup;
  }
  return [];
}

/**
 * Atomic replace: write `.tmp`, keep the current file as `.bak`, then rename
 * `.tmp` into place. Throws if the write fails so the caller can say so —
 * silently dropping a screening is the one thing this must never do.
 */
export function saveRecords(records: ScreeningRecord[]): void {
  const payload: RegisterFile = { version: 1, records };
  const text = JSON.stringify(payload);

  const tmp = new File(Paths.document, REGISTER_TMP);
  if (tmp.exists) tmp.delete();
  tmp.write(text);
  // Read back before trusting it: a full disk can leave a short file behind.
  if (tmp.textSync() !== text) {
    tmp.delete();
    throw new Error('register write did not verify');
  }

  const main = registerFile();
  if (main.exists) {
    const bak = new File(Paths.document, REGISTER_BAK);
    if (bak.exists) bak.delete();
    main.copySync(bak);
  }
  tmp.moveSync(main, { overwrite: true });
}

/** Register JSON plus every kept photo — the settings screen's storage figure. */
export function registerSizeKb(): number {
  try {
    const f = registerFile();
    const registerBytes = f.exists ? f.size : 0;
    const photosDir = new Directory(Paths.document, PHOTOS_DIR);
    const photosBytes = photosDir.exists ? (photosDir.size ?? 0) : 0;
    const total = registerBytes + photosBytes;
    return total > 0 ? Math.max(1, Math.round(total / 1024)) : 0;
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
