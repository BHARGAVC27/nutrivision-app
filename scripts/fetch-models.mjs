#!/usr/bin/env node
/**
 * Downloads the on-device models NutriVision needs into `native-assets/`.
 *
 * They are kept out of git (see .gitignore) because they are large binaries
 * fetched from a stable public URL. The Expo config plugin
 * `plugins/with-nutrivision-assets.js` copies whatever is here into the native
 * Android asset directory during `expo prebuild`.
 */

import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(projectRoot, 'native-assets');

const MODELS = [
  {
    // Pose Landmarker (lite) — 33 landmarks. Used by the Stage 1 live framing
    // check on the preview feed, where speed matters more than precision.
    name: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
    minBytes: 1_000_000,
  },
  {
    // Pose Landmarker (full) — the Stage 2 measurement runs on this one. The
    // desktop features were extracted with the legacy `mp.solutions.pose`
    // solution at model_complexity=1, which is the "full" model; using the
    // same size keeps the shoulder/elbow landmarks the arm profile is built
    // on as close as possible to what the calibration was fitted against.
    name: 'pose_landmarker_full.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
    minBytes: 3_000_000,
  },
  {
    // Selfie Segmenter (general, 256x256) — the person mask every ratio
    // feature is normalised against. This is the `mp-selfie` segmenter the
    // shipped calibration was fitted on (docs/ANDROID_APP_BRIEF.md §3); the
    // landscape variant is a different model and must not be substituted.
    name: 'selfie_segmenter.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
    minBytes: 100_000,
  },
];

async function alreadyPresent(dest, minBytes) {
  try {
    return (await stat(dest)).size >= minBytes;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });

  for (const model of MODELS) {
    const dest = join(outDir, model.name);

    if (await alreadyPresent(dest, model.minBytes)) {
      console.log(`✓ ${model.name} already present`);
      continue;
    }

    process.stdout.write(`↓ downloading ${model.name} … `);
    const res = await fetch(model.url);
    if (!res.ok) {
      throw new Error(`failed to download ${model.name}: HTTP ${res.status}`);
    }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));

    const { size } = await stat(dest);
    if (size < model.minBytes) {
      throw new Error(`${model.name} looks truncated (${size} bytes)`);
    }
    console.log(`done (${(size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
