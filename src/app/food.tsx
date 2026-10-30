import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Extra, LangCode, Strings } from '@/i18n/strings';
import { DIET } from '@/diet/strings';
import { childAmounts } from '@/nutrition/amounts';
import {
  COLUMN_UNIT,
  DIET_LABEL,
  FLAG_AT,
  foodPlan,
  foodPlanForAmounts,
  LAMBDA,
  TABLES_VERSION,
  type ActionKey,
  type Diet,
  type Food,
  type FoodPlan,
  type MenuSlot,
  type Nutrient,
  type NutrientColumn,
  type PlanColumn,
  type PlanRow,
  type Risk,
  type SlotId,
} from '@/nutrition/plan';
import { useApp } from '@/store/app-state';
import { useResultView } from '@/store/result-view';
import { Btn, Card, Note, SpeakButton } from '@/ui/primitives';
import { Screen } from '@/ui/screen';
import { colors, fonts, radius } from '@/ui/theme';

/**
 * "Food plan": the nutrition extension (`src/nutrition/plan.ts`). What the
 * screening category means for food, the daily plan, one menu chosen for the
 * deficiencies that are common in children like this one, and where every
 * number came from. Built from age, sex, category and the optional diet
 * answer, so it works the same for a fresh result and a saved record.
 */

const NUTRIENT_LABEL: Record<Nutrient, keyof Strings> = {
  anaemia: 'n_anaemia',
  iron_def: 'n_iron',
  vitD_def: 'n_vitd',
  zinc_def: 'n_zinc',
  vitA_def: 'n_vita',
  folate_def: 'n_folate',
  b12_def: 'n_b12',
};

/** The IFCT columns whose menu totals answer "what does the menu give" for a nutrient. */
const NUTRIENT_COLUMNS: Record<Nutrient, NutrientColumn[]> = {
  anaemia: ['fe'],
  iron_def: ['fe'],
  vitD_def: ['vitd'],
  zinc_def: ['zn'],
  vitA_def: ['retol', 'cartb'],
  folate_def: ['folsum'],
  b12_def: [],
};

const PLAN_GROUPS: [PlanColumn, keyof Strings][] = [
  ['cereals_millets_g', 'g_cereals'],
  ['pulses_g', 'g_pulses'],
  ['glv_g', 'g_glv'],
  ['vegetables_g', 'g_veg'],
  ['roots_tubers_g', 'g_roots'],
  ['fruits_g', 'g_fruits'],
  ['nuts_g', 'g_nuts'],
  ['milk_curd_ml', 'g_milk'],
  ['fats_oils_g', 'g_fats'],
];

const SLOT_LABEL: Record<SlotId, keyof Strings> = {
  millets: 'sl_millets',
  pulses: 'g_pulses',
  glv: 'g_glv',
  vegetables: 'g_veg',
  roots: 'g_roots',
  fruits: 'g_fruits',
  nuts: 'g_nuts',
  milk: 'g_milk',
  swap: 'sl_swap',
};

const DIET_KEY: Record<Diet, 'd_veg' | 'd_egg' | 'd_nonveg'> = { veg: 'd_veg', egg: 'd_egg', nonveg: 'd_nonveg' };

function actionText(key: ActionKey, X: Extra): string {
  switch (key) {
    case 'refer':
      return X.act_refer;
    case 'infant':
      return X.act_infant;
    case 'infant_mod':
      return X.act_infant_mod;
    case 'mod_anganwadi':
      return X.act_mod_anganwadi;
    case 'mod_school':
      return X.act_mod_school;
    case 'mod_health':
      return X.act_mod_health;
    default:
      return X.act_plan;
  }
}

function tipFor(nutrients: Nutrient[], X: Extra): string {
  switch (nutrients[0]) {
    case 'anaemia':
      return nutrients.includes('iron_def') ? `${X.tip_anaemia} ${X.tip_iron_add}` : X.tip_anaemia;
    case 'iron_def':
      return X.tip_iron;
    case 'vitD_def':
      return X.tip_vitd;
    case 'zinc_def':
      return X.tip_zinc;
    case 'vitA_def':
      return X.tip_vita;
    case 'folate_def':
      return X.tip_folate;
    default:
      return X.tip_b12;
  }
}

/** Flagged nutrients as cards; anaemia and iron deficiency share one (same foods, same advice). */
function flaggedGroups(risks: Risk[]): { nutrients: Nutrient[]; risk: number }[] {
  const out: { nutrients: Nutrient[]; risk: number }[] = [];
  for (const r of risks) {
    if (!r.flagged) continue;
    const anaemia = out.find((g) => g.nutrients[0] === 'anaemia');
    if (r.nutrient === 'iron_def' && anaemia) anaemia.nutrients.push('iron_def');
    else out.push({ nutrients: [r.nutrient], risk: r.risk });
  }
  return out;
}

function localName(food: Food, lang: LangCode): string | null {
  return lang === 'en' ? null : food.local[lang];
}

const pct = (p: number) => `${(100 * p).toFixed(1)}%`;

/** The CNNS rows behind one risk, e.g. "10-19 y 28.4% · 10–14 y 24.1% · ♀ 39.6% → 33.7% (CNNS 6.5)". */
function provenance(r: Risk): string {
  const band = r.sources[0].category;
  const parts = r.sources.map((s) => {
    if (s.kind === 'total') return `${s.category} y ${pct(s.rate)}`;
    if (s.kind === 'age') return `${s.category} ${band === '1-4' ? 'mo' : 'y'} ${pct(s.rate)}`;
    if (s.kind === 'diet') return `${s.category.toLowerCase()} ${pct(s.rate)}`;
    return `${s.category === 'Male' ? '♂' : '♀'} ${pct(s.rate)}`;
  });
  const tables = [...new Set(r.sources.map((s) => s.table))].join(', ');
  return `${parts.join(' · ')} → ${pct(r.risk)} (CNNS ${tables})`;
}

function sources(plan: FoodPlan): string[] {
  const who2013 = 'WHO 2013, Guideline: updates on the management of severe acute malnutrition in infants and children.';
  const dgi = 'ICMR-NIN, Dietary Guidelines for Indians 2024: Annexure V (food groups, "30 g of pulses may be substituted with meat or eggs"); advice pp. 30, 34, 36 and Guideline 15.';
  const amounts = 'Daily amounts: the Diet plan screen — ICMR-NIN 2020 needs per kg of the child’s weight, plus WHO / FAO catch-up food for Not sure and Refer.';
  if (!plan.row) return plan.action === 'refer' ? [who2013, dgi] : [dgi];
  const out = [
    ...(plan.action === 'refer' ? [who2013] : []),
    amounts,
    `CNNS 2016–18 National Report (MoHFW, UNICEF, Population Council, 2019): deficiency rates by age, sex and diet, combined with λ = ${LAMBDA.toFixed(2)}; marked at ≥ ${Math.round(FLAG_AT * 100)} in 100 (WHO).`,
    'NHANES 2011–2023 (US CDC), 12,973 children with blood tests: arm size and weight added < 0.01 AUROC to age and sex for these deficiencies.',
    dgi,
    'Indian Food Composition Tables 2017 (ICMR-NIN): nutrients and local names; only foods sampled in ≥ 5 of its 6 regions. Menu score: each marked nutrient counts 0–1 (amount ÷ best food in that slot).',
    'Government of India, Nutri-Cereals notification, 2018: the millets suggested for the millet share.',
  ];
  if (plan.moderate) out.push('NFSA 2013 Schedule II (revised 2023): Anganwadi supplementary nutrition, 6 months–6 years; PM POSHAN school midday meal.');
  return out;
}

/** What the speak button reads: the action, then today's first-choice foods. */
function spoken(plan: FoodPlan, action: string, L: Strings, lang: LangCode): string {
  const foods = plan.menu.flatMap((s) => (s.foods[0] ? [localName(s.foods[0].food, lang) ?? s.foods[0].food.display] : []));
  return foods.length ? `${action} ${L.menu_h}: ${foods.join(', ')}.` : action;
}

export default function FoodScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { L, E, X, lang, say } = useApp();
  const view = useResultView();

  useEffect(() => {
    if (!view && navigation.isFocused()) router.replace('/');
  }, [view, navigation, router]);
  if (!view) return null;

  // The menu fills the child's own weight-adjusted amounts (Diet plan screen), so the two never disagree.
  const amounts = childAmounts(view.result.decision, view.ageMonths, view.sex, view.weightKg);
  const plan = amounts
    ? foodPlanForAmounts(view.ageMonths, view.sex, view.result.category, view.diet, amounts)
    : foodPlan(view.ageMonths, view.sex, view.result.category, view.diet);
  // A full plan is given even when referring, so the referral text is the Diet plan's, not "no food plan is given".
  const action = plan.action === 'refer' ? DIET[lang].banner.refer : actionText(plan.action, X);
  const tone = plan.action === 'refer' ? 'red' : plan.moderate ? 'amber' : 'green';

  return (
    <Screen title={L.food} subtitle="Deficiency risk and daily food" contentStyle={styles.content}>
      <Text style={styles.h1}>{L.food}</Text>
      {!!E.food && <Text style={styles.h1En}>{E.food}</Text>}

      {view.result.decision === 'unsure' && plan.row && (
        <Note tone="amber" style={styles.action}>
          <Text style={styles.unsure}>{X.unsure_food}</Text>
        </Note>
      )}

      <Note tone={tone} style={styles.action}>
        <View style={styles.actionRow}>
          <Text style={[styles.actionText, { color: ACTION_TEXT[tone] }]}>{action}</Text>
          <SpeakButton size={46} tone={tone === 'red' ? 'red' : 'green'} onPress={() => say(spoken(plan, action, L, lang))} />
        </View>
      </Note>

      {plan.row && (
        <>
          <DailyPlan plan={plan} row={plan.row} />
          {plan.menu.length > 0 && <Menu menu={plan.menu} />}
          {plan.risks && flaggedGroups(plan.risks).map((g) => <NutrientNote key={g.nutrients.join('+')} group={g} totals={plan.totals} />)}
          <Risks risks={plan.risks} />
          <Note style={styles.card}>{X.limit}</Note>
        </>
      )}

      <HowWeGotThis plan={plan} />

      <Btn label={L.back} variant="outline" minHeight={64} labelStyle={{ fontSize: 16 }} style={{ marginTop: 16 }} onPress={() => router.back()} />
    </Screen>
  );
}

function DailyPlan({ plan, row }: { plan: FoodPlan; row: PlanRow }) {
  const { L, X } = useApp();
  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>{L.daily}</Text>
      {row.energyKcal != null && row.proteinG != null && <Text style={styles.cardSub}>{X.kcal(row.energyKcal, row.proteinG)}</Text>}
      <View style={styles.planTable}>
        {PLAN_GROUPS.map(([col, key]) => {
          const v = row[col];
          return (
            <View key={col} style={styles.planRow}>
              <Text style={styles.planLabel}>{L[key]}</Text>
              <Text style={styles.planValue}>{v == null ? L.breast_milk : `${v} ${col === 'milk_curd_ml' ? 'ml' : 'g'}`}</Text>
            </View>
          );
        })}
      </View>
      {plan.diet !== 'veg' && <Text style={styles.small}>{X.swap}</Text>}
      <Text style={styles.small}>{plan.dietAsked ? X.diet_used(L[DIET_KEY[plan.diet]]) : X.diet_none}</Text>
    </Card>
  );
}

function Menu({ menu }: { menu: MenuSlot[] }) {
  const { L, X, lang } = useApp();
  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>{L.menu_h}</Text>
      <Text style={styles.cardSub}>{X.menu_s}</Text>
      <View style={styles.planTable}>
        {menu.map((s) => {
          const [top, ...alts] = s.foods;
          const unit = s.slot === 'milk' ? 'ml' : 'g';
          const local = top ? localName(top.food, lang) : null;
          return (
            <View key={s.slot} style={styles.menuRow}>
              <View style={styles.menuHead}>
                <Text style={styles.menuSlot}>{L[SLOT_LABEL[s.slot]]}</Text>
                <Text style={styles.planValue}>{`${Math.round(top ? top.portion : s.grams)} ${unit}`}</Text>
              </View>
              {top ? (
                <>
                  <Text style={styles.foodName}>
                    {top.food.display}
                    {!!local && <Text style={styles.foodLocal}>{`  ·  ${local}`}</Text>}
                  </Text>
                  <Text style={styles.ifct}>{`IFCT ${top.food.code} · ${top.food.name}`}</Text>
                  {alts.length > 0 && (
                    <Text style={styles.alts}>
                      {`${L.or_w}: ${alts.map((a) => localName(a.food, lang) ?? a.food.display).join(', ')}`}
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.anyFood}>{L.any_food}</Text>
              )}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function NutrientNote({ group, totals }: { group: { nutrients: Nutrient[]; risk: number }; totals: FoodPlan['totals'] }) {
  const { L, X } = useApp();
  const cols = NUTRIENT_COLUMNS[group.nutrients[0]];
  const given = cols
    .filter((c) => totals[c] != null)
    .map((c) => `${totals[c]!.toFixed(1)} ${COLUMN_UNIT[c]}`)
    .join(' + ');
  return (
    <Card style={styles.card}>
      <View style={styles.targetHead}>
        <Text style={[styles.cardTitle, { flex: 1 }]}>{group.nutrients.map((n) => L[NUTRIENT_LABEL[n]]).join(' + ')}</Text>
        <Text style={styles.targetRisk}>{X.of100(Math.round(100 * group.risk))}</Text>
      </View>
      {!!given && <Text style={styles.gives}>{X.gives(given)}</Text>}
      <Text style={styles.tip}>{tipFor(group.nutrients, X)}</Text>
    </Card>
  );
}

function Risks({ risks }: { risks: Risk[] | null }) {
  const { L, X } = useApp();
  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>{L.risk_h}</Text>
      {risks ? (
        <>
          <Text style={styles.cardSub}>{X.risk_s}</Text>
          <View style={styles.bars}>
            {risks.map((r) => {
              const n = Math.round(100 * r.risk);
              return (
                <View key={r.nutrient}>
                  <View style={styles.barHead}>
                    <Text style={[styles.barLabel, r.flagged && styles.barLabelOn]}>{L[NUTRIENT_LABEL[r.nutrient]]}</Text>
                    <Text style={[styles.barValue, r.flagged && styles.barValueOn]}>{X.of100(n)}</Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.min(100, n)}%` as const }, r.flagged && styles.fillOn]} />
                    <View style={[styles.mark, { left: `${Math.round(100 * FLAG_AT)}%` as const }]} />
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={[styles.small, { marginTop: 12 }]}>{X.not_arm}</Text>
          <Note tone="amber" style={{ marginTop: 10 }}>
            {X.confirm}
          </Note>
        </>
      ) : (
        <Text style={styles.cardSub}>{X.no_risk_infant}</Text>
      )}
    </Card>
  );
}

function HowWeGotThis({ plan }: { plan: FoodPlan }) {
  const { L, X } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <Card tint style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={styles.howHead}>
        <Text style={[styles.cardTitle, { flex: 1 }]}>{L.how_h}</Text>
        <Text style={styles.howToggle}>{open ? L.how_less : L.how_more}</Text>
      </Pressable>
      <Text style={styles.cardSub}>{X.how_s}</Text>
      {open && (
        <>
          {plan.risks && (
            <View style={styles.monoList}>
              {plan.risks.map((r) => (
                <Text key={r.nutrient} style={styles.mono}>
                  <Text style={styles.monoStrong}>{L[NUTRIENT_LABEL[r.nutrient]]}</Text>
                  {`  ${provenance(r)}`}
                </Text>
              ))}
            </View>
          )}
          <View style={styles.monoList}>
            {sources(plan).map((s) => (
              <Text key={s} style={styles.mono}>
                {s}
              </Text>
            ))}
            <Text style={styles.mono}>{`Food-plan tables ${TABLES_VERSION}${plan.dietAsked ? ` · diet: ${DIET_LABEL[plan.diet]}` : ' · diet not asked'}`}</Text>
          </View>
        </>
      )}
    </Card>
  );
}

const ACTION_TEXT = { red: colors.redText, amber: colors.amberText, green: colors.greenText } as const;

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 18 },
  h1: { fontFamily: fonts.sansSemi, fontSize: 22, lineHeight: 29, color: colors.ink },
  h1En: { fontFamily: fonts.serif, fontSize: 16, color: colors.muted, marginTop: 2 },
  action: { marginTop: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  actionText: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 16, lineHeight: 25 },
  unsure: { fontFamily: fonts.sansSemi, fontSize: 15, lineHeight: 23, color: colors.amberText },
  card: { marginTop: 10 },
  cardTitle: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.ink },
  cardSub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.muted2, marginTop: 3 },
  planTable: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  planRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.divider },
  planLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 15, color: colors.ink },
  planValue: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.ink },
  small: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.mutedWarm, marginTop: 8 },
  menuRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
  menuHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  menuSlot: { flex: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  foodName: { fontFamily: fonts.sansSemi, fontSize: 16, color: colors.ink, marginTop: 3 },
  foodLocal: { fontFamily: fonts.sans, color: colors.muted },
  ifct: { fontFamily: fonts.mono, fontSize: 10, color: colors.ghost, marginTop: 2 },
  alts: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: colors.muted2, marginTop: 3 },
  anyFood: { fontFamily: fonts.sans, fontSize: 14, color: colors.muted, marginTop: 3 },
  targetHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  targetRisk: { fontFamily: fonts.monoMedium, fontSize: 12, color: colors.amberText },
  gives: { fontFamily: fonts.monoMedium, fontSize: 13, color: colors.greenText, marginTop: 6 },
  tip: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, color: colors.ink, marginTop: 6 },
  bars: { marginTop: 12, gap: 11 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  barLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 14, color: colors.muted },
  barLabelOn: { fontFamily: fonts.sansSemi, color: colors.ink },
  barValue: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  barValueOn: { fontFamily: fonts.monoMedium, color: colors.amberText },
  track: { marginTop: 5, height: 8, borderRadius: radius.pill, backgroundColor: colors.tint, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.stoneLight },
  fillOn: { backgroundColor: colors.amber },
  mark: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: colors.ink, opacity: 0.45 },
  howHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  howToggle: { fontFamily: fonts.sansSemi, fontSize: 13, color: colors.green },
  monoList: { marginTop: 12, gap: 6 },
  mono: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 16, color: colors.mutedWarm },
  monoStrong: { fontFamily: fonts.monoMedium, color: colors.ink },
});
