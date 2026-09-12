import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { colors, fonts, radius } from './theme';

/**
 * The handful of building blocks every screen in the design is made of:
 * cards on paper, big tap targets, a small uppercase kicker, a speak button.
 * Sizes follow the design to the pixel where it specified them (≥44px touch
 * targets throughout — the workers use this outdoors, one-handed).
 */

export function Card({ children, style, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; tint?: boolean }) {
  return <View style={[styles.card, tint && styles.cardTint, style]}>{children}</View>;
}

/** Small uppercase section label. */
export function Kicker({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.kicker, style]}>{children}</Text>;
}

type Variant = 'primary' | 'dark' | 'outline' | 'danger' | 'ghost';

export function Btn({
  label,
  variant = 'primary',
  disabled,
  style,
  labelStyle,
  icon,
  minHeight = 62,
  ...rest
}: PressableProps & {
  label: string;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  icon?: ReactNode;
  minHeight?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { minHeight },
        variantStyles[variant],
        disabled && variant === 'primary' && styles.btnDisabled,
        pressed && !disabled && styles.btnPressed,
        style,
      ]}
      {...rest}>
      {icon}
      <Text style={[styles.btnLabel, variantLabel[variant], labelStyle]}>{label}</Text>
    </Pressable>
  );
}

/** The ◉ "read aloud" button that sits beside headings and results. */
export function SpeakButton({ onPress, size = 52, tone = 'green' }: { onPress: () => void; size?: number; tone?: 'green' | 'red' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Listen"
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.speak,
        { width: size, height: size, borderRadius: size >= 48 ? radius.lg : 11 },
        tone === 'red' && styles.speakRed,
        pressed && styles.speakPressed,
      ]}>
      <Text style={[styles.speakGlyph, { fontSize: Math.round(size * 0.38), color: tone === 'red' ? colors.redText : colors.green }]}>◉</Text>
    </Pressable>
  );
}

/** Tinted note block (the soft beige callouts throughout the design). */
export function Note({ children, style, tone = 'tint' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'tint' | 'green' | 'red' | 'amber' }) {
  return <View style={[styles.note, noteTone[tone], style]}>{typeof children === 'string' ? <Text style={[styles.noteText, noteText[tone]]}>{children}</Text> : children}</View>;
}

/** Striped dark placeholder standing in for a photo that no longer exists. */
export function PhotoPlaceholder({ size = 46, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.placeholder, { width: size, height: size }, style]}>
      <View style={{ position: 'absolute', left: -size, top: -size, width: size * 3, height: size * 3, transform: [{ rotate: '45deg' }] }}>
        {Array.from({ length: Math.ceil((size * 3) / 5) }).map((_, i) => (
          <View key={i} style={[styles.stripe, i % 2 ? styles.stripeB : styles.stripeA]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: 16,
  },
  cardTint: {
    backgroundColor: colors.tint,
    borderColor: colors.tint,
  },
  kicker: {
    fontFamily: fonts.sansSemi,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  btn: {
    width: '100%',
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  btnLabel: {
    fontFamily: fonts.sansSemi,
    fontSize: 17,
    textAlign: 'center',
  },
  btnDisabled: { backgroundColor: colors.disabled },
  btnPressed: { opacity: 0.85 },
  speak: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakRed: { borderColor: colors.redBorder },
  speakPressed: { backgroundColor: colors.tint },
  speakGlyph: { includeFontPadding: false },
  note: {
    padding: 15,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
  },
  noteText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 20,
  },
  placeholder: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.stripeB,
  },
  stripe: { height: 5, width: '100%' },
  stripeA: { backgroundColor: colors.stripeA },
  stripeB: { backgroundColor: colors.stripeB },
});

const variantStyles: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.green },
  dark: { backgroundColor: colors.ink },
  outline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink },
  danger: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.red },
  ghost: { backgroundColor: 'transparent' },
};

const variantLabel: Record<Variant, TextStyle> = {
  primary: { color: colors.surface },
  dark: { color: colors.surface },
  outline: { color: colors.ink },
  danger: { color: colors.red },
  ghost: { color: colors.green },
};

const noteTone: Record<'tint' | 'green' | 'red' | 'amber', ViewStyle> = {
  tint: { backgroundColor: colors.tint },
  green: { backgroundColor: colors.greenBg },
  red: { backgroundColor: colors.redBg },
  amber: { backgroundColor: colors.amberBg },
};

const noteText: Record<'tint' | 'green' | 'red' | 'amber', TextStyle> = {
  tint: { color: colors.mutedWarm },
  green: { color: colors.greenText },
  red: { color: colors.redText },
  amber: { color: colors.amberText },
};
