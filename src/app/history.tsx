import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DecisionKey } from '@/pipeline/decide';
import { useApp } from '@/store/app-state';
import { RecordRow } from '@/ui/record-row';
import { Screen } from '@/ui/screen';
import { colors, fonts, radius } from '@/ui/theme';

type Filter = 'all' | DecisionKey;

/** Every screening on this phone, newest first, filterable by decision. */
export default function HistoryScreen() {
  const router = useRouter();
  const { L, X, lang, records, setViewingId } = useApp();
  const [filter, setFilter] = useState<Filter>('all');

  const rows = filter === 'all' ? records : records.filter((r) => r.result.decision === filter);
  const filters: [Filter, string][] = [
    ['all', L.f_all],
    ['refer', L.f_refer],
    ['unsure', L.f_unsure],
    ['clear', L.f_ok],
  ];

  return (
    <Screen title={L.history} subtitle="On this phone" contentStyle={styles.content}>
      <Text style={styles.h1}>{L.history}</Text>
      <Text style={styles.h1En}>
        {X.records(records.length)} · {L.offline}
      </Text>

      <View style={styles.filters}>
        {filters.map(([key, label]) => {
          const on = filter === key;
          return (
            <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setFilter(key)} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {rows.length > 0 ? (
        <View style={styles.list}>
          {rows.map((r) => (
            <RecordRow
              key={r.id}
              record={r}
              L={L}
              lang={lang}
              onPress={() => {
                setViewingId(r.id);
                router.push('/result');
              }}
            />
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{L.empty_h}</Text>
          <Text style={styles.emptyBody}>{L.empty_s}</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 18 },
  h1: { fontFamily: fonts.sansSemi, fontSize: 22, lineHeight: 29, color: colors.ink },
  h1En: { fontFamily: fonts.serif, fontSize: 16, color: colors.muted, marginTop: 2 },
  filters: { flexDirection: 'row', gap: 7, marginTop: 14, flexWrap: 'wrap' },
  chip: { minHeight: 44, paddingHorizontal: 15, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.sansSemi, fontSize: 13, color: colors.muted3 },
  chipTextOn: { color: colors.surface },
  list: { gap: 8, marginTop: 14 },
  empty: { marginTop: 16, paddingVertical: 30, paddingHorizontal: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dashed, borderRadius: radius.lg, alignItems: 'center' },
  emptyTitle: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.muted3 },
  emptyBody: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: 4, textAlign: 'center' },
});
