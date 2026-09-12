/**
 * Palette and type ramp from the Claude Design source. Warm paper surfaces,
 * one green for "go", one red for "refer", one amber for "not sure".
 */

export const colors = {
  page: '#F6F1E7',
  surface: '#FFFDF8',
  surfaceHover: '#FFFBF2',
  border: '#E4DACA',
  borderStrong: '#D9CDB8',
  divider: '#EFE7D8',
  tint: '#F1E9DA',
  tintDark: '#EFE7D8',
  sand: '#E6DCC9',
  sandDark: '#DDD2BE',
  dashed: '#D3C6AE',
  disabled: '#C6BCA8',
  stone: '#B0A796',
  stoneLight: '#C6B99F',
  ink: '#2A2420',
  muted: '#6B6152',
  muted2: '#6E6355',
  muted3: '#5C5245',
  mutedWarm: '#6A5C48',
  ghost: '#9A8F7D',

  green: '#1E6B4C',
  greenDark: '#14513A',
  greenPressed: '#185A40',
  greenText: '#1E5340',
  greenBg: '#E7F0EA',
  greenBright: '#6FD3A6',

  red: '#A8352A',
  redText: '#8E2C22',
  redBg: '#F8E9E6',
  redBorder: '#E3BEB8',
  redSoft: '#E3C7BF',
  redLine: '#D9BDB5',

  amber: '#B9761B',
  amberText: '#7A5210',
  amberBg: '#FBF0DC',
  amberDot: '#8A5610',

  stripeA: '#4A463F',
  stripeB: '#3B3833',
  cameraA: '#33302B',
  cameraB: '#2B2925',
} as const;

/** Each weight is its own family in React Native. */
export const fonts = {
  sans: 'WorkSans_400Regular',
  sansMedium: 'WorkSans_500Medium',
  sansSemi: 'WorkSans_600SemiBold',
  serif: 'SourceSerif4_400Regular',
  serifSemi: 'SourceSerif4_600SemiBold',
  serifBold: 'SourceSerif4_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

export const radius = { sm: 10, md: 12, lg: 14, xl: 16, pill: 999 } as const;

/** Decision colours, keyed the way the pipeline keys them. */
export const decisionColors = {
  refer: { bg: colors.red, text: colors.redText, soft: colors.redBg, icon: '!' },
  clear: { bg: colors.green, text: colors.greenText, soft: colors.greenBg, icon: '✓' },
  unsure: { bg: colors.amber, text: colors.amberText, soft: colors.amberBg, icon: '?' },
} as const;
