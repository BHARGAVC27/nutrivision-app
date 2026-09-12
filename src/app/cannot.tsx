import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import type { CannotReason } from '@/pipeline/run';
import { discardPhoto, useApp } from '@/store/app-state';
import { Btn, Card, Kicker, Note, SpeakButton } from '@/ui/primitives';
import { Screen } from '@/ui/screen';
import { colors, fonts } from '@/ui/theme';

/**
 * "Cannot assess" — the pipeline could not justify a number, so none is
 * shown. The reason and the fix are specific; the way out is either a retake
 * or a trip back to the details, never a guess.
 */
export default function CannotScreen() {
  const router = useRouter();
  const { L, E, X, say, outcome, draft, updateDraft, resetDraft } = useApp();

  const reason: CannotReason = outcome && !outcome.ok ? outcome.reason : 'arm';
  const text = {
    arm: [L.cannot_arm, L.cf_arm],
    person: [L.cannot_person, L.cf_person],
    age: [L.cannot_age, L.cf_age],
    weight: [L.cannot_weight, L.cf_weight],
  }[reason];
  const toDetails = reason === 'age' || reason === 'weight';

  const primary = () => {
    // The photo is only ever kept until it has been measured or replaced.
    discardPhoto(draft.photoPath);
    updateDraft({ photoPath: null });
    router.dismissAll();
    router.push(toDetails ? '/info' : '/capture');
  };

  const home = () => {
    resetDraft();
    router.dismissAll();
  };

  return (
    <Screen title={L.cannot} subtitle="No result" onBack={home} contentStyle={styles.content}>
      <View style={styles.icon}>
        <Text style={styles.iconGlyph}>⌀</Text>
      </View>
      <Text style={styles.h1}>{L.cannot}</Text>
      {!!E.cannot && <Text style={styles.h1En}>{E.cannot}</Text>}

      <Card style={styles.card}>
        <Kicker>{L.reason}</Kicker>
        <View style={styles.reasonRow}>
          <Text style={styles.reason}>{text[0]}</Text>
          <SpeakButton size={44} onPress={() => say(`${text[0]}. ${text[1]}`)} />
        </View>
        <View style={styles.divider}>
          <Kicker>{L.try}</Kicker>
          <Text style={styles.fix}>{text[1]}</Text>
        </View>
      </Card>

      <Note style={styles.never}>
        <Text style={styles.neverText}>{L.cannot_never}</Text>
      </Note>

      {__DEV__ && outcome && !outcome.ok && <Text style={styles.detail}>{outcome.detail}</Text>}

      <Btn label={toDetails ? L.info_h : L.retake} variant="dark" minHeight={70} style={{ marginTop: 18 }} onPress={primary} />
      <Btn label={L.home_btn} variant="outline" minHeight={58} labelStyle={{ fontSize: 16 }} style={{ marginTop: 10 }} onPress={home} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 26 },
  icon: { width: 62, height: 62, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.stone, alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { fontSize: 26, color: colors.mutedWarm },
  h1: { marginTop: 16, fontFamily: fonts.sansSemi, fontSize: 25, lineHeight: 33, color: colors.ink },
  h1En: { fontFamily: fonts.serif, fontSize: 17, color: colors.muted, marginTop: 2 },
  card: { marginTop: 18 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: 8 },
  reason: { flex: 1, fontFamily: fonts.sansSemi, fontSize: 17, lineHeight: 25, color: colors.ink },
  divider: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.divider },
  fix: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 25, color: colors.ink, marginTop: 6 },
  never: { marginTop: 12 },
  neverText: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 22, color: colors.muted3 },
  detail: { marginTop: 10, fontFamily: fonts.mono, fontSize: 11, color: colors.ghost },
});
