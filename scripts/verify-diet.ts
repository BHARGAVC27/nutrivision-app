/**
 * Off-device check that `src/diet/plan.ts` reproduces the research repo's
 * `tools/diet_plan.py` exactly.
 *
 * `scripts/fixtures/diet-golden.json` is the research repo's
 * `diet/diet_plan_golden.json`, copied verbatim: fixed children with the
 * plan the Python computed. Any drift in the port fails here.
 *
 *     npx tsx scripts/verify-diet.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BASKET_KEYS, dietPlan, FOOD_GROUPS, RULEBOOK_VERSION } from '../src/diet/plan';
import type { DecisionKey } from '../src/pipeline/decide';

type Case = {
  input: { label: DecisionKey; age_months: number; sex: 'm' | 'f'; weight_kg: number };
  output: Record<string, unknown> & { scores: Record<string, number> };
};

const here = dirname(fileURLToPath(import.meta.url));
const gold: { rulebook_version: string; cases: Case[] } = JSON.parse(readFileSync(join(here, 'fixtures', 'diet-golden.json'), 'utf8'));

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error('  FAIL', msg);
  }
}

check(gold.rulebook_version === RULEBOOK_VERSION, `rulebook version: golden ${gold.rulebook_version}, app ${RULEBOOK_VERSION}`);

for (const { input: i, output: o } of gold.cases) {
  const tag = `${i.label} ${i.age_months}m ${i.sex} ${i.weight_kg}kg`;
  const p = dietPlan(i.label, i.age_months, i.sex === 'm' ? 'M' : 'F', i.weight_kg);
  if (!p) {
    check(false, `${tag}: no plan`);
    continue;
  }
  const pairs: [string, unknown, unknown][] = [
    ['age_group', p.ageGroup, o.age_group],
    ['icmr_band', p.icmrBand, o.icmr_band],
    ['kcal_target', p.kcalTarget, o.kcal_target],
    ['kcal_per_kg', p.kcalPerKg, o.kcal_per_kg],
    ['protein_g', p.proteinG, o.protein_g],
    ['catchup_kcal', p.catchupKcal, o.catchup_kcal],
    ['breastfeed', p.breastfeed, o.breastfeed],
    ['from_food_kcal', p.fromFoodKcal, o.from_food_kcal],
    ['meals_per_day', p.mealsPerDay, o.meals_per_day],
    ['snacks_per_day', p.snacksPerDay, o.snacks_per_day],
    ...BASKET_KEYS.map((k): [string, unknown, unknown] => [k, p.basket[k], o[k]]),
    ...FOOD_GROUPS.map((g): [string, unknown, unknown] => [`score_${g}`, p.scores[g], o.scores[g]]),
  ];
  for (const [name, got, exp] of pairs) check(got === exp, `${tag} ${name}: expected ${exp}, got ${got}`);
}

// Edges the app can reach: the reference range is 3–228 months.
check(dietPlan('clear', 229, 'M', 50) === null, 'age 229 should give no plan');
check(dietPlan('clear', 30, 'F', 0) === null, 'zero weight should give no plan');
for (let age = 3; age <= 228; age++) {
  for (const d of ['clear', 'unsure', 'refer'] as DecisionKey[]) {
    const p = dietPlan(d, age, age % 2 ? 'M' : 'F', 4 + age * 0.2);
    check(p !== null && p.kcalTarget > 0 && Object.values(p.basket).every((v) => v >= 0), `sweep ${d} ${age}m`);
  }
}

console.log(`${gold.cases.length} golden cases + 678-point age sweep`);
if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('diet plan port matches the research repo');
