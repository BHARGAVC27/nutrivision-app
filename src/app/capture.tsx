import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Camera, useCameraDevice, useCameraPermission, useFrameOutput, usePhotoOutput } from 'react-native-vision-camera';
import { runOnJS } from 'react-native-worklets';

import NutriVisionVision from '@modules/nutrivision-vision';
import type { Strings } from '@/i18n/strings';
import { decide, unflattenLandmarks, type CheckCode, type CheckResult, type Landmark, type QualityDecision } from '@/quality/gate';
import { downsampleLuma, measureLuma } from '@/quality/luma';
import { discardPhoto, useApp } from '@/store/app-state';
import { Btn, Note, SpeakButton } from '@/ui/primitives';
import { Screen } from '@/ui/screen';
import { colors, fonts, radius } from '@/ui/theme';

/**
 * Step 2 of 3 — the photo, behind the Stage 1 quality gate.
 *
 * Three checks (blur, brightness, framing) run continuously on the preview so
 * the health worker can see why a shot isn't usable *before* pressing the
 * shutter. On capture they run again on the full still, which is the
 * authoritative pass; only an all-pass still can be used.
 */

/** ~3.5 fps: responsive feedback without heating the device. */
const SAMPLE_INTERVAL_MS = 285;

/** Pose input is downsampled to this long edge; the model works at 256px. */
const POSE_INPUT_LONG_EDGE = 256;

const PREVIEW_HEIGHT = 360;

/** Localized value/fix for each check outcome. */
function wording(code: CheckCode, L: Strings): { value: string; fix: string } {
  switch (code) {
    case 'ok':
      return { value: '', fix: '' };
    case 'blur':
      return { value: L.v_blur, fix: L.fix_blur };
    case 'dark':
      return { value: L.v_dark, fix: L.fix_dark };
    case 'bright':
      return { value: L.v_bright, fix: L.fix_bright };
    case 'noperson':
      return { value: L.v_noperson, fix: L.fix_noperson };
    case 'edge':
      return { value: L.v_back, fix: L.fix_back };
    case 'small':
      return { value: L.v_close, fix: L.fix_close };
    case 'visibility':
      return { value: L.v_noface, fix: L.fix_noface };
  }
}

function okValue(name: CheckResult['name'], L: Strings): string {
  return name === 'blur' ? L.v_sharp : name === 'brightness' ? L.v_light_ok : L.v_framed;
}

function checkLabel(name: CheckResult['name'], L: Strings): string {
  return name === 'blur' ? L.chk_sharp : name === 'brightness' ? L.chk_light : L.chk_frame;
}

export default function CaptureScreen() {
  const router = useRouter();
  const { L, E, X, say, updateDraft, setCameraGranted } = useApp();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  const [blurScore, setBlurScore] = useState(0);
  const [brightness, setBrightness] = useState(0);
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  /** The accepted-or-rejected still, once one has been taken. */
  const [still, setStill] = useState<{ path: string; decision: QualityDecision } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastSampleAt = useSharedValue(0);
  // The still is a temp file; if this screen unmounts without it being
  // accepted (back button), it must not linger.
  const stillRef = useRef<string | null>(null);
  const acceptedRef = useRef(false);
  useEffect(() => {
    stillRef.current = still?.path ?? null;
  }, [still]);
  useEffect(
    () => () => {
      if (!acceptedRef.current) discardPhoto(stillRef.current);
    },
    []
  );
  // Pose inference is async and slower than the sample rate; skip a tick rather
  // than queueing work we'd only throw away.
  const poseBusy = useRef(false);

  useEffect(() => {
    if (hasPermission) setCameraGranted(true);
  }, [hasPermission, setCameraGranted]);

  const onFrameMeasured = useCallback((measuredBlur: number, measuredBrightness: number, gray: Uint8Array, w: number, h: number) => {
    setBlurScore(measuredBlur);
    setBrightness(measuredBrightness);
    if (poseBusy.current) return;
    poseBusy.current = true;
    NutriVisionVision.detectPoseInGrayImage(gray, w, h)
      .then((flat) => setLandmarks(unflattenLandmarks(flat)))
      .catch(() => setLandmarks([]))
      .finally(() => {
        poseBusy.current = false;
      });
  }, []);

  const frameOutput = useFrameOutput({
    // YUV gives CPU access to pixels at the lowest bandwidth, and its Y plane
    // *is* the grayscale image both pixel checks need.
    pixelFormat: 'yuv',
    enablePreviewSizedOutputBuffers: true,
    // Upright buffers, so landmark coordinates match what the user sees.
    enablePhysicalBufferRotation: true,
    onFrame(frame) {
      'worklet';
      try {
        const now = Date.now();
        if (now - lastSampleAt.value < SAMPLE_INTERVAL_MS) return;
        lastSampleAt.value = now;

        const planes = frame.getPlanes();
        if (planes.length === 0) return;
        const yPlane = planes[0];
        const luma = new Uint8Array(yPlane.getPixelBuffer());
        const { width, height, bytesPerRow } = yPlane;

        const measurement = measureLuma(luma, width, height, bytesPerRow);
        const small = downsampleLuma(luma, width, height, bytesPerRow, POSE_INPUT_LONG_EDGE);
        runOnJS(onFrameMeasured)(measurement.blurScore, measurement.brightness, small.data, small.width, small.height);
      } finally {
        // Mandatory: without this the camera pipeline stalls on buffer exhaustion.
        frame.dispose();
      }
    },
  });

  const photoOutput = usePhotoOutput({
    // A screening still, not a hero shot. Keeping it modest bounds the decode
    // and keeps the still's blur score nearer the preview's.
    targetResolution: { width: 1920, height: 1440 },
    qualityPrioritization: 'quality',
  });

  const liveDecision = useMemo(() => decide(blurScore, brightness, landmarks), [blurScore, brightness, landmarks]);
  const shown = still ? still.decision : liveDecision;
  const ready = liveDecision.accepted;

  const onShoot = useCallback(async () => {
    if (!ready || isCapturing) return;
    setIsCapturing(true);
    setError(null);
    try {
      const photo = await photoOutput.capturePhoto({}, {});
      try {
        const path = await photo.saveToTemporaryFileAsync();
        const analysis = await NutriVisionVision.analyzePhoto(path);
        const decision = decide(analysis.blurScore, analysis.brightness, unflattenLandmarks(analysis.landmarks));
        setStill({ path, decision });
      } finally {
        photo.dispose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Capture failed');
    } finally {
      setIsCapturing(false);
    }
  }, [ready, isCapturing, photoOutput]);

  const retake = useCallback(() => {
    discardPhoto(still?.path);
    setStill(null);
    setError(null);
  }, [still]);

  const acceptPhoto = useCallback(() => {
    if (!still || !still.decision.accepted) return;
    acceptedRef.current = true;
    updateDraft({ photoPath: still.path });
    router.push('/processing');
  }, [still, updateDraft, router]);

  if (!hasPermission) {
    return (
      <Screen title={L.perm_h} subtitle="Camera" contentStyle={styles.permContent}>
        <View style={styles.permIcon}>
          <Text style={styles.permIconGlyph}>◎</Text>
        </View>
        <Text style={styles.permTitle}>{L.perm_h}</Text>
        <Text style={styles.permBody}>{L.perm_s}</Text>
        <Note style={{ marginTop: 16 }}>{X.perm_note}</Note>
        <Btn label={L.perm_cta} minHeight={70} labelStyle={{ fontSize: 18 }} style={{ marginTop: 20 }} onPress={requestPermission} />
        <Btn label={L.back} variant="outline" minHeight={60} labelStyle={{ fontSize: 16 }} style={{ marginTop: 10 }} onPress={() => router.back()} />
      </Screen>
    );
  }

  const firstFailure = shown.failures[0];
  const hint = ready ? L.cap_h : firstFailure ? wording(firstFailure.code, L).fix : L.cap_h;
  const stillFailed = !!still && !still.decision.accepted;
  const stillWords = stillFailed && still ? wording(still.decision.failures[0].code, L) : null;

  return (
    <Screen title={L.btn_photo} subtitle="Step 2 of 3" contentStyle={styles.content}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>{L.cap_h}</Text>
          {!!E.cap_h && <Text style={styles.h1En}>{E.cap_h}</Text>}
        </View>
        <SpeakButton size={48} onPress={() => say(`${L.cap_h}. ${ready ? L.ready_yes : hint}`)} />
      </View>

      <View style={styles.preview}>
        {device == null ? (
          <View style={styles.noCamera}>
            <Text style={styles.noCameraText}>No camera available</Text>
          </View>
        ) : still ? (
          <Image source={{ uri: `file://${still.path}` }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Camera style={StyleSheet.absoluteFill} device={device} outputs={[frameOutput, photoOutput]} isActive />
        )}

        <Guide ready={ready && !still} />
        {!still && <ScanLine />}
        {still && (
          <View style={styles.stillChip}>
            <Text style={styles.stillChipText}>{L.still}</Text>
          </View>
        )}
      </View>

      <View style={styles.checks}>
        {shown.checks.map((c) => {
          const value = c.passed ? okValue(c.name, L) : wording(c.code, L).value;
          return (
            <View key={c.name} style={[styles.check, !c.passed && styles.checkBad]}>
              <View style={[styles.checkDot, { backgroundColor: c.passed ? colors.green : colors.red }]}>
                <Text style={styles.checkDotText}>{c.passed ? '✓' : '!'}</Text>
              </View>
              <Text style={styles.checkLabel}>{checkLabel(c.name, L)}</Text>
              <Text style={[styles.checkValue, { color: c.passed ? colors.green : colors.red }]}>{value}</Text>
            </View>
          );
        })}
      </View>

      {error && (
        <Note tone="red" style={{ marginTop: 12 }}>
          {error}
        </Note>
      )}

      {!still ? (
        <View style={styles.shutterRow}>
          <View style={styles.shutterWrap}>
            {ready && <PulseRing />}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={L.btn_photo}
              onPress={onShoot}
              disabled={!ready || isCapturing || device == null}
              style={({ pressed }) => [styles.shutter, { backgroundColor: ready ? colors.red : colors.stone }, pressed && ready && { opacity: 0.8 }]}>
              {isCapturing && <ActivityIndicator color={colors.surface} />}
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.readyLabel, { color: ready ? colors.greenText : colors.redText }]}>{ready ? L.ready_yes : L.ready_no}</Text>
            <Text style={styles.readyHint}>{hint}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.afterRow}>
          {stillWords && (
            <View style={styles.stillFail}>
              <Text style={styles.stillFailIcon}>!</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.stillFailTitle}>{stillWords.value}</Text>
                <Text style={styles.stillFailBody}>{stillWords.fix}</Text>
              </View>
              <SpeakButton size={40} tone="red" onPress={() => say(`${stillWords.value}. ${stillWords.fix}`)} />
            </View>
          )}
          <View style={styles.actions}>
            <Btn label={L.retake} variant="outline" minHeight={66} labelStyle={{ fontSize: 15 }} style={styles.retake} onPress={retake} />
            <Btn label={L.use} minHeight={66} labelStyle={{ fontSize: 16 }} style={{ flex: 1 }} disabled={stillFailed} onPress={acceptPhoto} />
          </View>
        </View>
      )}
    </Screen>
  );
}

/** The standing-child silhouette guide drawn over the preview. */
function Guide({ ready }: { ready: boolean }) {
  const armBorder = ready ? colors.greenBright : 'rgba(255,253,248,0.45)';
  const armFill = ready ? 'rgba(111,211,166,0.16)' : 'transparent';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Text style={styles.guideCaption}>[ camera preview ] child standing, facing the lens</Text>
      <View style={styles.guideHead} />
      <View style={styles.guideBody} />
      <View style={[styles.guideArm, { left: '50%', marginLeft: -95, borderColor: armBorder, backgroundColor: armFill }]} />
      <View style={[styles.guideArm, { left: '50%', marginLeft: 60, borderColor: armBorder, backgroundColor: armFill }]} />
      <View style={styles.guideFeet} />
      <Text style={styles.guideFeetLabel}>FEET ON THIS LINE</Text>
    </View>
  );
}

function ScanLine() {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(y, { toValue: PREVIEW_HEIGHT, duration: 1800, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [y]);
  return <Animated.View pointerEvents="none" style={[styles.scan, { transform: [{ translateY: y }] }]} />;
}

function PulseRing() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pulse,
        { opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }), transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 26 },
  headRow: { paddingTop: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  h1: { fontFamily: fonts.sansSemi, fontSize: 19, lineHeight: 26, color: colors.ink },
  h1En: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginTop: 2 },
  preview: { marginTop: 12, marginHorizontal: 18, height: PREVIEW_HEIGHT, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.cameraA },
  noCamera: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noCameraText: { fontFamily: fonts.mono, fontSize: 12, color: colors.ghost },
  guideCaption: { position: 'absolute', top: 8, left: 0, right: 0, textAlign: 'center', fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.8, color: colors.ghost },
  guideHead: { position: 'absolute', left: '50%', top: 28, width: 58, height: 58, marginLeft: -29, borderWidth: 2, borderColor: 'rgba(255,253,248,0.7)', borderRadius: 29 },
  guideBody: { position: 'absolute', left: '50%', top: 90, width: 126, height: 216, marginLeft: -63, borderWidth: 2, borderColor: 'rgba(255,253,248,0.7)', borderRadius: 10 },
  guideArm: { position: 'absolute', top: 108, width: 34, height: 60, borderWidth: 2, borderRadius: 8 },
  guideFeet: { position: 'absolute', left: 0, right: 0, bottom: 22, height: 2, backgroundColor: 'rgba(255,253,248,0.5)' },
  guideFeetLabel: { position: 'absolute', left: 16, bottom: 29, fontFamily: fonts.sansSemi, fontSize: 10, letterSpacing: 0.6, color: 'rgba(255,253,248,0.75)' },
  scan: { position: 'absolute', left: 0, right: 0, top: 0, height: 2, backgroundColor: colors.greenBright },
  stillChip: { position: 'absolute', top: 12, left: 14, paddingVertical: 6, paddingHorizontal: 11, backgroundColor: colors.surface, borderRadius: radius.pill },
  stillChipText: { fontFamily: fonts.sansSemi, fontSize: 11, letterSpacing: 0.7, color: colors.ink },
  checks: { marginTop: 12, marginHorizontal: 18, gap: 7 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  checkBad: { backgroundColor: colors.redBg, borderColor: colors.redBorder },
  checkDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  checkDotText: { fontFamily: fonts.sansSemi, fontSize: 13, color: colors.surface, includeFontPadding: false },
  checkLabel: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: colors.muted3 },
  checkValue: { fontFamily: fonts.sansSemi, fontSize: 14 },
  shutterRow: { paddingTop: 15, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 16 },
  shutterWrap: { width: 80, height: 80 },
  pulse: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 40, backgroundColor: colors.green },
  shutter: { position: 'absolute', top: 0, left: 0, width: 80, height: 80, borderRadius: 40, borderWidth: 5, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center', shadowColor: colors.border, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 1 },
  readyLabel: { fontFamily: fonts.sansSemi, fontSize: 15 },
  readyHint: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.muted2, marginTop: 3 },
  afterRow: { paddingTop: 15, paddingHorizontal: 18 },
  stillFail: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 15, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: colors.redBg, marginBottom: 12 },
  stillFailIcon: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.redText },
  stillFailTitle: { fontFamily: fonts.sansSemi, fontSize: 15, lineHeight: 21, color: colors.redText },
  stillFailBody: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.redText, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 10 },
  retake: { flexBasis: '38%', flexGrow: 0, width: undefined },
  permContent: { paddingHorizontal: 20, paddingTop: 30 },
  permIcon: { width: 64, height: 64, borderRadius: 18, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  permIconGlyph: { fontSize: 30, color: colors.mutedWarm },
  permTitle: { marginTop: 18, fontFamily: fonts.sansSemi, fontSize: 24, lineHeight: 31, color: colors.ink },
  permBody: { marginTop: 8, fontFamily: fonts.sans, fontSize: 15, lineHeight: 24, color: colors.muted2 },
});
