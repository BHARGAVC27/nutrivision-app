import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MACZ_MAX_MONTHS, MACZ_MIN_MONTHS, waz } from '@/pipeline/zscore';
import { useApp } from '@/store/app-state';
import { Btn, Card, Note, SpeakButton } from '@/ui/primitives';
import { Screen } from '@/ui/screen';
import { colors, fonts, radius } from '@/ui/theme';

/** Step 1 of 3 — age, sex, weight, optional name. No height: by design. */

const AGE_SLIDER_MIN = 1;
const AGE_SLIDER_MAX = 240;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

/** Weight is plausible for a person at all; the reference check below is the softer one. */
const WEIGHT_HARD_MIN_KG = 2;
const WEIGHT_HARD_MAX_KG = 120;
/** Beyond this many SD from the weight-for-age median, ask the worker to re-check the scale. */
const WEIGHT_WARN_Z = 5;

export default function InfoScreen() {
  const router = useRouter();
  const { L, E, X, say, draft, updateDraft } = useApp();
  const { ageMonths, sex, weight, name } = draft;

  const w = parseFloat(weight);
  const weightOk = Number.isFinite(w) && w >= WEIGHT_HARD_MIN_KG && w <= WEIGHT_HARD_MAX_KG;
  const z = weightOk ? waz(w, ageMonths, sex) : null;
  const weightOdd = Number.isFinite(w) && (!weightOk || (z != null && Math.abs(z) > WEIGHT_WARN_Z));
  const ageBad = ageMonths < MACZ_MIN_MONTHS || ageMonths > MACZ_MAX_MONTHS;
  const blocked = ageBad || !weightOk;

  const setAge = (n: number) => updateDraft({ ageMonths: Math.max(AGE_SLIDER_MIN, Math.min(AGE_SLIDER_MAX, Math.round(n))) });

  const keypad = (k: string) => {
    let v = weight;
    if (k === '⌫') v = v.slice(0, -1);
    else if (k === '.') {
      if (!v.includes('.')) v = (v || '0') + '.';
    } else if (v.replace('.', '').length < 4) v = (v === '0' ? '' : v) + k;
    updateDraft({ weight: v });
  };

  return (
    <Screen title={L.info_h} subtitle="Step 1 of 3" contentStyle={styles.content}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>{L.info_h}</Text>
          {!!E.info_h && <Text style={styles.h1En}>{E.info_h}</Text>}
        </View>
        <SpeakButton onPress={() => say(`${L.info_h}. ${L.age}. ${L.sex}. ${L.weight}`)} />
      </View>

      <Card style={styles.card}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{L.age}</Text>
          <Text style={styles.dual}>
            {Math.floor(ageMonths / 12)} {L.years} {ageMonths % 12} {L.months}
          </Text>
        </View>
        <View style={styles.stepper}>
          <Pressable accessibilityRole="button" accessibilityLabel="−1" onPress={() => setAge(ageMonths - 1)} style={styles.stepBtn}>
            <Text style={styles.stepGlyph}>−</Text>
          </Pressable>
          <View style={styles.ageValue}>
            <Text style={styles.ageNumber}>{ageMonths}</Text>
            <Text style={styles.ageUnit}> {L.months}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="+1" onPress={() => setAge(ageMonths + 1)} style={styles.stepBtn}>
            <Text style={styles.stepGlyph}>+</Text>
          </Pressable>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={AGE_SLIDER_MIN}
          maximumValue={AGE_SLIDER_MAX}
          step={1}
          value={ageMonths}
          onValueChange={setAge}
          minimumTrackTintColor={colors.green}
          maximumTrackTintColor={colors.sand}
          thumbTintColor={colors.green}
        />
        <View style={styles.jumps}>
          {[-12, -6, 6, 12].map((n) => (
            <Pressable key={n} accessibilityRole="button" onPress={() => setAge(ageMonths + n)} style={({ pressed }) => [styles.jump, pressed && styles.pressed]}>
              <Text style={styles.jumpText}>{n > 0 ? `+${n}` : n} mo</Text>
            </Pressable>
          ))}
        </View>
        {ageBad && (
          <Note tone="red" style={styles.warn}>
            <View style={styles.warnHead}>
              <Text style={styles.warnIconRed}>!</Text>
              <Text style={styles.warnTitleRed}>{L.age_range}</Text>
            </View>
            <Text style={styles.warnBodyRed}>Validated for 3 months to 19 years (3–228 months).</Text>
          </Note>
        )}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.label}>{L.sex}</Text>
        <View style={styles.sexRow}>
          <Toggle label={L.boy} on={sex === 'M'} onPress={() => updateDraft({ sex: 'M' })} />
          <Toggle label={L.girl} on={sex === 'F'} onPress={() => updateDraft({ sex: 'F' })} />
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.label}>{L.weight}</Text>
        <View style={styles.weightDisplay}>
          <Text style={styles.weightNumber}>{weight === '' ? '—' : weight}</Text>
          <Text style={styles.weightUnit}>kg</Text>
        </View>
        <View style={styles.keypad}>
          {KEYS.map((k) => (
            <Pressable key={k} accessibilityRole="button" onPress={() => keypad(k)} style={({ pressed }) => [styles.key, pressed && styles.pressed]}>
              <Text style={styles.keyText}>{k}</Text>
            </Pressable>
          ))}
        </View>
        {weightOdd && (
          <Note tone="amber" style={styles.warn}>
            <View style={styles.warnHead}>
              <Text style={styles.warnIconAmber}>?</Text>
              <Text style={styles.warnTitleAmber}>{L.weight_warn}</Text>
            </View>
            <Text style={styles.warnBodyAmber}>{X.odd(ageMonths)}</Text>
          </Note>
        )}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.label}>{L.name_opt}</Text>
        <TextInput
          value={name}
          onChangeText={(t) => updateDraft({ name: t })}
          placeholder="—"
          placeholderTextColor={colors.stone}
          style={styles.input}
          autoCapitalize="words"
          returnKeyType="done"
        />
      </Card>

      <Note style={styles.noHeight}>
        <View style={styles.noHeightRow}>
          <Text style={styles.noHeightGlyph}>◦</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.noHeightTitle}>{L.no_height}</Text>
            <Text style={styles.noHeightBody}>{X.no_height_s}</Text>
          </View>
        </View>
      </Note>

      <Btn
        label={L.btn_photo}
        minHeight={74}
        disabled={blocked}
        icon={<Text style={styles.ctaGlyph}>◎</Text>}
        labelStyle={{ fontSize: 18 }}
        style={styles.cta}
        onPress={() => {
          if (!blocked) router.push('/capture');
        }}
      />
    </Screen>
  );
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[styles.toggle, on && styles.toggleOn]}>
      <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 18 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  h1: { fontFamily: fonts.sansSemi, fontSize: 23, lineHeight: 30, color: colors.ink },
  h1En: { fontFamily: fonts.serif, fontSize: 16, color: colors.muted, marginTop: 2 },
  card: { marginTop: 10 },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  label: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.muted3 },
  dual: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  stepBtn: { width: 54, height: 54, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.page, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontFamily: fonts.sansSemi, fontSize: 26, color: colors.ink, includeFontPadding: false },
  ageValue: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  ageNumber: { fontFamily: fonts.serifSemi, fontSize: 38, lineHeight: 40, letterSpacing: -0.8, color: colors.ink, includeFontPadding: false },
  ageUnit: { fontFamily: fonts.sans, fontSize: 15, color: colors.muted, marginLeft: 5 },
  slider: { width: '100%', height: 44, marginTop: 12, marginBottom: 4 },
  jumps: { flexDirection: 'row', gap: 8 },
  jump: { flex: 1, height: 44, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.page, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  jumpText: { fontFamily: fonts.mono, fontSize: 13, color: colors.muted3 },
  pressed: { backgroundColor: colors.tintDark },
  warn: { marginTop: 12, padding: 13, paddingHorizontal: 14, borderRadius: radius.md },
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warnIconRed: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.redText },
  warnTitleRed: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.redText, flex: 1 },
  warnBodyRed: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.redText, marginTop: 3 },
  warnIconAmber: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.amberText },
  warnTitleAmber: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.amberText, flex: 1 },
  warnBodyAmber: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.amberText, marginTop: 3 },
  sexRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  toggle: { flex: 1, minHeight: 62, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.ink },
  toggleText: { fontFamily: fonts.sansSemi, fontSize: 17, color: colors.ink },
  toggleTextOn: { color: colors.surface },
  weightDisplay: { marginTop: 8, borderBottomWidth: 2, borderBottomColor: colors.ink, paddingBottom: 8, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  weightNumber: { fontFamily: fonts.serifSemi, fontSize: 44, lineHeight: 46, letterSpacing: -1.3, color: colors.ink, includeFontPadding: false },
  weightUnit: { fontFamily: fonts.sans, fontSize: 18, color: colors.muted2 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  key: { width: '31%', flexGrow: 1, height: 56, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.page, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontFamily: fonts.serifSemi, fontSize: 22, color: colors.ink, includeFontPadding: false },
  input: { marginTop: 9, paddingVertical: 15, paddingHorizontal: 14, backgroundColor: colors.page, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, fontFamily: fonts.sansMedium, fontSize: 16, color: colors.ink },
  noHeight: { marginTop: 10 },
  noHeightRow: { flexDirection: 'row', gap: 11 },
  noHeightGlyph: { fontSize: 16, color: colors.mutedWarm },
  noHeightTitle: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.muted3 },
  noHeightBody: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.mutedWarm, marginTop: 2 },
  cta: { marginTop: 18 },
  ctaGlyph: { fontSize: 20, color: colors.surface },
});
