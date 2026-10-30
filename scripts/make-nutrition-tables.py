"""Builds the nutrition extension's tables and fixture from the research repo.

The engine itself lives in `../nutrition_ext/scripts/` (`india_risk.py`,
`food_plan.py`); the record is `../NUTRITION_EXTENSION.md`. This script does
not re-derive anything — it exports what the Python engine already uses:

  * `src/nutrition/tables.json`
      - CNNS 2016-18 deficiency rates the app reads (age-band total, age
        sub-group, sex, diet type; one per nutrient x age band), with table numbers;
      - the combination shrinkage lambda and the 20 % flag threshold;
      - ICMR-NIN DGI 2024 Annexure V (grams/day per food group, by age and sex);
      - the menu's slots, the pulse swap, and which IFCT columns score each measure;
      - the IFCT 2017 foods that can ever be suggested (food_plan.ELIGIBLE), with
        the nutrient columns used, the diet each needs, a plain display name
        (`data/ifct2017/display_names.csv`), and their Hindi / Kannada / Tamil /
        Telugu names from IFCT's own "Local Name" column;
      - a version stamp (date + content hash), shown on the screen.
  * `scripts/fixtures/nutrition-fixture.json`
      the Python engine's output for every age 3-228 months x sex x diet answer
      (not asked / veg / egg / non-veg): routing at four severities, risks, the
      plan row, the menu (top 3 per slot with portions and scores) and its totals.

`scripts/verify-nutrition.ts` replays the fixture through `src/nutrition/plan.ts`.
Run from the app directory with the research repo's CV venv:

    ..\\.venv-cv\\Scripts\\python.exe scripts\\make-nutrition-tables.py
"""

from __future__ import annotations

import datetime
import hashlib
import json
import math
import re
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
RESEARCH = APP.parent
sys.path.insert(0, str(RESEARCH / "nutrition_ext" / "scripts"))
sys.path.insert(0, str(RESEARCH / "tools"))

import food_plan as fp  # noqa: E402
import india_risk as ir  # noqa: E402
import who_zscore as wz  # noqa: E402

LOCAL_PREFIX = {"hi": "H", "kn": "Kan", "ta": "Tam", "te": "Tel"}  # IFCT "Local Name" language codes
NUTRIENT_COLS = [col for specs in fp.MEASURES.values() for col, *_ in specs]
AGE_BANDS = ["1-4", "5-9", "10-19"]
AGE_SUBGROUPS = {"1-4": ["12–17", "18–23", "24–35", "36–47", "48–59"], "5-9": ["5–7", "8–9"], "10-19": ["10–14", "15–19"]}


def local_name(lang_field, prefix: str) -> str | None:
    """First local name for one language from IFCT's 'H. Kulthi; Kan. Hurule; ...' field."""
    if not isinstance(lang_field, str):
        return None
    for part in lang_field.split(";"):
        m = re.match(r"\s*" + prefix + r"\.\s*(.+?)\s*\.?\s*$", part)
        if m:
            return m.group(1).split(",")[0].strip() or None
    return None


def num(v):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else v


def rates(nut, band, group, categories):
    out = {}
    for cat in categories:
        r, tab = ir._rate(nut, band, "background", group, cat)
        if r is not None:
            out[cat] = [r, tab]
    return out


def cnns_tables():
    out = {}
    for nut in ir.NUTRIENTS:
        out[nut] = {}
        for band in AGE_BANDS:
            total, ttab = ir._rate(nut, band, "background", "total", "Total")
            assert total is not None, f"no CNNS total for {nut} {band}"
            out[nut][band] = {"total": [total, ttab], "age": rates(nut, band, "age", AGE_SUBGROUPS[band]),
                              "sex": rates(nut, band, "sex", ["Male", "Female"]),
                              "diet": rates(nut, band, "diet", list(ir.DIET_LABEL.values()))}
    return out


def plan_rows():
    rows = []
    for _, r in fp.PLAN.iterrows():
        milk = r["milk_curd_ml"]
        rows.append({
            "ageGroup": r["age_group"], "sex": r["sex"],
            "ageMin": int(r["age_min_months"]), "ageMax": int(r["age_max_months"]),
            "cereals_millets_g": float(r["cereals_millets_g"]), "pulses_g": float(r["pulses_g"]),
            "glv_g": float(r["glv_g"]), "vegetables_g": float(r["vegetables_g"]),
            "roots_tubers_g": float(r["roots_tubers_g"]), "fruits_g": float(r["fruits_g"]),
            "nuts_g": float(r["nuts_g"]),
            # the 7-12 month row gives "breast milk" instead of an amount
            "milk_curd_ml": float(milk) if str(milk).replace(".", "", 1).isdigit() else None,
            "fats_oils_g": float(r["fats_oils_g"]),
            "energyKcal": num(float(r["energy_kcal"])), "proteinG": num(float(r["protein_g"])),
        })
    return rows


def foods():
    out = []
    for _, f in fp.ELIGIBLE.iterrows():  # already sorted by code
        out.append({
            "code": f["code"], "name": f["name"], "display": f["display"], "group": f["group"], "need": f["need"],
            "local": {lang: local_name(f["lang"], p) for lang, p in LOCAL_PREFIX.items()},
            **{col: num(float(f[col])) for col in NUTRIENT_COLS},
        })
    return out


def muac_for_z(target, age, sex):
    lo, hi = 5.0, 45.0
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if wz.macz(mid, age, sex) < target else (lo, mid)
    return (lo + hi) / 2


def fixture():
    cases = []
    for age in range(3, 229):
        for sex in "mf":
            routing = {}
            for cat, z in (("normal", 0.0), ("at_risk", -1.5), ("moderate", -2.5), ("severe", -3.5)):
                res = fp.food_plan(dict(age_months=age, sex=sex, muac_cm=muac_for_z(z, age, sex)))
                assert res["severity"].replace(" ", "_") == cat, (age, sex, cat, res["severity"])
                routing[cat] = res["action_key"]
            normal_muac = muac_for_z(0.0, age, sex)
            for diet in (None, "veg", "egg", "nonveg"):
                plan = fp.food_plan(dict(age_months=age, sex=sex, muac_cm=normal_muac, diet=diet))
                risks = plan.get("risks")
                cases.append({
                    "ageMonths": age, "sex": "M" if sex == "m" else "F", "diet": diet, "routing": routing,
                    "risks": None if not risks or risks[0]["risk"] is None else {r["nutrient"]: r["risk"] for r in risks},
                    "planAgeGroup": plan["daily_plan"]["age_group"] if "daily_plan" in plan else None,
                    "menu": [[s["slot"], s["grams"], [[f["code"], f["portion"], f["score"]] for f in s["foods"]]]
                             for s in plan.get("menu", [])],
                    "totals": plan.get("menu_totals", {}),
                })
    return cases


def main() -> None:
    tables = {
        "lambda": ir.LAMBDA, "flagAt": ir.FLAG_AT, "milletShare": fp.MILLET_SHARE,
        "swapG": fp.SWAP_G, "eggG": fp.EGG_G, "swapGroups": list(fp.SWAP_GROUPS),
        "nutrients": ir.NUTRIENTS, "nutrientMeasure": fp.NUTRIENT_MEASURE,
        "measures": {m: [{"col": c, "mult": mult, "unit": unit, "groups": sorted(g) if g else None}
                         for c, mult, unit, g in specs] for m, specs in fp.MEASURES.items()},
        "slots": [{"slot": s, "col": c, "groups": list(g)} for s, c, g in fp.SLOTS],
        "allowed": {d: sorted(n) for d, n in fp.ALLOWED.items()},
        "cnns": cnns_tables(), "plan": plan_rows(), "foods": foods(),
    }
    digest = hashlib.sha1(json.dumps(tables, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:8]
    tables = {"_source": "Generated by scripts/make-nutrition-tables.py from ../nutrition_ext (record: "
                         "../NUTRITION_EXTENSION.md). Do not edit by hand.",
              "version": f"{datetime.date.today().isoformat()}-{digest}", **tables}
    dest = APP / "src" / "nutrition" / "tables.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(tables, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {dest.relative_to(APP)}: {len(tables['foods'])} foods, {len(tables['plan'])} plan rows, "
          f"version {tables['version']}")

    cases = fixture()
    fx = APP / "scripts" / "fixtures" / "nutrition-fixture.json"
    fx.write_text(json.dumps(cases, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {fx.relative_to(APP)}: {len(cases)} cases")


if __name__ == "__main__":
    main()
