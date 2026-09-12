import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/store/app-state';
import { colors, fonts, radius } from '@/ui/theme';

/**
 * Page shell: the two-line header (local title, English beneath), the
 * settings/language pill, the green "Listen" banner while audio plays, and
 * a scrolling body on paper.
 */
export function Screen({
  title,
  subtitle,
  canGoBack = true,
  onBack,
  children,
  contentStyle,
  scroll = true,
}: {
  title: string;
  subtitle: string;
  canGoBack?: boolean;
  onBack?: () => void;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { L, speaking } = useApp();

  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {canGoBack && (
          <Pressable accessibilityRole="button" accessibilityLabel={L.back} onPress={back} style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
        )}
        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={L.settings}
          onPress={() => {
            if (pathname !== '/settings') router.push('/settings');
          }}
          style={({ pressed }) => [styles.langPill, pressed && styles.pressed]}>
          <Text style={styles.gear}>⚙</Text>
          <Text style={styles.langShort}>{L.short}</Text>
        </Pressable>
      </View>

      {speaking && <SpeakingBanner text={`${L.listen} · ${L.name}`} />}

      {scroll ? (
        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }, contentStyle]}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.body, contentStyle]}>{children}</View>
      )}
    </View>
  );
}

function SpeakingBanner({ text }: { text: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <View style={styles.banner}>
      <Animated.View style={[styles.bannerDot, { opacity }]} />
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 46,
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.page,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { fontSize: 24, lineHeight: 28, color: colors.ink, includeFontPadding: false },
  pressed: { backgroundColor: colors.tintDark },
  titles: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.ink, letterSpacing: -0.15, lineHeight: 20 },
  subtitle: { fontFamily: fonts.sans, fontSize: 11, color: colors.muted, lineHeight: 15 },
  langPill: {
    height: 46,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.tint,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gear: { fontSize: 14, color: colors.muted3 },
  langShort: { fontFamily: fonts.sansSemi, fontSize: 12, color: colors.muted3 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
    backgroundColor: colors.green,
  },
  bannerDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.surface },
  bannerText: { fontFamily: fonts.sansSemi, fontSize: 13, color: colors.surface },
  body: { flex: 1 },
  content: { flexGrow: 1 },
});
