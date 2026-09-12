#!/usr/bin/env node
/**
 * Converts the growth-reference tables in the research repo
 * (`../who_reference_tables/`) into compact JSON the app can bundle.
 *
 * Output: `src/pipeline/reference/*.json`, one file per indicator, shaped
 *   { unit: 'days' | 'months', sexes: { m: [[age, L, M, S], ...], f: [...] } }
 * sorted by age, duplicate ages collapsed to the last row (numpy's interp on
 * the desktop tolerates duplicates; a strict search here does not).
 *
 * The files are committed, so this only needs re-running if the source tables
 * change. Provenance of every table: `who_reference_tables/README.md`.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const tablesDir = join(projectRoot, '..', 'who_reference_tables');
const outDir = join(projectRoot, 'src', 'pipeline', 'reference');

const TABLES = [
  // WHO 2006 arm-circumference-for-age, 3–60 months, day-indexed.
  { file: 'acanthro.txt', sep: '\t', unit: 'days', mCol: 'm', out: 'muac_0to5.json' },
  // Mramba et al. BMJ 2017 MUAC-for-age, 5–19 years, month-indexed.
  { file: 'muac_for_age_5to19_mramba.csv', sep: ',', unit: 'months', mCol: 'median', out: 'muac_5to19.json' },
  // WHO 2006 weight-for-age, 0–60 months, day-indexed (weight sanity check).
  { file: 'weianthro.txt', sep: '\t', unit: 'days', mCol: 'm', out: 'wfa_0to5.json' },
  // WHO 2007 weight-for-age, 61–120 months (WHO defines none past 120).
  { file: 'wfa_5to19_months.csv', sep: ',', unit: 'months', mCol: 'm', out: 'wfa_5to10.json' },
];

const SEX = { 1: 'm', 2: 'f' };

mkdirSync(outDir, { recursive: true });

for (const t of TABLES) {
  const lines = readFileSync(join(tablesDir, t.file), 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(t.sep).map((h) => h.trim());
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`${t.file}: no column "${name}" in ${header}`);
    return i;
  };
  const iSex = col('sex'), iAge = col('age'), iL = col('l'), iM = col(t.mCol), iS = col('s');

  const bySex = { m: new Map(), f: new Map() };
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const c = line.split(t.sep);
    const sex = SEX[Number(c[iSex])];
    if (!sex) throw new Error(`${t.file}: bad sex code ${c[iSex]}`);
    const age = Number(c[iAge]);
    // Last row wins for a duplicated age.
    bySex[sex].set(age, [age, Number(c[iL]), Number(c[iM]), Number(c[iS])]);
  }

  const sexes = {};
  for (const s of ['m', 'f']) {
    sexes[s] = [...bySex[s].values()].sort((a, b) => a[0] - b[0]);
  }
  const json = { source: t.file, unit: t.unit, sexes };
  writeFileSync(join(outDir, t.out), JSON.stringify(json));
  console.log(`${t.out}: m=${sexes.m.length} f=${sexes.f.length} rows (${t.unit} ${sexes.m[0][0]}–${sexes.m.at(-1)[0]})`);
}
