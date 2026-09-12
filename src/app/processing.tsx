import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { runScreening, type ProgressStage } from '@/pipeline/run';
import { useApp } from '@/store/app-state';
import { Note } from '@/ui/primitives';
import { Screen } from '@/ui/screen';
import { colors, fonts, radius } from '@/ui/theme';

/**
 * Step 3 of 3 — the measurement runs here, on the phone. The three rows are
 * the real stages of the pipeline (pose → arm → MUAC), ticked as each one
 * completes; the last one is held on screen briefly so the worker can see
 * the sequence finish rather than a flash.
 */

const STAGES: ProgressStage[] = ['pose', 'arm', 'muac'];
const MIN_STAGE_MS = 450;

export default function ProcessingScreen() {
  const router = useRouter();
  const { L, E, draft, setOutcome, setViewingId } = useApp();
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const started = useRef(false);
  // The inputs are fixed for the life of this screen; reading them through a
  // ref keeps the effect from re-arming (and cancelling itself) on re-render.
  const inputs = useRef(draft);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const { photoPath, ageMonths, sex, weight } = inputs.current;
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      if (!photoPath) {
        router.replace('/capture');
        return;
      }
      try {
        const t0 = Date.now();
        const outcome = await runScreening(photoPath, { ageMonths, sex, weightKg: parseFloat(weight) }, (stage) => {
          if (!cancelled) setDone(STAGES.indexOf(stage));
        });
        // Let the last two ticks land as ticks, not a blink.
        const elapsed = Date.now() - t0;
        if (elapsed < 2 * MIN_STAGE_MS) await sleep(2 * MIN_STAGE_MS - elapsed);
        if (cancelled) return;
        setDone(STAGES.length);
        await sleep(MIN_STAGE_MS);
        if (cancelled) return;
        setOutcome(outcome);
        setViewingId(null);
        router.replace(outcome.ok ? '/result' : '/cannot');
      } catch (e) {
        if (cancelled) return;
        setFailed(e instanceof Error ? e.message : String(e));
        setOutcome({ ok: false, reason: 'arm', detail: `exception: ${e instanceof Error ? e.message : String(e)}` });
        await sleep(1200);
        if (!cancelled) router.replace('/cannot');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, setOutcome, setViewingId]);

  const labels = [L.proc1, L.proc2, L.proc3];

  return (
    <Screen title={L.proc_h} subtitle="Step 3 of 3" canGoBack={false} contentStyle={styles.content}>
      <Text style={styles.h1}>{L.proc_h}</Text>
      {!!E.proc_h && <Text style={styles.h1En}>{E.proc_h}</Text>}
      <Text style={styles.body}>{L.proc_s}</Text>

      <View style={styles.bars}>
        {STAGES.map((s, i) => (
          <View key={s} style={[styles.bar, { backgroundColor: done > i ? colors.green : colors.sand }]} />
        ))}
      </View>

      <View style={styles.stages}>
        {labels.map((label, i) => {
          const complete = done > i;
          const active = done === i;
          return (
            <View key={label} style={[styles.stage, { borderColor: active ? colors.borderStrong : colors.border }]}>
              <View style={[styles.stageDot, { backgroundColor: complete ? colors.green : active ? colors.amberDot : colors.sandDark }]}>
                <Text style={styles.stageMark}>{complete ? '✓' : active ? '·' : ''}</Text>
              </View>
              <Text style={[styles.stageLabel, { color: done >= i ? colors.ink : colors.muted }]}>{label}</Text>
            </View>
          );
        })}
      </View>

      {failed ? <Note tone="red" style={styles.note}>{`${L.proc_err}: ${failed}`}</Note> : <Note style={styles.note}>{L.proc_note}</Note>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingTop: 30 },
  h1: { fontFamily: fonts.sansSemi, fontSize: 25, lineHeight: 33, color: colors.ink },
  h1En: { fontFamily: fonts.serif, fontSize: 17, color: colors.muted, marginTop: 2 },
  body: { marginTop: 10, fontFamily: fonts.sans, fontSize: 15, lineHeight: 23, color: colors.muted2 },
  bars: { flexDirection: 'row', gap: 7, marginTop: 22 },
  bar: { flex: 1, height: 8, borderRadius: radius.pill },
  stages: { gap: 7, marginTop: 18 },
  stage: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, paddingHorizontal: 15, backgroundColor: colors.surface, borderWidth: 1, borderRadius: radius.md },
  stageDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stageMark: { fontFamily: fonts.sansSemi, fontSize: 13, color: colors.surface, includeFontPadding: false },
  stageLabel: { flex: 1, fontFamily: fonts.sansSemi, fontSize: 15 },
  note: { marginTop: 20 },
});
