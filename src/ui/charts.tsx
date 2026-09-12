import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg';

import type { Assessment } from '@/pipeline/decide';
import { lmsValue, MACZ_MAX_MONTHS, MACZ_MIN_MONTHS, muacCurve, muacLms, type Sex } from '@/pipeline/zscore';
import { colors, decisionColors, fonts } from '@/ui/theme';

/**
 * The two small data graphics from the design: the confidence bar under a
 * result, and the growth curve on the explain screen. Both are drawn from
 * the same reference tables the decision is made against.
 */

/** Axis for the confidence bar: reference −4 SD … +3 SD, widened to fit the band. */
export function barScale(a: Assessment, ageMonths: number, sex: Sex): { min: number; max: number } {
  const lms = muacLms(ageMonths, sex);
  let min = lms ? Math.max(6, Math.round(lmsValue(-4, lms))) : 6;
  let max = lms ? Math.round(lmsValue(3, lms)) : 34;
  min = Math.min(min, Math.floor(a.lowCm - 0.5));
  max = Math.max(max, Math.ceil(a.highCm + 0.5));
  return { min, max };
}

const pctOf = (cm: number, s: { min: number; max: number }) =>
  Math.max(0, Math.min(100, ((cm - s.min) / (s.max - s.min)) * 100));

export function ConfidenceBar({
  assessment,
  ageMonths,
  sex,
  large = false,
}: {
  assessment: Assessment;
  ageMonths: number;
  sex: Sex;
  large?: boolean;
}) {
  const s = barScale(assessment, ageMonths, sex);
  const cut = pctOf(assessment.cutCm, s);
  const lo = pctOf(assessment.lowCm, s);
  const hi = pctOf(assessment.highCm, s);
  const marker = pctOf(assessment.muacCm, s);
  const trackTop = large ? 14 : 12;
  const trackH = large ? 12 : 10;

  return (
    <View style={{ height: large ? 46 : 42 }}>
      <View style={[bar.track, { top: trackTop, height: trackH }]} />
      <View style={[bar.below, { top: trackTop, height: trackH, width: `${cut}%` }]} />
      <View style={[bar.ci, { top: trackTop - 4, height: trackH + 8, left: `${lo}%`, width: `${Math.max(0, hi - lo)}%` }]} />
      <View style={[bar.marker, { top: large ? 4 : 2, bottom: large ? 14 : 12, left: `${marker}%` }]} />
      {large && <Text style={[bar.axis, { left: 0 }]}>{s.min}</Text>}
      <Text style={[bar.cutLabel, { left: `${cut}%` }]}>{assessment.cutCm.toFixed(1)}</Text>
      {large && <Text style={[bar.axis, { right: 0 }]}>{s.max}</Text>}
    </View>
  );
}

const bar = StyleSheet.create({
  track: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.sand, borderRadius: 999 },
  below: { position: 'absolute', left: 0, backgroundColor: colors.redSoft, borderTopLeftRadius: 999, borderBottomLeftRadius: 999 },
  ci: { position: 'absolute', backgroundColor: 'rgba(42,36,32,0.2)', borderRadius: 3 },
  marker: { position: 'absolute', width: 3, marginLeft: -1.5, backgroundColor: colors.ink, borderRadius: 2 },
  cutLabel: {
    position: 'absolute',
    bottom: 0,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.redText,
    transform: [{ translateX: -12 }],
  },
  axis: { position: 'absolute', bottom: 0, fontFamily: fonts.mono, fontSize: 10, color: colors.muted },
});

/** Log-x growth chart, 3–228 months, 8–34 cm, like the design's SVG. */
export function GrowthCurve({ assessment, ageMonths, sex }: { assessment: Assessment; ageMonths: number; sex: Sex }) {
  const X = (a: number) => 8 + (Math.log(a / MACZ_MIN_MONTHS) / Math.log(MACZ_MAX_MONTHS / MACZ_MIN_MONTHS)) * 280;
  const Y = (cm: number) => 150 - ((cm - 8) / 26) * 140;
  const pt = (a: number, cm: number) => `${X(a).toFixed(1)},${Y(cm).toFixed(1)}`;

  const curve = muacCurve(sex);
  const median = curve.map((c) => pt(c.age, c.median)).join(' ');
  const low = curve.map((c) => pt(c.age, c.lo));
  const high = curve.map((c) => pt(c.age, c.hi));
  const band = [...high, ...[...low].reverse()].join(' ');

  const childX = X(Math.max(MACZ_MIN_MONTHS, Math.min(MACZ_MAX_MONTHS, ageMonths)));
  const childY = Y(Math.max(8, Math.min(34, assessment.muacCm)));
  const fill = decisionColors[assessment.decision].bg;

  return (
    <View>
      <Svg viewBox="0 0 300 170" width="100%" height={190} style={{ marginTop: 12 }}>
        <Polygon points={band} fill={colors.divider} />
        <Polyline points={median} fill="none" stroke={colors.stone} strokeWidth={2} />
        <Polyline points={low.join(' ')} fill="none" stroke={colors.redLine} strokeWidth={1.5} strokeDasharray="4 4" />
        <Line x1={childX} y1={10} x2={childX} y2={150} stroke={colors.dashed} strokeWidth={1} />
        <Circle cx={childX} cy={childY} r={6} fill={fill} stroke={colors.surface} strokeWidth={2} />
        <SvgText x={2} y={164} fontFamily={fonts.mono} fontSize={9} fill={colors.muted}>3 mo</SvgText>
        <SvgText x={252} y={164} fontFamily={fonts.mono} fontSize={9} fill={colors.muted}>228 mo</SvgText>
        <SvgText x={2} y={16} fontFamily={fonts.mono} fontSize={9} fill={colors.muted}>34 cm</SvgText>
        <SvgText x={2} y={148} fontFamily={fonts.mono} fontSize={9} fill={colors.muted}>8 cm</SvgText>
      </Svg>
      <View style={legend.row}>
        <View style={legend.item}><View style={legend.line} /><Text style={legend.label}>median</Text></View>
        <View style={legend.item}><View style={legend.band} /><Text style={legend.label}>±2 SD</Text></View>
        <View style={legend.item}><View style={[legend.dot, { backgroundColor: fill }]} /><Text style={legend.label}>this child</Text></View>
      </View>
    </View>
  );
}

const legend = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', marginTop: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  line: { width: 14, height: 2, backgroundColor: colors.stone },
  band: { width: 14, height: 10, backgroundColor: colors.divider },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted2 },
});
