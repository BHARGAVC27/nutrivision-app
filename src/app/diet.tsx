import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dietPlan, FOOD_GROUPS, type DietPlan, type FoodGroup } from '@/diet/plan';
import { DIET, type DietStrings } from '@/diet/strings';
import { deficiencyRisks, type Nutrient } from '@/nutrition/plan';
import { useApp } from '@/store/app-state';
import { useResultView } from '@/store/result-view';
import { Btn, Card, Kicker, Note, SpeakButton } from '@/ui/primitives';
import { Screen } from '@/ui/screen';
import { colors, decisionColors, fonts, radius } from '@/ui/theme';

/**
 * The diet plan for the result on screen: the decision plus this child's
 * age, sex and weight, turned into daily targets, food-group scores with
 * amounts, example foods and tips (`diet/plan.ts`). Every label gets the
 * full plan; Refer also carries the "health centre first" banner, because
 * food alone does not treat severe wasting.
 */
export default function DietScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { L, X, lang, say } = useApp();
  const view = useResultView();
  // Starts from the diet answer on the details screen (not given = non-veg, as the food menu assumes).
  const [veg, setVeg] = useState(view?.diet === 'veg');

  useEffect(() => {
    if (!view && navigation.isFocused()) router.replace('/');
  }, [view, navigation, router]);
  if (!view) return null;

  const D = DIET[lang];
  const decision = view.result.decision;
  const p = dietPlan(decision, view.ageMonths, view.sex, view.weightKg);
  if (!p) return null;

  const tone = decisionColors[decision];
  const infant = p.ageGroup === '0_6m';
  const tips = tipsFor(p, D);
  const example = D.examples[p.ageGroup][veg ? 'veg' : 'nonveg'];
  const groups = FOOD_GROUPS.filter((g) => !(veg && g === 'egg_meat_fish'));

  return (
    <Screen title={D.title} subtitle={D.sub} contentStyle={styles.content}>
      <Text style={styles.h1}>{D.title}</Text>
      {lang !== 'en' && <Text style={styles.h1En}>{DIET.en.title}</Text>}

      <View style={[styles.banner, { backgroundColor: tone.soft }]}>
        <Text style={[styles.bannerIcon, { color: tone.bg }]}>{tone.icon}</Text>
        <Text style={[styles.bannerText, { color: tone.text }]}>{D.banner[decision]}</Text>
      </View>

      {infant ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{D.bf_h}</Text>
          <Text style={styles.cardSub}>{D.bf_s}</Text>
        </Card>
      ) : (
        <>
          <View style={styles.tiles}>
            <Tile kicker={D.energy} value={String(p.kcalTarget)} unit="kcal" />
            <Tile kicker={D.protein} value={String(p.proteinG)} unit="g" />
          </View>
          <Card style={styles.card}>
            <Kicker>{D.meals_h}</Kicker>
            <Text style={styles.meals}>{D.meals_line(p.mealsPerDay, p.snacksPerDay)}</Text>
            <Text style={styles.cardSub}>{D.per_day}</Text>
            {p.fromFoodKcal != null && <Text style={styles.cardSub}>{D.infant_food(p.fromFoodKcal)}</Text>}
            {p.breastfeed && <Text style={styles.cardSub}>{D.bf_note}</Text>}
          </Card>
        </>
      )}

      {!infant && <Deficiencies ageMonths={view.ageMonths} sex={view.sex} diet={view.diet} onOpen={() => router.push('/food')} />}

      <View style={styles.toggle}>
        <Toggle label={D.veg} active={veg} onPress={() => setVeg(true)} />
        <Toggle label={D.nonveg} active={!veg} onPress={() => setVeg(false)} />
      </View>

      {!infant && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{D.scores_h}</Text>
          <Text style={styles.cardSub}>{D.scores_s}</Text>
          <View style={{ marginTop: 10 }}>
            {groups.map((g) => (
              <ScoreRow key={g} name={D.groups[g]} score={p.scores[g]} amount={amountFor(g, p, D, view.ageMonths)} />
            ))}
          </View>
          {!veg && <Text style={styles.cardSub}>{D.nonveg_swap}</Text>}
        </Card>
      )}

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{D.examples_h}</Text>
        <Text style={styles.body}>{example}</Text>
      </Card>

      <Card style={styles.card}>
        <View style={styles.tipsHead}>
          <Text style={[styles.cardTitle, { flex: 1 }]}>{D.tips_h}</Text>
          <SpeakButton size={42} onPress={() => say(`${D.banner[decision]} ${tips.join(' ')}`)} />
        </View>
        {tips.map((t, i) => (
          <View key={i} style={styles.tip}>
            <Text style={styles.tipDot}>•</Text>
            <Text style={styles.tipText}>{t}</Text>
          </View>
        ))}
      </Card>

      <Note style={{ marginTop: 12 }}>{D.source}</Note>

      <Btn label={L.back} variant="outline" minHeight={64} labelStyle={{ fontSize: 16 }} style={{ marginTop: 16 }} onPress={() => router.back()} />
    </Screen>
  );
}

const NUTRIENT_LABEL: Record<Nutrient, 'n_anaemia' | 'n_iron' | 'n_vitd' | 'n_zinc' | 'n_vita' | 'n_folate' | 'n_b12'> = {
  anaemia: 'n_anaemia',
  iron_def: 'n_iron',
  vitD_def: 'n_vitd',
  zinc_def: 'n_zinc',
  vitA_def: 'n_vita',
  folate_def: 'n_folate',
  b12_def: 'n_b12',
};

/**
 * The nutrition extension at a glance: which deficiencies are common (≥ 20 in
 * 100, CNNS) for children like this one, and the way into the full menu.
 */
function Deficiencies({ ageMonths, sex, diet, onOpen }: { ageMonths: number; sex: 'M' | 'F'; diet: Parameters<typeof deficiencyRisks>[2]; onOpen: () => void }) {
  const { L, X } = useApp();
  const risks = deficiencyRisks(ageMonths, sex, diet);
  const shown = risks ? [...risks].sort((a, b) => b.risk - a.risk).filter((r, i) => r.flagged || i < 3) : [];
  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>{L.risk_h}</Text>
      {risks ? (
        <>
          <Text style={styles.cardSub}>{X.confirm}</Text>
          {shown.map((r) => (
            <View key={r.nutrient} style={styles.riskRow}>
              <Text style={[styles.riskName, r.flagged && styles.riskOn]}>{L[NUTRIENT_LABEL[r.nutrient]]}</Text>
              <Text style={[styles.riskVal, r.flagged && styles.riskOn]}>{X.of100(Math.round(100 * r.risk))}</Text>
            </View>
          ))}
        </>
      ) : (
        <Text style={styles.cardSub}>{X.no_risk_infant}</Text>
      )}
      <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.menuBtn, pressed && { backgroundColor: colors.surfaceHover }]}>
        <Text style={styles.menuBtnText}>{`${L.menu_h} · ${L.food}`}</Text>
        <Text style={styles.menuBtnChevron}>›</Text>
      </Pressable>
    </Card>
  );
}

/** Tips in the order a worker should read them: what this label asks first, then the general ones. */
function tipsFor(p: DietPlan, D: DietStrings): string[] {
  if (p.ageGroup === '0_6m') {
    const extra = p.decision === 'refer' ? [D.tips.refer_infant] : p.decision === 'unsure' ? [D.tips.unsure[3]] : [];
    return [...extra, ...D.tips.bf];
  }
  return [...D.tips[p.decision], ...D.tips.all];
}

/** The day's raw amount behind each score. Egg/meat/fish shares the dal amount (ICMR), so it has none of its own. */
function amountFor(g: FoodGroup, p: DietPlan, D: DietStrings, ageMonths: number): string | null {
  const b = p.basket;
  switch (g) {
    case 'cereals_millets':
      return `${b.cereals_g} g`;
    case 'pulses_beans':
      return `${b.pulses_g} g`;
    case 'milk_curd':
      return ageMonths < 12 ? D.bm : `${b.milk_ml} ml`;
    case 'green_leafy_veg':
      return `${b.glv_g} g`;
    case 'other_veg_roots':
      return `${b.vegetables_g + b.roots_tubers_g} g`;
    case 'fruits':
      return `${b.fruits_g} g`;
    case 'nuts_oilseeds':
      return `${b.nuts_g} g`;
    case 'ghee_oil':
      return `${b.fats_g} g`;
    case 'sugar_junk':
      return D.avoid;
    default:
      return null;
  }
}

function Tile({ kicker, value, unit }: { kicker: string; value: string; unit: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileKicker}>{kicker}</Text>
      <View style={styles.tileValueRow}>
        <Text style={styles.tileValue}>{value}</Text>
        <Text style={styles.tileUnit}>{unit}</Text>
      </View>
    </View>
  );
}

function Toggle({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.toggleBtn, active && styles.toggleBtnActive]}>
      <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** Five segments, filled to the score; 0 is spelled out in red rather than drawn empty. */
function ScoreRow({ name, score, amount }: { name: string; score: number; amount: string | null }) {
  const avoid = score === 0;
  return (
    <View style={styles.scoreRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.scoreName}>{name}</Text>
        {!!amount && <Text style={[styles.scoreAmount, avoid && { color: colors.redText }]}>{amount}</Text>}
      </View>
      <View style={styles.segments}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[styles.segment, i <= score && styles.segmentOn, avoid && styles.segmentAvoid]} />
        ))}
      </View>
      <Text style={[styles.scoreNum, avoid && { color: colors.redText }]}>{score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30 },
  h1: { fontFamily: fonts.sansSemi, fontSize: 22, lineHeight: 29, color: colors.ink },
  h1En: { fontFamily: fonts.serif, fontSize: 16, color: colors.muted, marginTop: 2 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12, padding: 14, borderRadius: radius.lg },
  bannerIcon: { fontFamily: fonts.sansSemi, fontSize: 18, lineHeight: 22 },
  bannerText: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 22 },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 10 },
  tile: { flex: 1, paddingVertical: 13, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tileKicker: { fontFamily: fonts.sansSemi, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: colors.muted },
  tileValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 3 },
  tileValue: { fontFamily: fonts.monoMedium, fontSize: 26, color: colors.ink, includeFontPadding: false },
  tileUnit: { fontFamily: fonts.mono, fontSize: 13, color: colors.muted },
  card: { marginTop: 10 },
  cardTitle: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.ink },
  cardSub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.muted2, marginTop: 3 },
  meals: { fontFamily: fonts.sansSemi, fontSize: 18, color: colors.ink, marginTop: 6 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 24, color: colors.ink, marginTop: 6 },
  toggle: { flexDirection: 'row', gap: 8, marginTop: 14 },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  toggleBtnActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  toggleText: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.ink },
  toggleTextActive: { color: colors.surface },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.divider },
  scoreName: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink },
  scoreAmount: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 1 },
  segments: { flexDirection: 'row', gap: 3 },
  segment: { width: 14, height: 10, borderRadius: 3, backgroundColor: colors.tintDark },
  segmentOn: { backgroundColor: colors.green },
  segmentAvoid: { backgroundColor: colors.redBg },
  scoreNum: { width: 14, textAlign: 'right', fontFamily: fonts.monoMedium, fontSize: 13, color: colors.ink },
  riskRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 6 },
  riskName: { flex: 1, fontFamily: fonts.sans, fontSize: 14, color: colors.muted },
  riskVal: { fontFamily: fonts.mono, fontSize: 13, color: colors.muted },
  riskOn: { fontFamily: fonts.sansSemi, color: colors.amberText },
  menuBtn: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.ink, borderRadius: radius.lg, backgroundColor: colors.surface },
  menuBtnText: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.ink, flex: 1 },
  menuBtnChevron: { fontSize: 20, color: colors.muted3 },
  tipsHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tip: { flexDirection: 'row', gap: 8, marginTop: 8 },
  tipDot: { fontFamily: fonts.sansSemi, fontSize: 15, lineHeight: 22, color: colors.muted },
  tipText: { flex: 1, fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.ink },
});
