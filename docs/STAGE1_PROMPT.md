# Stage 1 build prompt — camera input + live quality-gate feed

Paste this whole file as the prompt.

---

Read `docs/ANDROID_APP_BRIEF.md` in full before writing any code — it has the
exact thresholds, formulas, and framework context this depends on. Its §0 is
the most important part to internalize first.

**Build Stage 1 only**: a live camera screen that captures one photo of a
child and, before letting the user proceed, runs three checks on it — blur,
brightness, framing — exactly as specified in the brief's §4. Nothing about
segmentation, arm measurement, or MUAC prediction belongs in this pass.

## Scope for this stage

1. **Set up the native tooling this needs, first, in this order:**
   - `npx expo prebuild` to generate the native `android/` (and `ios/`)
     projects — this app cannot run in Expo Go.
   - Add `react-native-vision-camera` + its config plugin, and request
     camera permission properly (Android manifest + the plugin's
     `CAMERA_PERMISSION` prompt flow).
   - Confirm `npx expo run:android` builds and shows a live camera preview
     before writing any analysis code. Get this working and confirmed on a
     device/emulator first — don't build the checks on top of an unverified
     camera setup.

2. **Blur + brightness — no model needed.** Write a small native Frame
   Processor Plugin (Kotlin, following VisionCamera's Frame Processor Plugin
   API) that takes the current frame's buffer and returns:
   - `blurScore` = variance of the Laplacian on a grayscale conversion
   - `brightness` = mean grayscale intensity
   Call it from a JS-side frame processor worklet at a throttled rate
   (~3–4 fps is enough for live feedback — do not run every frame, the
   device will overheat and the UI will stutter).

3. **Framing — needs pose landmarks.** This is the one part of Stage 1
   that needs an ML model. Bundle MediaPipe's Pose Landmarker (`.task` file,
   lite variant is fine for this) as a native asset via an Expo Config
   Plugin (see brief §0), and write a native Expo Module wrapping the
   MediaPipe Tasks Android SDK's Pose Landmarker that:
   - accepts a frame/bitmap
   - returns the 33 landmarks (x, y, visibility) as a plain JS array
   Wire that into the same frame-processor pipeline as step 2, throttled
   the same way. Compute the framing check exactly as the brief's §4
   specifies: mean visibility of {nose=0, left shoulder=11, right
   shoulder=12, left hip=23, right hip=24} against 0.5, bounding-box area
   ratio of those points against 0.025 of the frame, and a 0.05 edge-margin
   in-bounds check against 0.8.
   (Landmark indices: standard MediaPipe/BlazePose 33-point numbering —
   confirm the Pose Landmarker Task's output uses this exact indexing before
   wiring the check.)

4. **Live UI feedback.** While the camera preview is showing, display the
   pass/fail state of all three checks in real time (e.g. three small
   indicators or a single combined "Sharp / Too dark / Stand back / Ready"
   status line), so the health worker sees why a shot isn't ready *before*
   they press capture — not as a rejection message after the fact.

5. **Capture gate.** On shutter press, run all three checks one final time
   against the captured still (not just the live preview's last sampled
   frame) and only accept it if all three pass. If any fail, show which
   one and why, and let them retake — do not silently discard the failure
   reason.

## What "done" looks like for this stage

- App launches into a live camera view (development build, not Expo Go).
- All three checks visibly update in real time as the camera is pointed at
  different scenes/lighting/distances.
- Pressing capture on a good frame accepts it and moves to a placeholder
  "next stage" screen (even if that screen is empty for now).
- Pressing capture on a bad frame (deliberately blur it, cover the lens,
  stand too close) shows a specific rejection reason and lets you retry.
- No crash if pose detection returns no landmarks (no person in frame) —
  that should just fail the framing check with "no person detected," not
  throw.

## Explicitly out of scope for this pass

Segmentation, arm measurement, the 23-feature vector, the calibration JSON,
age/sex/weight entry, any screen after the accepted-photo screen. Stop once
the above is working and confirmed — don't get ahead into Stage 2.

## If a design choice here isn't covered by the brief

Prefer whatever keeps this consistent with a plain VisionCamera +
Expo-Modules-API setup over anything requiring ejecting from Expo's managed
tooling entirely. Flag the decision and the reasoning rather than silently
picking one.
