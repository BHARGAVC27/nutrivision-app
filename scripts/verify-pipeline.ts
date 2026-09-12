/**
 * Off-device regression check for the JS half of the pipeline.
 *
 * Runs `features.ts` → `calibration.ts` → `zscore.ts` over the rows in
 * `scripts/fixtures/pipeline-fixture.json` (real rows from the mp-selfie
 * training table, with the expected numbers computed by the research repo's
 * own Python) and fails if anything drifts.
 *
 *     npx tsx scripts/verify-pipeline.ts
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { predictMuac } from '../src/pipeline/calibration';
import { assess } from '../src/pipeline/decide';
import { buildFeatures, FEATURE_NAMES, type ChildInputs } from '../src/pipeline/features';
import { macz } from '../src/pipeline/zscore';

type Row = {
  tag: string;
  child: ChildInputs;
  measurement: Parameters<typeof buildFeatures>[0];
  expected: { features: Record<string, number | null>; muacCm: number; z: number | null; cutCm: number };
};

const here = dirname(fileURLToPath(import.meta.url));
const rows: Row[] = JSON.parse(readFileSync(join(here, 'fixtures', 'pipeline-fixture.json'), 'utf8'));

let failures = 0;
let imputedRows = 0;
const worst = { feature: 0, muac: 0, z: 0, cut: 0 };

function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error('  FAIL', msg);
  }
}

for (const row of rows) {
  const f = buildFeatures(row.measurement, row.child);
  for (const name of FEATURE_NAMES) {
    const exp = row.expected.features[name];
    const got = f[name];
    if (exp == null) {
      check(!Number.isFinite(got), `${row.tag} ${name}: expected NaN, got ${got}`);
    } else {
      const err = Math.abs(got - exp);
      worst.feature = Math.max(worst.feature, err);
      check(err < 1e-9, `${row.tag} ${name}: expected ${exp}, got ${got}`);
    }
  }

  const pred = predictMuac(f);
  if (pred.imputed.length) imputedRows++;
  const muacErr = Math.abs(pred.muacCm - row.expected.muacCm);
  worst.muac = Math.max(worst.muac, muacErr);
  check(muacErr < 1e-9, `${row.tag} muac: expected ${row.expected.muacCm}, got ${pred.muacCm}`);

  // The Mramba table carries several rows at 60.0 and 61.0 months (day-indexed
  // WHO rows rounded to whole months). numpy.interp's pick among duplicates
  // depends on pandas' unstable sort, so at exactly those ages the desktop
  // number is itself only defined to ~0.01 z. Everywhere else it is exact.
  const dupAge = row.child.ageMonths === 60 || row.child.ageMonths === 61;
  const zTol = dupAge ? 1e-2 : 1e-6;

  const z = macz(pred.muacCm, row.child.ageMonths, row.child.sex);
  check(z != null && row.expected.z != null, `${row.tag}: z undefined`);
  if (z != null && row.expected.z != null) {
    const zErr = Math.abs(z - row.expected.z);
    worst.z = Math.max(worst.z, zErr);
    check(zErr < zTol, `${row.tag} z: expected ${row.expected.z}, got ${z}`);
  }

  const a = assess(pred.muacCm, row.child.ageMonths, row.child.sex);
  check(a != null, `${row.tag}: no assessment`);
  if (a) {
    const cutErr = Math.abs(a.cutCm - row.expected.cutCm);
    worst.cut = Math.max(worst.cut, cutErr);
    check(cutErr < (dupAge ? 1e-2 : 1e-6), `${row.tag} cut: expected ${row.expected.cutCm}, got ${a.cutCm}`);
    check(['refer', 'clear', 'unsure'].includes(a.decision), `${row.tag}: bad decision ${a.decision}`);
  }
}

console.log(`${rows.length} rows, ${imputedRows} with imputed features`);
console.log(`worst |Δ|: feature ${worst.feature.toExponential(2)}, muac ${worst.muac.toExponential(2)} cm, z ${worst.z.toExponential(2)}, cut ${worst.cut.toExponential(2)} cm`);
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('pipeline matches the research pipeline on every row');
