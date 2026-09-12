import { File, Paths } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { runScreening } from '@/pipeline/run';
import type { Sex } from '@/pipeline/zscore';
import { useApp } from '@/store/app-state';
import { Screen } from '@/ui/screen';
import { colors, fonts } from '@/ui/theme';

/**
 * Developer entry point: runs the whole pipeline on a photo already on the
 * device, skipping the camera, then lands on the normal result screen.
 *
 * Exists for the brief's "stop and validate against real photos with known
 * MUAC" step. Open it with a deep link, e.g.
 *
 *   adb shell am start -a android.intent.action.VIEW \
 *     -d "nutrivisonapp://dev?path=/data/user/0/com.nutrivision.app/files/frontal.jpg&age=31&sex=F&weight=9.8&name=1000"
 *
 * The outcome is also logged as one JSON line (`[dev] outcome …`) so it can
 * be read back over logcat. Not linked from any screen; only reachable by
 * URL. Only available in development builds.
 */
export default function DevScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ path?: string; age?: string; sex?: string; weight?: string; name?: string }>();
  const { updateDraft, resetDraft, setOutcome, setViewingId } = useApp();
  const [status, setStatus] = useState('starting');
  // A second deep link while this screen is open re-runs with the new params.
  const lastRun = useRef('');
  const runKey = JSON.stringify(params);

  useEffect(() => {
    if (lastRun.current === runKey) return;
    lastRun.current = runKey;
    if (!__DEV__) {
      router.replace('/');
      return;
    }
    const path = params.path ?? '';
    const ageMonths = Number(params.age ?? 24);
    const sex: Sex = params.sex === 'M' ? 'M' : 'F';
    const weightKg = Number(params.weight ?? 10);

    (async () => {
      // Work on a copy: the normal flow deletes the photo it was given once
      // the screening is saved or abandoned, and the source should survive
      // repeated runs.
      const copy = new File(Paths.cache, `dev-${params.name ?? 'photo'}-${Date.now()}.jpg`);
      new File(path.startsWith('file://') ? path : `file://${path}`).copySync(copy);
      const workPath = copy.uri.replace(/^file:\/\//, '');

      resetDraft();
      updateDraft({ photoPath: workPath, ageMonths, sex, weight: String(weightKg), name: params.name ?? 'dev' });
      setStatus(`measuring ${workPath}`);
      const t0 = Date.now();
      const outcome = await runScreening(workPath, { ageMonths, sex, weightKg }, (s) => setStatus(s));
      const ms = Date.now() - t0;
      console.log(`[dev] outcome ${JSON.stringify({ ms, name: params.name, ...outcome })}`);
      setOutcome(outcome);
      setViewingId(null);
      router.replace(outcome.ok ? '/result' : '/cannot');
    })().catch((e) => {
      console.log(`[dev] error ${(e instanceof Error ? e.message : String(e)).split('\n').join(' | ')}`);
      setStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
    });
  }, [runKey, params, router, resetDraft, updateDraft, setOutcome, setViewingId]);

  return (
    <Screen title="dev" subtitle="pipeline on a file" canGoBack={false}>
      <Text style={styles.mono}>{status}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mono: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, padding: 18 },
});
