import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { LANG_ORDER, STR } from '@/i18n/strings';
import { CALIBRATION } from '@/pipeline/calibration';
import { useApp } from '@/store/app-state';
import { exportCsv, registerSizeKb } from '@/store/records';
import { brand } from '@/ui/brand';
import { Btn, Card, Kicker, Note } from '@/ui/primitives';
import { Screen } from '@/ui/screen';
import { colors, fonts, radius } from '@/ui/theme';

/** Storage bar: the register is tiny, so the bar is relative to a generous cap. */
const STORAGE_CAP_KB = 7 * 1024;

export default function SettingsScreen() {
  const router = useRouter();
  const { L, X, lang, setLang, audio, setAudio, records, clearRecords, resetDraft } = useApp();
  const [dataNote, setDataNote] = useState<string | null>(null);
  const sizeKb = registerSizeKb();

  const exportData = async () => {
    try {
      const file = exportCsv(records);
      setDataNote(X.exported(file.name));
      // Cable or Bluetooth: the share sheet is how the CSV leaves the phone.
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: file.name });
      }
    } catch (e) {
      setDataNote(e instanceof Error ? e.message : String(e));
    }
  };

  const clearData = () => {
    Alert.alert(`${L.clear}?`, X.records(records.length), [
      { text: L.back, style: 'cancel' },
      {
        text: L.clear,
        style: 'destructive',
        onPress: () => {
          clearRecords();
          setDataNote(X.cleared);
        },
      },
    ]);
  };

  return (
    <Screen title={L.settings} subtitle="Language, data, about" contentStyle={styles.content}>
      <Text style={styles.h1}>{L.settings}</Text>

      <Kicker style={styles.kicker}>{L.language}</Kicker>
      <View style={styles.langs}>
        {LANG_ORDER.map((k) => {
          const on = lang === k;
          return (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setLang(k)}
              style={[styles.lang, on && styles.langOn]}>
              <View style={[styles.radio, on && styles.radioOn]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.langNative}>{STR[k].name}</Text>
                <Text style={styles.langEnglish}>{STR[k].en}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: audio }} onPress={() => setAudio(!audio)} style={styles.audio}>
        <View style={[styles.checkbox, audio && styles.checkboxOn]}>
          <Text style={styles.checkboxMark}>{audio ? '✓' : ''}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.audioTitle}>{L.audio}</Text>
          <Text style={styles.audioBody}>{X.audio_s}</Text>
        </View>
      </Pressable>

      <Kicker style={styles.kicker}>{L.units}</Kicker>
      <View style={styles.units}>
        <View style={{ flex: 1 }}>
          <Text style={styles.unitsTitle}>{X.units_h}</Text>
          <Text style={styles.unitsBody}>{X.units_s}</Text>
        </View>
        <Text style={styles.locked}>{X.locked}</Text>
      </View>

      <Kicker style={styles.kicker}>{L.data}</Kicker>
      <Card style={styles.dataCard}>
        <Text style={styles.storageLine}>{X.storage(records.length, sizeKb)}</Text>
        <View style={styles.storageTrack}>
          <View style={[styles.storageFill, { width: `${Math.max(2, Math.min(100, (sizeKb / STORAGE_CAP_KB) * 100))}%` }]} />
        </View>
        <View style={styles.dataButtons}>
          <Btn label={L.export} variant="outline" minHeight={56} labelStyle={{ fontSize: 14 }} style={{ flex: 1, width: undefined, borderRadius: radius.lg }} onPress={exportData} />
          <Btn label={L.clear} variant="danger" minHeight={56} labelStyle={{ fontSize: 14 }} style={{ flex: 1, width: undefined, borderRadius: radius.lg }} onPress={clearData} disabled={records.length === 0} />
        </View>
        {dataNote && (
          <Note tone="green" style={{ marginTop: 12, padding: 13, paddingHorizontal: 14, borderRadius: radius.md }}>
            {dataNote}
          </Note>
        )}
      </Card>

      <Kicker style={styles.kicker}>{L.about}</Kicker>
      <Card style={styles.dataCard}>
        <Text style={styles.aboutMono}>
          app v{brand.version}
          {'\n'}model {CALIBRATION.model} · {CALIBRATION.segmenter} · {CALIBRATION.frames} frame
          {'\n'}mean absolute error {CALIBRATION.maeCm.toFixed(4)} cm (this configuration, 20-seed CV)
          {'\n'}pose + segmentation run on device
        </Text>
        <Text style={styles.aboutBody}>{X.about_s}</Text>
        <Text style={styles.disclaimer}>{L.disclaimer}</Text>
      </Card>

      <Btn
        label={L.home_btn}
        variant="dark"
        minHeight={62}
        labelStyle={{ fontSize: 16 }}
        style={{ marginTop: 18 }}
        onPress={() => {
          resetDraft();
          router.dismissAll();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 18 },
  h1: { fontFamily: fonts.sansSemi, fontSize: 22, color: colors.ink },
  kicker: { marginTop: 20 },
  langs: { gap: 7, marginTop: 9 },
  lang: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  langOn: { backgroundColor: colors.greenBg, borderColor: colors.green },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.stoneLight, backgroundColor: 'transparent' },
  radioOn: { borderColor: colors.green, backgroundColor: colors.green },
  langNative: { fontFamily: fonts.sansSemi, fontSize: 17, color: colors.ink },
  langEnglish: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  audio: { marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 13, padding: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  checkbox: { width: 26, height: 26, borderWidth: 2, borderColor: colors.ink, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.ink },
  checkboxMark: { fontFamily: fonts.sansSemi, fontSize: 16, color: colors.surface, includeFontPadding: false },
  audioTitle: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.ink },
  audioBody: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.muted2, marginTop: 2 },
  units: { marginTop: 9, padding: 16, backgroundColor: colors.tint, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: 12 },
  unitsTitle: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.muted3 },
  unitsBody: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.mutedWarm, marginTop: 2 },
  locked: { fontFamily: fonts.sansSemi, fontSize: 12, color: colors.mutedWarm, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: colors.sand, borderRadius: radius.pill, overflow: 'hidden' },
  dataCard: { marginTop: 9, borderRadius: radius.lg },
  storageLine: { fontFamily: fonts.mono, fontSize: 13, color: colors.muted3 },
  storageTrack: { height: 8, backgroundColor: colors.sand, borderRadius: radius.pill, marginTop: 10, overflow: 'hidden' },
  storageFill: { height: '100%', backgroundColor: colors.green, borderRadius: radius.pill },
  dataButtons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  aboutMono: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 23, color: colors.muted2 },
  aboutBody: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 21, color: colors.muted3, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  disclaimer: { fontFamily: fonts.sansSemi, fontSize: 14, lineHeight: 22, color: colors.redText, marginTop: 12 },
});
