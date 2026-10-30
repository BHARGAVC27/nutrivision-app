import type { DecisionKey } from '@/pipeline/decide';
import type { Sex } from '@/pipeline/zscore';

import rulebookJson from './rulebook.json';

/**
 * The diet plan shown after a result: the screening decision plus age, sex
 * and weight, turned into daily targets, a food basket and food-group scores.
 *
 * Port of `tools/diet_plan.py` in the research repo. `rulebook.json` is that
 * repo's `diet/diet_rulebook.json`, copied verbatim; every number lives there,
 * with its source. `scripts/verify-diet.ts` checks this port against the
 * Python on fixed cases — change both or neither.
 *
 *   1. ICMR 2020 band from exact age (sex matters from 10 years).
 *   2. Maintenance = kcal/kg × weight, capped at the reference child's day.
 *   3. Catch-up for growth = target gain × weight × tissue cost
 *      (5 kcal and 0.23 g protein per g, FAO/WHO/UNU). Refer's 5 g/kg/day
 *      is WHO's +25 kcal/kg/day for moderate wasting; Not sure gets 60%.
 *   4. Basket: ICMR 2024 Table 1.6. Vegetables and fruit stay fixed, dense
 *      groups scale to maintenance, catch-up is added as cereal, milk, dal,
 *      nuts and ghee/oil.
 *
 * Under 6 months: breast milk only, no catch-up target (a wasted young
 * infant needs a clinic, not a calorie number). 6–11 months: the ICMR
 * complementary-food basket for the age, no animal milk.
 */

export const FOOD_GROUPS = [
  'cereals_millets',
  'pulses_beans',
  'milk_curd',
  'egg_meat_fish',
  'green_leafy_veg',
  'other_veg_roots',
  'fruits',
  'nuts_oilseeds',
  'ghee_oil',
  'sugar_junk',
] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];

export const BASKET_KEYS = ['cereals_g', 'pulses_g', 'glv_g', 'vegetables_g', 'roots_tubers_g', 'fruits_g', 'nuts_g', 'milk_ml', 'fats_g'] as const;
export type BasketKey = (typeof BASKET_KEYS)[number];
type Basket = Record<BasketKey, number>;

export const AGE_GROUPS = ['0_6m', '6m_3y', '3_6y', '6_9y', '9_12y', '12_15y', '15_plus'] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

type Band = {
  id: string;
  age_min_m: number;
  age_max_m: number;
  sex: 'any' | 'm' | 'f';
  ref_wt_kg: number;
  kcal_per_kg: number;
  ref_kcal: number;
  protein_rda_g_per_kg: number;
  basket: Basket | null;
  complementary_kcal?: { '6_8m': number; '9_11m': number };
};
type MealRow = { age_min_m: number; age_max_m: number; meals: number; snacks: number };
type Group = { id: AgeGroup; age_min_m: number; age_max_m: number; meals?: MealRow[] | string };
type Rulebook = {
  version: string;
  personalisation: { energy_cap_x_reference: number };
  catchup: {
    kcal_per_g_gain: number;
    protein_g_per_g_gain: number;
    target_gain_g_per_kg_day: Record<DecisionKey, number>;
    catchup_split: Partial<Basket>;
  };
  kcal_per_unit: Basket;
  icmr_bands: Band[];
  meal_rules: { catchup_extra: Record<DecisionKey, { meals: number; snacks: number }> };
  food_group_scores: Record<DecisionKey, Record<FoodGroup, number>>;
  age_groups: Group[];
};

const rb = rulebookJson as unknown as Rulebook;
export const RULEBOOK_VERSION = rb.version;

const PRODUCE: BasketKey[] = ['glv_g', 'vegetables_g', 'roots_tubers_g', 'fruits_g'];

export type DietPlan = {
  decision: DecisionKey;
  ageGroup: AgeGroup;
  icmrBand: string;
  kcalTarget: number;
  kcalPerKg: number;
  proteinG: number;
  catchupKcal: number;
  /** WHO: continue breastfeeding to 2 years. */
  breastfeed: boolean;
  /** 6–11 months only: energy from food on top of breast milk. */
  fromFoodKcal: number | null;
  mealsPerDay: number;
  snacksPerDay: number;
  /** Raw grams (millilitres for milk) per day. */
  basket: Basket;
  scores: Record<FoodGroup, number>;
};

/** floor(x·10^d + 0.5) / 10^d — the same formula as `_round` in diet_plan.py, so both agree to the bit. */
function round(x: number, digits = 0): number {
  const m = 10 ** digits;
  return Math.floor(x * m + 0.5) / m;
}

const within = (age: number, lo: number, hi: number) => lo <= age && age < hi + 1;
const kcalOf = (b: Partial<Basket>) =>
  (Object.keys(b) as BasketKey[]).reduce((s, k) => s + (b[k] ?? 0) * rb.kcal_per_unit[k], 0);

/** Null outside 0–228 months. */
export function dietPlan(decision: DecisionKey, ageMonths: number, sex: Sex, weightKg: number): DietPlan | null {
  const sx = sex === 'M' ? 'm' : 'f';
  const band = rb.icmr_bands.find((b) => within(ageMonths, b.age_min_m, b.age_max_m) && (b.sex === 'any' || b.sex === sx));
  const group = rb.age_groups.find((g) => within(ageMonths, g.age_min_m, g.age_max_m));
  if (!band || !group || !(weightKg > 0)) return null;

  const c = rb.catchup;
  const gain = band.basket === null ? 0 : c.target_gain_g_per_kg_day[decision];

  const maint = Math.min(band.kcal_per_kg * weightKg, band.ref_kcal);
  const cap = rb.personalisation.energy_cap_x_reference * band.ref_kcal;
  const total = Math.min(maint + c.kcal_per_g_gain * gain * weightKg, cap);
  const extra = total - maint;
  const protein = (band.protein_rda_g_per_kg + c.protein_g_per_g_gain * gain) * weightKg;

  // meals
  const add = rb.meal_rules.catchup_extra[decision];
  let mealsPerDay = 0;
  let snacksPerDay = 0;
  if (Array.isArray(group.meals)) {
    const row = group.meals.find((r) => within(ageMonths, r.age_min_m, r.age_max_m))!;
    mealsPerDay = row.meals + add.meals;
    snacksPerDay = row.snacks + add.snacks;
  }

  // basket
  let split: Partial<Basket> = { ...c.catchup_split };
  let basket: Basket;
  let fromFoodKcal: number | null = null;
  if (band.basket === null) {
    basket = Object.fromEntries(BASKET_KEYS.map((k) => [k, 0])) as Basket;
  } else if (band.id === 'inf_6_12') {
    const ck = band.complementary_kcal![ageMonths < 9 ? '6_8m' : '9_11m'];
    const s = ck / kcalOf(band.basket);
    basket = Object.fromEntries(BASKET_KEYS.map((k) => [k, band.basket![k] * s])) as Basket;
    const { milk_ml: _milk, ...rest } = split;
    const t = Object.values(rest).reduce((a, b) => a + (b ?? 0), 0);
    split = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, (v ?? 0) / t]));
    fromFoodKcal = round(ck + extra);
  } else {
    basket = { ...band.basket };
    const fixed = PRODUCE.reduce((s, k) => s + basket[k] * rb.kcal_per_unit[k], 0);
    const dense = kcalOf(basket) - fixed;
    const s = Math.max(maint - fixed, 0) / dense;
    for (const k of BASKET_KEYS) if (!PRODUCE.includes(k)) basket[k] *= s;
  }
  for (const k of Object.keys(split) as BasketKey[]) basket[k] += (extra * (split[k] ?? 0)) / rb.kcal_per_unit[k];

  return {
    decision,
    ageGroup: group.id,
    icmrBand: band.id,
    kcalTarget: round(total),
    kcalPerKg: round(total / weightKg, 1),
    proteinG: round(protein, 1),
    catchupKcal: round(extra),
    breastfeed: ageMonths < 24,
    fromFoodKcal,
    mealsPerDay,
    snacksPerDay,
    basket: Object.fromEntries(BASKET_KEYS.map((k) => [k, round(basket[k])])) as Basket,
    scores: { ...rb.food_group_scores[decision] },
  };
}
