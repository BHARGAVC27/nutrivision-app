import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useApp } from '@/store/app-state';
import { brand } from '@/ui/brand';
import { RecordRow } from '@/ui/record-row';
import { Screen } from '@/ui/screen';
import { colors, fonts, radius } from '@/ui/theme';

/** Home: start a screening, today's counts, the last three records. */
export default function HomeScreen() {
  const router = useRouter();
  const { L, E, lang, records, resetDraft, setViewingId } = useApp();

  const todayKey = new Date().toDateString();
  const countToday = records.filter((r) => new Date(r.createdAt).toDateString() === todayKey).length;
  const countRefer = records.filter((r) => r.result.decision === 'refer').length;
  const countUnsure = records.filter((r) => r.result.decision === 'unsure').length;
  const recent = records.slice(0, 3);

  const startNew = () => {
    resetDraft();
    setViewingId(null);
    router.push('/info');
  };

  return (
    <Screen title={brand.name} subtitle={brand.tagline} canGoBack={false} contentStyle={styles.content}>
      <View style={styles.brandRow}>
        <View style={styles.mark}>
          <Text style={styles.markGlyph}>{brand.mark}</Text>
        </View>
        <View>
          <Text style={styles.brandName}>{brand.name}</Text>
          <Text style={styles.brandSub}>{brand.tagline} · v{brand.version}</Text>
        </View>
      </View>

      <View style={styles.offline}>
        <View style={styles.offlineDot} />
        <Text style={styles.offlineText}>{L.offline}</Text>
      </View>

      <Text style={styles.h1}>{L.home_h}</Text>
      {!!E.home_h && <Text style={styles.h1En}>{E.home_h}</Text>}

      <Pressable accessibilityRole="button" onPress={startNew} style={({ pressed }) => [styles.start, pressed && styles.startPressed]}>
        <View style={styles.startIcon}>
          <Text style={styles.startIconGlyph}>＋</Text>
        </View>
        <View style={styles.startText}>
          <Text style={styles.startLabel}>{L.start}</Text>
          {!!E.start && <Text style={styles.startSub}>{E.start}</Text>}
        </View>
        <Text style={styles.startArrow}>→</Text>
      </Pressable>

      <View style={styles.stats}>
        <Stat value={countToday} label={L.today} />
        <Stat value={countRefer} label={L.referred} color={colors.red} />
        <Stat value={countUnsure} label={L.tape} color={colors.amber} />
      </View>

      <View style={styles.recentHead}>
        <Text style={styles.recentTitle}>{L.recent}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/history')} hitSlop={8} style={styles.seeAll}>
          <Text style={styles.seeAllText}>{L.all} ›</Text>
        </Pressable>
      </View>

      {recent.length > 0 ? (
        <View style={styles.list}>
          {recent.map((r) => (
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

function Stat({ value, label, color = colors.ink }: { value: number; label: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  markGlyph: { fontFamily: fonts.serifBold, fontSize: 22, color: colors.surface, includeFontPadding: false },
  brandName: { fontFamily: fonts.serifSemi, fontSize: 21, color: colors.ink, letterSpacing: -0.2 },
  brandSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.tint,
    alignSelf: 'flex-start',
  },
  offlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  offlineText: { fontFamily: fonts.sansSemi, fontSize: 13, color: colors.muted3 },
  h1: { marginTop: 18, fontFamily: fonts.sansSemi, fontSize: 27, lineHeight: 35, letterSpacing: -0.5, color: colors.ink },
  h1En: { fontFamily: fonts.serif, fontSize: 17, color: colors.muted, marginTop: 2 },
  start: {
    marginTop: 18,
    minHeight: 88,
    borderRadius: radius.xl,
    backgroundColor: colors.green,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: colors.greenDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  startPressed: { backgroundColor: colors.greenPressed },
  startIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: 'rgba(255,253,248,0.16)', alignItems: 'center', justifyContent: 'center' },
  startIconGlyph: { fontSize: 24, color: colors.surface, includeFontPadding: false },
  startText: { flex: 1 },
  startLabel: { fontFamily: fonts.sansSemi, fontSize: 20, lineHeight: 26, color: colors.surface },
  startSub: { fontFamily: fonts.sans, fontSize: 13, color: colors.surface, opacity: 0.85, marginTop: 2 },
  startArrow: { fontSize: 24, color: colors.surface },
  stats: { flexDirection: 'row', gap: 9, marginTop: 20 },
  stat: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 13 },
  statValue: { fontFamily: fonts.serifSemi, fontSize: 28, lineHeight: 30, includeFontPadding: false },
  statLabel: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted2, marginTop: 5 },
  recentHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 24, marginBottom: 10, gap: 12 },
  recentTitle: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.muted3 },
  seeAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, marginRight: -12 },
  seeAllText: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.green },
  list: { gap: 8 },
  empty: { paddingVertical: 26, paddingHorizontal: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dashed, borderRadius: radius.lg, alignItems: 'center' },
  emptyTitle: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.muted3 },
  emptyBody: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: 4, textAlign: 'center' },
});
