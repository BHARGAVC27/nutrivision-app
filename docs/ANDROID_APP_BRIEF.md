# NutriVision Android App — Build Brief

**Read this file first, before writing any code.** It is written so a Claude Code
session with zero other context can build the app correctly. A prior Android
attempt exists in the source repo at `android/` — it works (real on-device pose +
segmentation + arm measurement) but is being **discarded and rebuilt fresh**.
Do not reuse its code. Some of its *design decisions* below are worth keeping;
say so explicitly where that's true.

## 0. Framework reality — read this before §10

**The actual project is Expo / React Native (Expo SDK 57, expo-router, RN
0.86, TypeScript), not native Kotlin.** Everything in §1–9 and §11–13 below is
framework-agnostic — the thresholds, formulas, feature list, and model
coefficients apply exactly as written regardless of what UI framework wraps
them. **§10 ("Android toolchain traps") was written for a pure-Gradle/Kotlin
project and does NOT directly apply** — items 1 and 2 (AGP/Kotlin plugin
conflict, MediaPipe JNI pinning as a `dependencies {}` line) are only relevant
if a native module ends up depending on the MediaPipe Android AAR directly
(likely, see below). Item 3 (OneDrive build-lock) **does still apply** — this
project also lives inside a OneDrive-synced folder.

**What this means practically:**
- **Expo Go cannot run this app.** On-device ML inference (MediaPipe Tasks,
  or any TFLite model) requires native code with no JS API, which Expo Go
  doesn't support. This project needs a **development build**
  (`npx expo prebuild` + `npx expo run:android`, or an EAS dev build) from the
  start — say this explicitly in the first prompt to avoid wasted cycles
  hitting "native module not found" inside Expo Go.
- **Camera + live frame analysis**: use `react-native-vision-camera` (the
  standard for real-time frame processors in RN) rather than `expo-camera`
  alone — Stage 1's live quality gate needs per-frame pixel analysis at a
  throttled rate, which is VisionCamera's frame-processor model.
  `react-native-worklets` and `react-native-reanimated` (already in
  `package.json`) are exactly the prerequisites frame processors need.
- **Shipping the on-device models** (MediaPipe Pose Landmarker `.task`,
  Selfie Segmenter `.tflite`, this app's own calibration `.json`): these are
  **not JS assets**. They must land inside the native Android (and iOS)
  project as raw asset files, which in Expo means one of:
  1. An **Expo Config Plugin** that copies the files into
     `android/app/src/main/assets/` (and the iOS bundle) every time
     `expo prebuild` runs — the maintainable approach, survives a clean
     prebuild.
  2. Or, if not yet using config plugins, running `expo prebuild` once and
     placing the files directly under the generated `android/app/src/main/assets/`
     — works, but gets wiped on the next clean prebuild unless promoted to (1).
- **Actually running the models**: MediaPipe Tasks (Pose Landmarker, Image
  Segmenter) has no official React Native/JS binding. A small **native Expo
  Module** (Kotlin, via the Expo Modules API — not the legacy bare RN bridge)
  must wrap the MediaPipe Tasks Android SDK, load the bundled `.task`/`.tflite`
  files from assets, and expose an inference function to JS. This is real
  native code, but it's small and self-contained (load model → run on a
  bitmap/frame → return landmarks or a mask as a JS-friendly array). Wiring
  it into a VisionCamera frame processor (as a Frame Processor Plugin) is how
  it gets called on live camera frames for Stage 1's framing check.
- **Blur and brightness need no model at all** — pure pixel math (Laplacian
  variance, mean grayscale) on the current frame's buffer. This can be a tiny
  native Frame Processor Plugin with no MediaPipe dependency, and is the
  cheapest part of Stage 1 to get working first.

---

## 1. What this app is

A phone app for community health workers to screen children for malnutrition.

**The flow:**
1. Health worker takes **one photograph** of the child, standing, facing the camera.
2. Health worker types in **age, sex, and weight** (a cheap weighing scale — no
   height board, no measuring tape).
3. The app runs pose detection + body segmentation + arm measurement **on-device**,
   turns that into 20 numbers, combines them with age/sex/weight through a
   **linear formula**, and outputs a MUAC (mid-upper-arm circumference) estimate
   in centimetres.
4. That estimate is converted to a growth-reference z-score and compared to a
   threshold to produce a referral decision: **refer / clear / not sure — measure
   manually.**

Everything runs offline. No server, no cloud inference.

**Validated accuracy of this exact configuration: MUAC MAE 1.0865 cm**, beating
the published Mask R-CNN benchmark (2.31 cm, Lydia et al. 2025) by 53%.

---

## 2. The one rule that matters most

> **Never show a number the pipeline cannot justify.** If a required input is
> missing, or a computed feature is unavailable, show "cannot assess" — never
> substitute a guess, a zero, or a plausible-looking placeholder. This was a
> deliberate design principle in the prior build and should be kept.

Also: **never report an accuracy figure without saying which configuration it
describes.** The 1.0865 cm figure is for the *mobile* segmenter, weight-anchored
inputs, single frame — not the desktop pipeline's 1.433 cm (different segmenter,
different inputs). Conflating the two is the most tempting and most common error
in this project's own history.

---

## 3. The validated configuration — do not deviate from this

| decision | value | why |
|---|---|---|
| Segmenter | **MediaPipe Selfie Segmentation** (`selfie_segmenter.tflite`) | ~250 KB, ships inside MediaPipe's own SDK, no separate runtime |
| Pose | **MediaPipe Pose Landmarker**, 33 landmarks | same SDK family |
| Frames | **single photo** | the app only ever captures one |
| Scale anchor | **Weight** (typed in) | beats Height by 25% (1.05 vs 1.40 cm MAE) and adding Height on top of Weight changes nothing (p=0.55) |
| **Height** | **NOT an input** | deliberately dropped — do not add a height field |
| Model | linear regression, 23 features → 1 output, **no neural network** | see §5 |

**Do not substitute a different segmenter, add height as an input, or swap the
model for something more complex without re-validating** — every one of those
changes was tried on the desktop side and measured; the choices above are the
survivors, not defaults.

---

## 4. Stage 1 — Quality Gate (reject bad photos before they're used)

Three checks, all must pass:

| check | how | threshold |
|---|---|---|
| Blur | variance of the Laplacian on grayscale | `≥ 29.44` |
| Brightness | mean grayscale intensity | `40 ≤ x ≤ 220` |
| Framing | MediaPipe pose: mean visibility of {nose, left shoulder, right shoulder, left hip, right hip}, bounding-box area ratio, distance from frame edge | visibility `≥ 0.5`, bbox area ratio `≥ 0.025` of frame, in-bounds `≥ 0.8` with a `0.05` edge margin |

If any check fails, reject with a specific reason ("too blurry," "too dark,"
"stand further back," etc.) — not a generic error. This is a live, pre-capture
check: run it on the camera preview frame, not just after the shutter.

---

## 5. Stage 2 — Segmentation & Measurement (produces the 20 image features)

### 2A. Segmentation

1. Run MediaPipe Pose → 33 landmarks (each with x, y, visibility).
2. Run MediaPipe Selfie Segmentation → a person mask.
3. From the mask: compute `height_px` = mask's vertical extent (top of head to
   bottom of feet in pixels). **This is the denominator of every feature below**
   — get this right or every ratio is wrong.

*(The desktop pipeline does a more elaborate two-pass YOLO segmentation with
foot-clipping detection and pose-guided repair — that's specific to the YOLO
model and not applicable to MediaPipe's segmenter. MediaPipe's own model is
generally more robust to partial-frame subjects; a single-pass call is fine.
If testing shows feet/head are frequently clipped, revisit this.)*

### 2B. Arm measurement

Landmark indices (standard MediaPipe Pose numbering — same on desktop and
Android SDK, no translation needed):

```
LEFT:  shoulder=11  elbow=13  wrist=15
RIGHT: shoulder=12  elbow=14  wrist=16
```

Pick whichever side has both shoulder and elbow visible (prefer left if both
are, matching desktop behavior).

For each of **5 points along the upper arm** — at 30%, 40%, 50%, 60%, 70% of the
way from shoulder to elbow — cast a ray **perpendicular** to the shoulder→elbow
axis, **outward** (away from the torso centroid), and measure the distance from
the arm centerline to where the ray exits the person mask. That distance is the
**radius** at that point.

```
outward direction: perpendicular to (elbow - shoulder), pointing AWAY from the
                    average position of {left shoulder, right shoulder,
                    left hip, right hip} (the torso centroid)
```

**Range-check every sample**: reject it if `radius / height_px` falls outside
`[0.008, 0.048]`. This guards against a ray that exits through a fold of
clothing or a segmentation glitch rather than the true arm edge.

Take the **median** of the surviving (≤5) samples as `radius_px_med`. If zero
samples survive, arm measurement failed for this photo — do not proceed to
Stage 3, ask for a retake.

### The 23 features, in this exact order (order matters — must match §6)

```
Age                  typed in, months
sex_male             1 if male, 0 if female
Weight               typed in, kg
f_diam_ratio         2 * radius_px_med / height_px
f_radius_ratio       radius_px_med / height_px
f_radius_iqr_ratio   (75th percentile - 25th percentile of the surviving
                      radius samples) / height_px
f_armlen_ratio       |elbow - shoulder| (pixel distance) / height_px
f_area_over_h2       (mask pixel count) / height_px²
f_bodywidth_ratio    (mask's horizontal extent, i.e. rightmost minus leftmost
                      mask pixel) / height_px
f_shoulder_ratio     |left shoulder - right shoulder| (pixel distance) / height_px
f_hip_ratio          |left hip - right hip| (pixel distance) / height_px
f_torso_ratio        |shoulder midpoint - hip midpoint| (pixel distance) / height_px
f_arm_vis            max(pose visibility of the chosen elbow, chosen shoulder)
f_skin_score         see §6 — the one non-trivial feature, must be ported
f_n_sep              count of the 5 samples where the arm was "separated" from
                      the torso -- see note below; on mobile this will almost
                      always be 0, that's expected (99% were 0 on the desktop
                      dataset too)
f_r_f30 .. f_r_f70   the 5 individual radius/height_px ratios, one per sample
                      point (NaN / skip if that specific sample was rejected)
f_r_min              min of the 5 f_r_f* values
f_r_p25              25th percentile of the 5 f_r_f* values
f_r_mean             mean of the 5 f_r_f* values
```

**On `f_n_sep` ("separated"):** the desktop pipeline additionally checks
whether the *inner* arm edge (toward the torso) is visibly separate from the
torso silhouette, vs. touching it. This requires scanning inward as well as
outward and comparing distances. It is a minor feature (near-zero for 99% of
subjects) — **acceptable to hardcode `f_n_sep = 0` for a first version**, and
revisit only if accuracy testing shows it matters. Flag this simplification
in code with a comment.

---

## 6. `f_skin_score` — the one blocking dependency, full algorithm

This is a small, self-contained image-processing function — **no ML model
needed**, fully portable to Kotlin/OpenCV-on-Android. Do not skip it or the
model will silently fail (see §7).

**Purpose:** a continuous 0–1 score for how much bare skin is visible on the
arm — used as one input *feature*, never as a gate. (A previous design used it
as a hard switch between two models; that was measured to be wrong — clothing's
total effect on error is only ~6%, too small to justify discarding every
long-sleeved child. Keep it as a feature.)

**Algorithm**, for each of the 5 arm sample points (same points as §5B):

1. Take a 24×24 pixel patch (12px half-width) centered on that point on the
   original photo (not the mask).
2. Also take a small reference patch (10px half-width) centered on the wrist
   landmark if visible, else on the elbow — this is the "known skin/clothing"
   reference for that child's specific photo (accounts for lighting).
3. Convert the arm patch to **YCrCb** color space. Compute the fraction of
   pixels inside the skin-tone range: `Cr ∈ [133, 173]`, `Cb ∈ [77, 127]`
   (Y unconstrained, 0–255). Call this `skin_ratio`.
4. Convert the same patch to grayscale, compute the **variance of the Laplacian**
   (a texture/sharpness measure — skin has different micro-texture than most
   fabric). Call it `lap`.
5. Compute `delta` = Euclidean distance between the arm patch's mean BGR color
   and the reference patch's mean BGR color.
6. Combine:
   ```
   score = 0.50 * skin_ratio
         + 0.30 * (1.0 - min(1.0, lap / 500.0))
         + 0.20 * (1.0 - min(1.0, delta / 80.0))
   ```
7. `f_skin_score` = the **maximum** score across the 5 sample points (the arm
   only needs to show skin *somewhere* to score high).
8. If no valid patches (landmarks not visible), `f_skin_score` is undefined —
   fall back to the imputation value in §7, do not fail the whole prediction.

---

## 7. Stage 3 — The MUAC prediction (the model itself)

**Not a neural network.** Linear regression: 23 inputs → 23 coefficients →
1 output. This is the *entire* model — no epochs, no training on-device, just
a dot product.

```
predicted_MUAC_cm = intercept + Σ  coefficient[i] * (feature[i] - mean[i]) / scale[i]
```

Ship the model as a JSON asset with this exact structure (values below are the
real, validated coefficients — copy them verbatim, do not re-derive):

```json
{
  "status": "calibrated",
  "model": "ridge_weight",
  "fitted_on_segmenter": "mp-selfie",
  "fitted_on_frame_count": "single",
  "features": ["Age","sex_male","Weight","f_diam_ratio","f_radius_ratio",
    "f_radius_iqr_ratio","f_armlen_ratio","f_area_over_h2","f_bodywidth_ratio",
    "f_shoulder_ratio","f_hip_ratio","f_torso_ratio","f_arm_vis","f_skin_score",
    "f_n_sep","f_r_f30","f_r_f40","f_r_f50","f_r_f60","f_r_f70","f_r_min",
    "f_r_p25","f_r_mean"],
  "intercept": 18.84866485013624,
  "coefficients": [-0.4437105990925845, -0.03356658861139512, 2.9562628165231506,
    0.29152126967238345, 0.29152126967139225, -0.06184244111914339,
    -0.01908334778777774, -0.059025134634453025, 0.37688769102640585,
    0.10785800788208275, 0.2138391550616529, -0.18527287100689485,
    -0.007793622556542263, -0.022042629067903295, 0.01724203641356506,
    0.2522522423678213, 0.0005537645442603711, 0.07420905058364635,
    -0.07249347929852412, 0.18391779528848984, 0.480931342422852,
    -0.0495827357659131, -1.2572157192764166],
  "means": [130.61362397820164, 0.6435967302452316, 31.973204359673026,
    0.05822056178449672, 0.029110280892248333, 0.002419911658043531,
    0.15747691668505515, 0.19040041677345057, 0.2952746256361681,
    0.18866433112807965, 0.10481496433465323, 0.28832860155570816,
    0.9510548103602771, 0.48651198074223817, 0.0038147138964577656,
    0.028898402582109968, 0.02930461884918169, 0.029334459124948625,
    0.028840256667560134, 0.028201423323982098, 0.02634394639235172,
    0.027838122038804584, 0.029000289009007713],
  "scales": [40.30859881759597, 0.4789362995878243, 12.326187447059025,
    0.013038201639878916, 0.006519100819939458, 0.002530248908180468,
    0.0106308320032316, 0.01856718871302283, 0.029389780491541832,
    0.011600179073792188, 0.007391835841275633, 0.01577508633609058,
    0.10681179359754674, 0.24017210063715136, 0.07733044915560441,
    0.0061416106188522885, 0.006525844587771331, 0.006590666180652277,
    0.006822849289984185, 0.0070156328651061715, 0.006516301036874677,
    0.006517123867145658, 0.00641575050138899],
  "impute_medians": [130.0, 1.0, 29.2, 0.057909604519774, 0.028954802259887,
    0.0017605633802816, 0.1580600449763446, 0.1898231823672554,
    0.2914238134887593, 0.1880179890364386, 0.1045803843804125,
    0.2875430075167078, 0.9876184940338136, 0.4369859696988706, 0.0,
    0.0286282306163021, 0.02911679373013975, 0.02915654286706,
    0.0286612378397882, 0.028076589788028197, 0.0262780697563306,
    0.0277536860364267, 0.0287700211544273]
}
```

**Missing-feature policy:** if a specific feature couldn't be computed for this
photo (e.g. one arm sample point was occluded), substitute that feature's
`impute_medians` value **for that one feature only** — do not abort the whole
prediction. Only abort ("cannot assess") if the arm couldn't be measured *at
all* (zero surviving samples), or if age/sex/weight weren't entered.

**Round-trip verified on the desktop side**: this exact JSON reconstructs every
training prediction to within `1.78e-14` cm of scikit-learn's own output — the
formula above is complete and correct as written, nothing else is needed.

---

## 8. Stage 4 — Turning the number into a decision (recommended for v2, not v1)

Converts the cm number into a referral decision. **Suggest building Stage 1–3
first (show the raw MUAC number, ship it, confirm it works end to end), then
add this.**

### Step 1: convert MUAC to a z-score (age/sex-adjusted)

Uses the **LMS method** against a published growth reference:

```
z = ((MUAC / M) ^ L - 1) / (L * S)
```

Where L, M, S come from a reference table, looked up by age (interpolated
between the nearest two rows) and sex.

**Two reference tables are needed, stitched together** (WHO publishes no MUAC
reference past 60 months):

| age range | table | age column unit | sex encoding |
|---|---|---|---|
| 3–60 months | `acanthro.txt` (WHO) | **days** — convert `age_months * 30.4375` before lookup | `1` = male, `2` = female |
| 60–228 months | `muac_for_age_5to19_mramba.csv` (Mramba et al., BMJ 2017) | **months directly**, no conversion | `1` = male, `2` = female |

Both files already exist in this repo at `who_reference_tables/acanthro.txt`
and `who_reference_tables/muac_for_age_5to19_mramba.csv` — copy them as app
assets, tab-separated and comma-separated respectively (check the actual
delimiter when parsing). Outside 3–228 months, no z-score is defined — say so,
don't extrapolate.

### Step 2: threshold, with a "not sure" option

```
z < −2          →  REFER
z ≥ −2 (clear margin)  →  CLEAR
close to the line, or the model isn't confident  →  NOT SURE — measure manually
```

**A single point estimate is not enough to safely say "clear."** The desktop
system uses an ensemble of models and a calibrated confidence margin to decide
when to defer rather than guess. Porting that exactly is real work; an
acceptable v2 simplification: defer if the predicted z is within some fixed
margin of −2 (e.g. ±0.3 SD) — cruder than the desktop version but keeps the
same safety principle (**never confidently clear a borderline child**). Flag
this simplification in code and in any accuracy claim shown in the app.

**Do not claim the desktop system's exact sensitivity/specificity numbers for
this simplified on-device version** — they were measured for a different
decision rule. Re-validate before quoting one.

---

## 9. Assets needed

| file | source | purpose |
|---|---|---|
| MediaPipe Pose Landmarker model | MediaPipe SDK / model zoo | pose |
| `selfie_segmenter.tflite` | MediaPipe SDK / model zoo | segmentation |
| the calibration JSON (§7) | this document / `results/muac_calibration_ridge_weight_mpselfie.json` in the source repo | MUAC prediction |
| `acanthro.txt`, `muac_for_age_5to19_mramba.csv` | `who_reference_tables/` in the source repo | z-scoring (v2) |

---

## 10. Android toolchain — known traps, save yourself the time

1. **AGP 9 has built-in Kotlin support.** Do NOT also apply the
   `org.jetbrains.kotlin.android` plugin — it fails with
   `Cannot add extension with name 'kotlin'`. Apply only
   `com.android.application` (or `com.android.library`) to the module.
2. **Pin MediaPipe to `0.10.29` if targeting the emulator.** It is the only
   recent release shipping an `x86_64` JNI lib for the standard Android
   emulator image — 0.10.14/0.10.21 ship arm64 only, 0.10.26.1 dropped x86
   entirely, 0.10.35's AAR has no JNI at all. Wrong version = `UnsatisfiedLinkError`
   on every standard emulator. (This constraint doesn't apply if testing only
   on physical arm64 hardware — verify what you actually need before pinning.)
3. **If the project lives inside a OneDrive-synced folder**, redirect the
   Gradle build output directory elsewhere (e.g. `C:/nvbuild` via
   `rootProject.buildDir` in the root `build.gradle.kts`) — OneDrive's sync
   client locks freshly-written files and intermittently breaks Gradle mid-build.
4. **Don't redirect `adb` binary output with PowerShell `>`** — it corrupts
   the stream. For a screenshot: `adb shell screencap -p /sdcard/s.png` then
   `adb pull /sdcard/s.png <dest>`.
5. Check the filesystem for JDK/SDK before assuming they're missing — Android
   Studio installs its own JDK (`Android Studio/jbr`) that may not be on PATH
   even though it's present and usable.

---

## 11. Design principles worth preserving from the prior attempt

- **Every accuracy number shown to the user must say what pipeline/config
  produced it.** Don't let a marketing-style "1 cm accurate!" claim drift in
  without the caveat that it's for this exact mobile configuration.
- **`f_skin_score` stays a feature, never a hard gate.** Don't rebuild the
  clothing-based routing switch that an earlier design used — it was
  deliberately replaced (§6 explains why).
- **Refuse rather than fabricate.** Missing weight, unmeasurable arm, age
  outside the reference range, quality gate failure — every one of these is a
  "cannot assess, here's why" screen, never a best-guess number.
- **State clearly in-app that this is a triage/screening aid, not a diagnostic
  replacement for a manual MUAC tape measurement.**

---

## 12. Suggested build order

1. Camera capture + Stage 1 quality gate live on the preview feed.
2. Age/sex/weight entry form.
3. Pose + segmentation running on a captured photo, with a debug overlay
   (draw the mask, the 5 sample rays, pass/fail per sample) — build this
   *before* wiring the model, so measurement correctness is visible and
   testable on its own.
4. Assemble the 23 features, verify each one against a hand-computed example.
5. Wire in the calibration JSON, show the predicted MUAC number end to end.
6. **Stop and validate** against a few real photos with known MUAC before
   proceeding — this is the point where the whole pipeline is either right or
   silently wrong.
7. Add Stage 4 (z-score + referral decision) as a second pass.
8. Explainability / uncertainty display (optional, later).

---

## 13. If you need more detail than this document has

The source project (same machine, likely path
`C:\Users\jason\OneDrive\Documents\Capstone`) has the full desktop
implementation this app is a port of. If accessible:

- `tools/stage1_quality_gate.py` — Stage 1, exact reference implementation
- `tools/stage2_segmentation.py` — desktop segmentation (YOLO-based; the
  MediaPipe path this app uses is simpler, described fully in §5 above)
- `tools/stage2_features.py` — Stage 2B feature extraction, including the
  exact `skin_visibility()` function §6 is ported from
- `tools/who_zscore.py` — the full z-score / LMS implementation §8 is ported from
- `HANDOFF.md` — the full project history, findings, and every number's provenance
- `PHASE3.md` — the complete evaluation record, if a specific accuracy claim
  needs its source citation

Do not copy code from `tools/` directly (it's Python) — port the *logic*,
matching the exact formulas and constants given above.
