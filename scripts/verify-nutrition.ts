/**
 * Off-device regression check for the nutrition extension.
 *
 * Replays `scripts/fixtures/nutrition-fixture.json` — the research repo's
 * Python engine (`nutrition_ext/scripts/food_plan.py`) run for every age
 * 3–228 months × sex × diet answer — through `src/nutrition/plan.ts` and fails
 * on any difference in routing, risks, plan row, menu or menu totals.
 *
 *     npx tsx scripts/verify-nutrition.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deficiencyRisks, foodPlan, type Diet } from '../src/nutrition/plan';
import type { MaczCategory, Sex } from '../src/pipeline/zscore';

type Case = {
  ageMonths: number;
  sex: Sex;
  diet: Diet | null;
  routing: Record<MaczCategory, string>;
  risks: Record<string, number> | null;
  planAgeGroup: string | null;
  menu: [slot: string, grams: number, foods: [code: string, portion: number, score: number][]][];
  totals: Record<string, number>;
};

const here = dirname(fileURLToPath(import.meta.url));
const cases: Case[] = JSON.parse(readFileSync(join(here, 'fixtures', 'nutrition-fixture.json'), 'utf8'));

let failures = 0;
let foodsChecked = 0;
const worst = { risk: 0, score: 0, total: 0 };

function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    if (failures <= 20) console.error('  FAIL', msg);
  }
}

for (const c of cases) {
  const id = `${c.ageMonths} mo ${c.sex} diet=${c.diet ?? '-'}`;

  for (const [cat, key] of Object.entries(c.routing) as [MaczCategory, string][]) {
    const got = foodPlan(c.ageMonths, c.sex, cat, c.diet).action;
    check(got === key, `${id} ${cat}: expected ${key}, got ${got}`);
  }

  const risks = deficiencyRisks(c.ageMonths, c.sex, c.diet);
  if (c.risks == null) {
    check(risks == null, `${id}: expected no risks`);
  } else {
    check(risks != null, `${id}: risks missing`);
    for (const r of risks ?? []) {
      const err = Math.abs(r.risk - c.risks[r.nutrient]);
      worst.risk = Math.max(worst.risk, err);
      check(err < 1e-12, `${id} ${r.nutrient}: expected ${c.risks[r.nutrient]}, got ${r.risk}`);
    }
  }

  const plan = foodPlan(c.ageMonths, c.sex, 'normal', c.diet);
  check((plan.row?.ageGroup ?? null) === c.planAgeGroup, `${id}: plan row ${plan.row?.ageGroup} vs ${c.planAgeGroup}`);
  check(plan.menu.length === c.menu.length, `${id}: ${plan.menu.length} menu slots vs ${c.menu.length}`);
  c.menu.forEach(([slot, grams, foods], i) => {
    const s = plan.menu[i];
    if (!s) return;
    check(s.slot === slot && Math.abs(s.grams - grams) < 1e-9, `${id} slot ${i}: ${s.slot} ${s.grams} vs ${slot} ${grams}`);
    check(s.foods.length === foods.length, `${id} ${slot}: ${s.foods.length} foods vs ${foods.length}`);
    foods.forEach(([code, portion, score], j) => {
      const f = s.foods[j];
      if (!f) return;
      foodsChecked++;
      check(f.food.code === code, `${id} ${slot} #${j}: ${f.food.code} vs ${code}`);
      check(Math.abs(f.portion - portion) < 1e-9, `${id} ${code} portion ${f.portion} vs ${portion}`);
      const err = Math.abs(f.score - score);
      worst.score = Math.max(worst.score, err);
      check(err < 1e-12, `${id} ${code} score ${f.score} vs ${score}`);
    });
  });
  const cols = new Set([...Object.keys(plan.totals), ...Object.keys(c.totals)]);
  for (const col of cols) {
    const got = plan.totals[col as keyof typeof plan.totals];
    const exp = c.totals[col];
    check(got != null && exp != null, `${id} total ${col}: ${got} vs ${exp}`);
    if (got != null && exp != null) {
      const err = Math.abs(got - exp);
      worst.total = Math.max(worst.total, err);
      check(err < 1e-9, `${id} total ${col}: ${got} vs ${exp}`);
    }
  }
}

console.log(`${cases.length} cases (every age 3–228 months × sex × diet answer), ${foodsChecked} menu foods compared`);
console.log(`worst |Δ|: risk ${worst.risk.toExponential(2)}, score ${worst.score.toExponential(2)}, menu total ${worst.total.toExponential(2)}`);
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('nutrition extension matches the research engine on every case');
