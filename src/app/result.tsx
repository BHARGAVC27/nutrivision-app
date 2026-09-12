import { useNavigation, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { discardPhoto, useApp } from '@/store/app-state';
import { formatWhen } from '@/ui/record-row';
import { categoryText, decisionText, isCurrentModel, useResultView } from '@/store/result-view';
import { ConfidenceBar } from '@/ui/charts';
import { Btn, Card, Kicker, Note, PhotoPlaceholder, SpeakButton } from '@/ui/primitives';
import { Screen } from '@/ui/screen';
import { colors, decisionColors, fonts, radius } from '@/ui/theme';

/**
 * The result: a decision first, the number second, and the range the number
 * sits in. Doubles as the record view when opened from history.
 */
export default function ResultScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { L, E, X, lang, say, addRecord, deleteRecord, setViewingId, updateDraft } = useApp();
  const view = useResultView();

  useEffect(() => {
    // Only the focused screen may bounce home; a stale copy lower in the stack must not.
    if (!view && navigation.isFocused()) router.replace('/');
  }, [view, navigation, router]);
  if (!view) return null;

  const { result: r } = view;
  const d = decisionText(r.decision, L);
  const dEn = decisionText(r.decision, E);
  const tone = decisionColors[r.decision];
  const isSaved = view.recordId != null;
  const sexLabel = view.sex === 'F' ? L.girl : L.boy;
  const inputsLine = `${view.ageMonths} mo · ${sexLabel} · ${view.weightKg} kg · z ${r.z >= 0 ? '+' : ''}${r.z.toFixed(2)}`;
  const stamp = `${formatWhen(view.when, lang, true)} · ${r.model}`;

  const save = () => {
    addRecord({ name: view.name.trim(), ageMonths: view.ageMonths, sex: view.sex, weightKg: view.weightKg, result: r });
    // The photo is deleted as soon as the screening is saved. The rest of the
    // draft is cleared when the next screening starts.
    discardPhoto(view.photoPath);
    updateDraft({ photoPath: null });
    router.dismissAll();
  };

  const edit = () => {
    updateDraft({ name: view.name, ageMonths: view.ageMonths, sex: view.sex, weight: String(view.weightKg), photoPath: null });
    setViewingId(null);
    router.push('/info');
  };

  const remove = () => {
    Alert.alert(`${L.delete}?`, view.name.trim() || undefined, [
      { text: L.back, style: 'cancel' },
      {
        text: L.delete,
        style: 'destructive',
        onPress: () => {
          if (view.recordId) deleteRecord(view.recordId);
          setViewingId(null);
          router.replace('/history');
        },
      },
    ]);
  };

  return (
    <Screen title={view.name.trim() || '—'} subtitle={`${view.ageMonths} ${L.months}`} contentStyle={styles.content}>
      <View style={[styles.hero, { backgroundColor: tone.bg }]}>
        <View style={styles.heroHead}>
          <View style={styles.heroIcon}>
            <Text style={styles.heroIconGlyph}>{tone.icon}</Text>
          </View>
          <Text style={styles.heroKicker}>{L.status}</Text>
        </View>
        <Text style={styles.decision}>{d.label}</Text>
        {!!dEn.label && <Text style={styles.decisionEn}>{dEn.label}</Text>}
        <View style={styles.tiles}>
          <View style={styles.tile}>
            <Text style={styles.tileKicker}>MUAC</Text>
            <View style={styles.tileValueRow}>
              <Text style={styles.tileValue}>{r.muacCm.toFixed(1)}</Text>
              <Text style={styles.tileUnit}>cm</Text>
            </View>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileKicker}>{L.category}</Text>
            <Text style={styles.tileCategory}>{categoryText(r.category, L)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.subject}>
          <PhotoPlaceholder size={52} />
          <View style={{ flex: 1 }}>
            <Text style={styles.subjectName}>{view.name.trim() || '—'}</Text>
            <Text style={styles.subjectMeta}>{inputsLine}</Text>
          </View>
        </View>

        <Card style={[styles.card, styles.plainCard]}>
          <Text style={styles.plain}>{d.plain}</Text>
          <SpeakButton size={46} onPress={() => say(`${d.label}. ${d.plain}`)} />
        </Card>

        <Card style={[styles.card, { paddingVertical: 14 }]}>
          <Kicker>{L.confidence}</Kicker>
          <View style={{ marginTop: 12 }}>
            <ConfidenceBar assessment={r} ageMonths={view.ageMonths} sex={view.sex} />
          </View>
          <Text style={styles.ciText}>
            {L.confidence}: {r.lowCm.toFixed(1)}–{r.highCm.toFixed(1)} cm
          </Text>
        </Card>

        <Text style={styles.stamp}>{stamp}</Text>

        <Pressable accessibilityRole="button" onPress={() => router.push('/explain')} style={({ pressed }) => [styles.explain, pressed && { backgroundColor: colors.surfaceHover }]}>
          <Text style={styles.explainText}>{L.explain}</Text>
          <Text style={styles.explainChevron}>›</Text>
        </Pressable>

        {!isSaved ? (
          <Btn label={L.save_home} minHeight={72} style={{ marginTop: 10 }} onPress={save} />
        ) : (
          <>
            <Note style={{ marginTop: 10 }}>{isCurrentModel(r.model) ? X.model_cur(r.model) : X.model_old(r.model)}</Note>
            <View style={styles.editRow}>
              <Btn label={L.edit} variant="outline" minHeight={62} labelStyle={{ fontSize: 15 }} style={{ flex: 1, width: undefined }} onPress={edit} />
              <Btn label={L.delete} variant="danger" minHeight={62} labelStyle={{ fontSize: 15 }} style={{ flex: 1, width: undefined }} onPress={remove} />
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {},
  hero: { paddingTop: 22, paddingHorizontal: 20, paddingBottom: 24 },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  heroIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,253,248,0.2)', borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  heroIconGlyph: { fontFamily: fonts.sansSemi, fontSize: 20, color: colors.surface, includeFontPadding: false },
  heroKicker: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.surface, opacity: 0.9 },
  decision: { marginTop: 12, fontFamily: fonts.sansSemi, fontSize: 31, lineHeight: 37, letterSpacing: -0.6, color: colors.surface },
  decisionEn: { fontFamily: fonts.serif, fontSize: 17, color: colors.surface, opacity: 0.9, marginTop: 3 },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 18 },
  tile: { flex: 1, paddingVertical: 13, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: 'rgba(255,253,248,0.16)' },
  tileKicker: { fontFamily: fonts.sansSemi, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: colors.surface, opacity: 0.85 },
  tileValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 3 },
  tileValue: { fontFamily: fonts.monoMedium, fontSize: 26, color: colors.surface, includeFontPadding: false },
  tileUnit: { fontFamily: fonts.mono, fontSize: 13, color: colors.surface, opacity: 0.85 },
  tileCategory: { fontFamily: fonts.sansSemi, fontSize: 17, lineHeight: 21, color: colors.surface, marginTop: 5 },
  body: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30 },
  subject: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  subjectName: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.ink },
  subjectMeta: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, marginTop: 3 },
  card: { marginTop: 10, borderRadius: radius.lg },
  plainCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  plain: { flex: 1, fontFamily: fonts.sans, fontSize: 16, lineHeight: 26, color: colors.ink },
  ciText: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted2, marginTop: 2 },
  stamp: { marginTop: 10, fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  explain: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 17, paddingHorizontal: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink, borderRadius: radius.lg },
  explainText: { fontFamily: fonts.sansSemi, fontSize: 16, color: colors.ink },
  explainChevron: { fontSize: 20, color: colors.muted3 },
  editRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
});
