# Baazu — NutriVision screening app

Offline Android app for community health workers: one photo plus age, sex and
weight → an on-device MUAC estimate → a referral decision (refer / healthy /
not sure, measure by hand). Five languages (Hindi default, Kannada, Tamil,
Telugu, English), spoken instructions, an on-phone register, CSV export.

The UI is the Claude Design project *Malnutrition screening mobile app*
(`Malnutrition Screening.dc.html`), screen for screen. The measurement is the
validated mobile configuration from the research repo one directory up
(`docs/ANDROID_APP_BRIEF.md` is the contract; `HANDOFF.md` there has every
number's provenance).

## Running it

This is an Expo development build — **Expo Go cannot run it** (MediaPipe has
no JS binding, so the vision code is a native Expo Module).

```bash
npm install
npm run fetch:models          # downloads the three MediaPipe model files into native-assets/
npx expo prebuild --platform android
npx expo run:android          # needs the emulator (Medium_Phone_API_36.1) or a device
```

**CMake 3.31.6 must be installed in the SDK** (`sdkmanager "cmake;3.31.6"`).
This folder is 59 characters deep, and the NDK builds of the Nitro-based
libraries (nitro-image, VisionCamera) generate `.cxx` prefab paths that reach
Windows' 260-character limit; the SDK's default CMake 3.22.1 ships a ninja
that is not long-path aware and loops on `Re-running CMake...` for
`armeabi-v7a` forever. `plugins/with-cmake-version.js` writes `cmake.dir`
into `android/local.properties` on each prebuild, pointing at the newest
installed CMake ≥ 3.30 (ninja 1.12, long-path aware).

Build output stays in place (`android/app/build`, `node_modules/*/android/build`).
The brief's advice to redirect Gradle output away from the OneDrive-synced tree
(§10.3) does not survive contact with React Native: the RN Gradle plugin and
several libraries' CMake files (reanimated, nitro) hard-code `build/` paths, so a
redirect breaks `compileDebugKotlin` and the NDK builds. If OneDrive ever
interferes, pause syncing for the build rather than moving the output.

Checks that run without a device:

```bash
npx tsc --noEmit              # types
npm run verify:pipeline       # JS pipeline vs. the research pipeline, row for row
```

`verify:pipeline` replays 65 real rows from the mp-selfie training table
through `features.ts → calibration.ts → zscore.ts` and requires the MUAC to
match scikit-learn's to 1e-9 cm. Regenerate the fixture with
`..\.venv-cv\Scripts\python.exe scripts\make-pipeline-fixture.py`.

## Shipping a build

Release builds are signed with `credentials/release.keystore` (git-ignored;
`bash scripts/make-keystore.sh` creates it once — **back it up**, a lost
keystore means installed copies can never be updated) and split per ABI, so
each APK carries only its own native libraries:

```bash
npx expo prebuild --platform android
cd android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a       # phones
# → android/app/build/outputs/apk/release/app-arm64-v8a-release.apk
./gradlew :app:bundleRelease                                              # Play Store upload (.aab)
# → android/app/build/outputs/bundle/release/app-release.aab
```

`arm64-v8a` covers every Android phone sold in the last several years; add
`armeabi-v7a` to the list for very old 32-bit handsets, `x86_64` for the
emulator. Bump `expo.version` and `expo.android.versionCode` in `app.json`
before each release. The dev-only route (`/dev`) and the raw failure codes on
the cannot-assess screen are compiled out of release builds.

Not covered here: a Play Store listing (developer account, privacy policy
stating that photos never leave the phone, screenshots), and iOS — the
native module is Android-only.

## How a screening flows

| screen | file | what happens |
|---|---|---|
| Home | `src/app/index.tsx` | counts, last three records, *New screening* |
| Child's details | `src/app/info.tsx` | age (months), sex, weight from the scale, optional name. No height, by design. |
| Take the photo | `src/app/capture.tsx` | live Stage 1 gate (blur, light, framing) on the preview; shutter unlocks when all three pass; the still is re-checked and can be retaken |
| Taking the measurement | `src/app/processing.tsx` | Stage 2 (native) → 23 features → Stage 3 MUAC → Stage 4 decision |
| Result / Cannot assess | `src/app/result.tsx`, `src/app/cannot.tsx` | decision, MUAC, category, range; or a specific reason and what to try |
| Explain this result | `src/app/explain.tsx` | where the arm was read, the range, the growth curve |
| History, Settings | `src/app/history.tsx`, `src/app/settings.tsx` | register with filters; language, audio, export / clear, about |

The photo is a temporary file and is deleted when the screening is saved or
abandoned. Records (`screenings.json` in the app's documents directory) hold
the inputs, the numbers and the arm sample points — never the image.

## Validating against real photos (dev builds)

`src/app/dev.tsx` is a hidden route that runs the whole pipeline on a photo
already on the phone and lands on the normal result screen — the brief's
"stop and validate" step without a camera. `scripts/dev-run.sh` drives it from
the research dataset over adb:

```bash
bash scripts/dev-run.sh 1232 117 F 23.6 1769 115 M 28.9 646 97 M 17.8 158 128 M 22
```

On the emulator (x86_64) on 2026-09-11, against the desktop mp-selfie pipeline
on the same photos (`scripts/fixtures/pipeline-fixture.json`):

| tag | on-device MUAC | desktop MUAC | tape MUAC |
|---|---|---|---|
| 1232 | 18.27 | 18.34 | 16.5 |
| 1769 | 18.33 | 18.29 | 18.3 |
| 646 | 15.33 | 15.44 | 14.2 |
| 158 | 16.14 | 16.18 | 16.0 |

The Kotlin port lands within ~0.1 cm of the research pipeline; the remaining
gap to the tape is the model's own error (MAE 1.09 cm). ~1.5–2 s per photo on
the emulator.

## Where the pipeline lives

```
modules/nutrivision-vision/           native Expo Module (Kotlin, MediaPipe Tasks 0.10.29)
  PoseDetector.kt                     Pose Landmarker — lite for the live preview, full for the still
  PoseClean.kt                        visibility threshold + imputation (tools/pose_utils.py)
  PersonSegmenter.kt                  Selfie Segmenter + the segment_person chain (tools/stage2_segmentation.py)
  MaskOps.kt                          bilateral / threshold / open-close / largest component / pose repair, no OpenCV
  ArmProfile.kt                       five-point arm profile, body metrics, skin score (tools/stage2_features.py)
  MeasurementPipeline.kt              one still in, raw pixel quantities out
src/quality/                          Stage 1 thresholds and decisions (shared by preview and still)
src/pipeline/features.ts              the 23 features, in calibration order
src/pipeline/calibration.ts + .json   the ridge_weight / mp-selfie / single-frame model, verbatim
src/pipeline/zscore.ts + reference/   MUAC-for-age LMS (WHO 2006 + Mramba 2017), weight-for-age
src/pipeline/decide.ts                refer / clear / not-sure rule
src/pipeline/run.ts                   the whole thing, with the four "cannot assess" reasons
```

Model files are not committed (`native-assets/` is fetched); the config plugin
`plugins/with-nutrivision-assets.js` copies them into the Android assets on
every prebuild and keeps them uncompressed.

## Things to know before changing numbers

- **Accuracy claim:** MUAC MAE **1.0865 cm**, 20-seed CV, for *this*
  configuration only (weight-anchored, mp-selfie segmenter, single frame).
  The desktop pipeline's 1.433 cm is a different segmenter and inputs.
- **Decision rule (v1 simplification, flagged in `decide.ts`):** refer when
  MUAC-for-age z < −2; *not sure* whenever the referral line is within one
  MAE of the estimate; the displayed range is ±2 MAE. The desktop system's
  risk-controlled deferral was measured for a different configuration and
  has not been re-run for this one — do not quote its sensitivity/specificity.
- **`f_arm_vis`** follows the extraction code (weighted shoulder/elbow/wrist
  chain visibility, best side), not the brief's paraphrase; the coefficients
  were fitted on the former.
- **`f_n_sep`** is computed (inner-edge scan), not hard-coded to zero.
- Skin-score patches are 24×24 px on the captured still (1440×1920), while
  the training photos were 3000×4000; the texture term is therefore slightly
  different in scale. It is the weakest feature in the model (|coef| 0.022).
