"""Re-derive the Stage 1 blur threshold for a given working resolution.

`src/quality/gate.ts` uses blurMin = 29.44. That number was tuned in
`tools/stage1_quality_gate.py` (research repo) on the training photos at
their native resolution — cv2.imread, no resize, mostly 3000x4000 px. The app
captures camera stills at 1920x1440, and variance-of-the-Laplacian falls as an
image is downscaled, so 29.44 applied at 1920 px is stricter than validated.

This script replays the same blur formula over a folder of photos at native
size and at a target long edge, and reports the threshold at the target size
that keeps the SAME set of photos on each side of the line — i.e. the number
that makes the 1920 px gate agree with the native-resolution gate. Needs the
image dataset (not in this repo; ~22 GB, request from the data owner).

    python scripts/blur-threshold-at-scale.py <folder-with-frontal-jpgs> --target 1920

Prints the per-photo ratio distribution and a suggested blurMin for the
target size. Put the suggestion into gate.ts only together with the printed
agreement figure, so the change is traceable.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

NATIVE_THRESHOLD = 29.44   # gate.ts blurMin, as tuned at native resolution


def blur_score(gray: np.ndarray) -> float:
    """cv2.Laplacian(gray, CV_64F).var() — the formula in stage1_quality_gate.py, ImageMath.kt and luma.ts."""
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def resized_long_edge(img: np.ndarray, long_edge: int) -> np.ndarray:
    h, w = img.shape[:2]
    if max(h, w) <= long_edge:
        return img
    s = long_edge / max(h, w)
    # Bilinear, to match Bitmap.createScaledBitmap(filter=true) in PhotoAnalyzer.kt.
    return cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_LINEAR)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", type=Path, help="folder searched recursively for *.jpg / *.jpeg / *.png")
    ap.add_argument("--target", type=int, default=1920, help="long edge the app scores at (default 1920)")
    ap.add_argument("--limit", type=int, default=0, help="only the first N photos (0 = all)")
    a = ap.parse_args()

    paths = sorted(p for p in a.folder.rglob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    if a.limit:
        paths = paths[: a.limit]
    if not paths:
        print(f"no images under {a.folder}", file=sys.stderr)
        return 2

    native, target = [], []
    for i, p in enumerate(paths, 1):
        img = cv2.imread(str(p))
        if img is None:
            continue
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        native.append(blur_score(g))
        target.append(blur_score(cv2.cvtColor(resized_long_edge(img, a.target), cv2.COLOR_BGR2GRAY)))
        if i % 50 == 0:
            print(f"  {i}/{len(paths)}", file=sys.stderr)

    n = np.array(native)
    t = np.array(target)
    ratio = t / np.maximum(n, 1e-9)

    print(f"photos: {len(n)}   target long edge: {a.target}")
    print(f"native blur   median {np.median(n):8.2f}   p10 {np.percentile(n, 10):8.2f}   p90 {np.percentile(n, 90):8.2f}")
    print(f"target blur   median {np.median(t):8.2f}   p10 {np.percentile(t, 10):8.2f}   p90 {np.percentile(t, 90):8.2f}")
    print(f"target/native median {np.median(ratio):.3f}   p10 {np.percentile(ratio, 10):.3f}   p90 {np.percentile(ratio, 90):.3f}")
    print()

    # The threshold at the target size that best reproduces the native gate's
    # accept/reject decisions: sweep candidates, maximise agreement.
    native_pass = n >= NATIVE_THRESHOLD
    candidates = np.linspace(max(0.5, t.min()), t.max(), 2000)
    agree = np.array([np.mean((t >= c) == native_pass) for c in candidates])
    best = candidates[int(np.argmax(agree))]
    print(f"native gate (>= {NATIVE_THRESHOLD}) accepts {native_pass.mean():.1%} of these photos")
    print(f"same gate applied at {a.target}px accepts {(t >= NATIVE_THRESHOLD).mean():.1%}  <- the current app behaviour")
    print(f"suggested blurMin at {a.target}px: {best:.2f}   (agreement with native gate {agree.max():.1%})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
