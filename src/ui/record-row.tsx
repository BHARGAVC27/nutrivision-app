import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LangCode, Strings } from '@/i18n/strings';
import type { DecisionKey } from '@/pipeline/decide';
import type { ScreeningRecord } from '@/store/records';
import { PhotoPlaceholder } from '@/ui/primitives';
import { colors, decisionColors, fonts, radius } from '@/ui/theme';

/** Pill label for a decision, in the current language. */
export function badgeFor(decision: DecisionKey, L: Strings) {
  const c = decisionColors[decision];
  const tag = decision === 'refer' ? L.f_refer : decision === 'unsure' ? L.f_unsure : L.f_ok;
  return { icon: c.icon, tag, fg: c.text, bg: c.soft };
}

/** "08 Sep · 09:20" in the chosen language's locale. */
export function formatWhen(iso: string, lang: LangCode, withYear = false): string {
  const d = new Date(iso);
  const locale = lang === 'en' ? 'en-IN' : `${lang}-IN`;
  try {
    const date = d.toLocaleDateString(locale, { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${date} · ${time}`;
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

export function RecordRow({ record, L, lang, onPress }: { record: ScreeningRecord; L: Strings; lang: LangCode; onPress: () => void }) {
  const b = badgeFor(record.result.decision, L);
  const name = record.name.trim() || '—';
  const meta = `${record.ageMonths} mo · ${record.sex === 'F' ? L.girl : L.boy} · ${formatWhen(record.createdAt, lang)}`;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <PhotoPlaceholder size={46} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
      </View>
      <View style={[styles.badge, { backgroundColor: b.bg }]}>
        <Text style={[styles.badgeIcon, { color: b.fg }]}>{b.icon}</Text>
        <Text style={[styles.badgeTag, { color: b.fg }]}>{b.tag}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  rowPressed: { backgroundColor: colors.surfaceHover },
  text: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.ink },
  meta: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
  },
  badgeIcon: { fontFamily: fonts.sansSemi, fontSize: 12 },
  badgeTag: { fontFamily: fonts.sansSemi, fontSize: 12 },
});
