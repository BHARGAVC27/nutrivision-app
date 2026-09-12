"""Builds `scripts/fixtures/pipeline-fixture.json` from the research repo.

Takes real rows from the mp-selfie training table (the frame the shipped
calibration was fitted on), and records for each:

  * the raw pixel quantities the native module would hand to JS
    (height_px, radius median/IQR, per-fraction radii, ...), reconstructed
    from the ratio columns so `features.ts` can be exercised end to end;
  * the 23-feature vector as the desktop computed it;
  * the MUAC scikit-learn predicts for it (through the fitted JSON formula);
  * the MUAC-for-age z-score from `who_zscore.macz`, and the MUAC at z=-2.

`scripts/verify-pipeline.ts` then runs the app's TypeScript over the same
rows and checks it lands on the same numbers. Run from the app directory
with the research repo's CV venv:

    ..\\.venv-cv\\Scripts\\python.exe scripts\\make-pipeline-fixture.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

APP = Path(__file__).resolve().parent.parent
RESEARCH = APP.parent
sys.path.insert(0, str(RESEARCH / "tools"))

import muac_models as mm  # noqa: E402
import who_zscore as wz  # noqa: E402
from segmenter_frontier import load_model_frame  # noqa: E402

CAL = json.loads((RESEARCH / "results" / "muac_calibration_ridge_weight_mpselfie.json").read_text(encoding="utf-8"))
FEATS = CAL["features"]
assert FEATS == mm.FEATURE_SETS["ridge_weight"], "feature order drifted"


def predict(row: pd.Series) -> float:
    y = CAL["intercept"]
    for i, f in enumerate(FEATS):
        x = row[f]
        if not np.isfinite(x):
            x = CAL["_impute_medians_optional"]["values"][i]
        y += CAL["coefficients"][i] * (x - CAL["means"][i]) / CAL["scales"][i]
    return float(y)


def main() -> None:
    df = load_model_frame("anthrovision", "mp-selfie")
    df = df[df["MUAC"].notna() & df["MUAC"].between(8, 35) & df["Age"].notna() & df["Weight"].notna()
            & df["f_arm_ok"].fillna(False).astype(bool)].copy()
    df = df.drop_duplicates(subset="tag", keep="first").reset_index(drop=True)
    # Ages inside the z-score window only; the app refuses the rest before predicting.
    df = df[df["Age"].between(3, 228)]

    rng = np.random.default_rng(7)
    rows = df.iloc[rng.choice(len(df), size=min(60, len(df)), replace=False)]
    # Make sure the fixture exercises a row with a missing per-fraction radius,
    # which is the imputation path.
    missing = df[df[["f_r_f30", "f_r_f40", "f_r_f50", "f_r_f60", "f_r_f70"]].isna().any(axis=1)]
    if len(missing):
        rows = pd.concat([rows, missing.head(5)]).drop_duplicates(subset="tag")

    out = []
    for _, r in rows.iterrows():
        h = float(r["f_height_px"])
        sex = "m" if r["sex_male"] == 1 else "f"
        rf = [r[f"f_r_f{k}"] for k in (30, 40, 50, 60, 70)]
        samples = []
        for frac, v in zip((0.30, 0.40, 0.50, 0.60, 0.70), rf):
            ok = bool(np.isfinite(v))
            samples.append({"fraction": frac, "ok": ok, "plausible": ok, "separated": False,
                            "radiusPx": float(v * h) if ok else None, "x": 0.5, "y": 0.5})
        n_sep = int(r["f_n_sep"]) if np.isfinite(r["f_n_sep"]) else 0
        for s in samples[:n_sep]:
            s["separated"] = True
        z = wz.macz(float(r["MUAC"]), float(r["Age"]), sex)
        pred = predict(r)
        zp = wz.macz(pred, float(r["Age"]), sex)
        # MUAC at z=-2 via the LMS inverse, from the same table lookup the app uses.
        if r["Age"] <= 60:
            L, M, S = wz._interp_lms(wz._AC_DAYS, wz._SEX_CODE[sex], float(r["Age"]) * wz.DAYS_PER_MONTH)
        else:
            L, M, S = wz._interp_lms_named(wz._MUAC_5_19, wz._SEX_CODE[sex], float(r["Age"]))
        cut = M * (1 + L * S * -2) ** (1 / L) if L != 0 else M * np.exp(S * -2)

        def opt(v):
            return None if (v is None or not np.isfinite(v)) else float(v)

        out.append({
            "tag": str(r["tag"]),
            "child": {"ageMonths": float(r["Age"]), "sex": "M" if sex == "m" else "F", "weightKg": float(r["Weight"])},
            "measurement": {
                "ok": True, "reason": "ok", "width": 3000, "height": 4000, "landmarks": [],
                "segmentation": {"usedRefinement": False, "feetOk": True, "areaRatio": 0.1},
                "body": {
                    "heightPx": h,
                    "widthPx": float(r["f_bodywidth_ratio"] * h),
                    "areaPx": float(r["f_area_over_h2"] * h * h),
                    "bbox": [0, 0, 0, 0],
                    "shoulderPx": opt(r["f_shoulder_ratio"] * h) if np.isfinite(r["f_shoulder_ratio"]) else None,
                    "hipPx": opt(r["f_hip_ratio"] * h) if np.isfinite(r["f_hip_ratio"]) else None,
                    "torsoPx": opt(r["f_torso_ratio"] * h) if np.isfinite(r["f_torso_ratio"]) else None,
                },
                "arm": {
                    "ok": True, "reason": "ok", "side": str(r.get("f_arm_side", "left")),
                    "armLenPx": opt(r["f_armlen_ratio"] * h),
                    "armVis": opt(r["f_arm_vis"]),
                    "nOk": int(sum(1 for s in samples if s["ok"])),
                    "nImplausible": 0,
                    "nSeparated": n_sep,
                    "radiusPxMed": opt(r["f_radius_ratio"] * h),
                    "radiusPxIqr": opt(r["f_radius_iqr_ratio"] * h),
                    "samples": samples,
                },
                "skinScore": opt(r["f_skin_score"]),
            },
            "expected": {
                "features": {f: opt(r[f]) for f in FEATS},
                "muacCm": pred,
                "z": opt(zp),
                "cutCm": float(cut),
                "trueMuacCm": float(r["MUAC"]),
                "trueZ": opt(z),
            },
        })

    dest = APP / "scripts" / "fixtures" / "pipeline-fixture.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"wrote {len(out)} rows to {dest.relative_to(APP)}")


if __name__ == "__main__":
    main()
