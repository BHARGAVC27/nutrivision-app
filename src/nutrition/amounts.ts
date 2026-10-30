import { dietPlan, type DietPlan } from '@/diet/plan';
import type { DecisionKey } from '@/pipeline/decide';
import type { Sex } from '@/pipeline/zscore';

import type { PlanAmounts } from './plan';

/**
 * The bridge between the two halves of the food advice: the weight-adjusted
 * daily plan (`diet/plan.ts`) supplies the amounts, the nutrition extension
 * (`nutrition/plan.ts`) chooses the foods. Milk is null under 12 months
 * (breast milk, as Annexure V's 7–12 month row says).
 */
export function amountsFrom(p: DietPlan, ageMonths: number): PlanAmounts {
  const b = p.basket;
  return {
    cereals_millets_g: b.cereals_g,
    pulses_g: b.pulses_g,
    glv_g: b.glv_g,
    vegetables_g: b.vegetables_g,
    roots_tubers_g: b.roots_tubers_g,
    fruits_g: b.fruits_g,
    nuts_g: b.nuts_g,
    milk_curd_ml: ageMonths < 12 ? null : b.milk_ml,
    fats_oils_g: b.fats_g,
    energyKcal: p.kcalTarget,
    proteinG: p.proteinG,
  };
}

/** The child's daily amounts, or null when the diet plan has none (outside 0–228 months). */
export function childAmounts(decision: DecisionKey, ageMonths: number, sex: Sex, weightKg: number): PlanAmounts | null {
  const p = dietPlan(decision, ageMonths, sex, weightKg);
  return p ? amountsFrom(p, ageMonths) : null;
}
