import { Image } from 'expo-image';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '@/store/app-state';
import { useResultView } from '@/store/result-view';
import { ConfidenceBar, GrowthCurve } from '@/ui/charts';
import { Btn, Card, Note } from '@/ui/primitives';
import { Screen } from '@/ui/screen';
import { colors, fonts, radius } from '@/ui/theme';

const PROVENANCE_HEIGHT = 200;

/**
 * "Explain this result": where the arm was read, how wide the range is, and
 * where the child sits on the growth curve. Every element is drawn from the
 * same numbers the decision used — nothing here is illustrative.
 */
export default function ExplainScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { L, E, X } = useApp();
  const view = useResultView();

  useEffect(() => {
    if (!view && navigation.isFocused()) router.replace('/');
  }, [view, navigation, router]);
  if (!view) return null;

  const { result: r } = view;

  return (
    <Screen title={L.explain} subtitle="Provenance and confidence" contentStyle={styles.content}>
      <Text style={styles.h1}>{L.explain}</Text>
      {!!E.explain && <Text style={styles.h1En}>{E.explain}</Text>}

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{L.prov}</Text>
        <Text style={styles.cardSub}>{X.prov_s}</Text>
        <Provenance photoPath={view.photoPath} photoWidth={r.photoWidth} photoHeight={r.photoHeight} points={r.points} caption={X.arm_line(r.armWidthPx, r.pointsUsed)} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{L.confidence}</Text>
        <Text style={styles.cardSub}>{X.conf_s(r.lowCm.toFixed(1), r.highCm.toFixed(1), r.cutCm.toFixed(1))}</Text>
        <View style={{ marginTop: 14 }}>
          <ConfidenceBar assessment={r} ageMonths={view.ageMonths} sex={view.sex} large />
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{L.curve}</Text>
        <Text style={styles.cardSub}>{X.curve_s}</Text>
        <GrowthCurve assessment={r} ageMonths={view.ageMonths} sex={view.sex} />
      </Card>

      <Note style={{ marginTop: 12 }}>{X.aid}</Note>

      <Btn label={L.back} variant="outline" minHeight={64} labelStyle={{ fontSize: 16 }} style={{ marginTop: 16 }} onPress={() => router.back()} />
    </Screen>
  );
}

/**
 * The photo (while it still exists) or a neutral frame, with the five arm
 * sample points on it: green were used, grey were discarded. Points are in
 * normalized photo coordinates, so the frame keeps the photo's aspect ratio
 * inside the box whether or not the pixels are still around.
 */
function Provenance({
  photoPath,
  photoWidth,
  photoHeight,
  points,
  caption,
}: {
  photoPath: string | null;
  photoWidth: number;
  photoHeight: number;
  points: { x: number; y: number; used: boolean }[];
  caption: string;
}) {
  const [boxWidth, setBoxWidth] = useState(0);
  const aspect = photoWidth > 0 && photoHeight > 0 ? photoWidth / photoHeight : 3 / 4;
  // "contain" fit of the photo frame inside the box.
  let frameW = boxWidth;
  let frameH = boxWidth / aspect;
  if (frameH > PROVENANCE_HEIGHT) {
    frameH = PROVENANCE_HEIGHT;
    frameW = PROVENANCE_HEIGHT * aspect;
  }
  const offsetX = (boxWidth - frameW) / 2;
  const offsetY = (PROVENANCE_HEIGHT - frameH) / 2;

  return (
    <View style={styles.provBox} onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}>
      {boxWidth > 0 && (
        <View style={{ position: 'absolute', left: offsetX, top: offsetY, width: frameW, height: frameH }}>
          {photoPath ? (
            <Image source={{ uri: `file://${photoPath}` }} style={StyleSheet.absoluteFill} contentFit="fill" />
          ) : (
            <View style={styles.provGhost} />
          )}
          {points.map((p, i) => (
            <View
              key={i}
              style={[
                styles.point,
                { left: p.x * frameW - 8, top: p.y * frameH - 8, backgroundColor: p.used ? colors.green : colors.ghost },
              ]}
            />
          ))}
        </View>
      )}
      <Text style={styles.provCaption}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 18 },
  h1: { fontFamily: fonts.sansSemi, fontSize: 22, lineHeight: 29, color: colors.ink },
  h1En: { fontFamily: fonts.serif, fontSize: 16, color: colors.muted, marginTop: 2 },
  card: { marginTop: 10 },
  cardTitle: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.ink },
  cardSub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.muted2, marginTop: 3 },
  provBox: { marginTop: 12, height: PROVENANCE_HEIGHT, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.stripeB },
  provGhost: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,253,248,0.4)', borderRadius: 8, margin: 16 },
  point: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.surface },
  provCaption: { position: 'absolute', left: 12, bottom: 10, fontFamily: fonts.mono, fontSize: 10, color: 'rgba(255,253,248,0.75)' },
});
