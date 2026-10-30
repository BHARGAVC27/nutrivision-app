# NutriVision Nutrition Extension: Deficiency Risk and Food Plan

**Status:** built and verified in Python (October 2026). **In the app since 26 Oct 2026** as the "Food plan" screen
(`Nutrivison_App/src/app/food.tsx`, engine `src/nutrition/plan.ts`); `npm run verify:nutrition` checks the app's
TypeScript against this Python engine for every age 3–228 months × sex × diet answer.
**Revisions:** 25 Oct, no questionnaire and common foods only (§3.7). 26 Oct, after a design critique: one
*optional* diet question, one combined daily menu instead of per-nutrient food lists, honest "how common at this
age" wording, age-specific advice for moderate cases, plain food names (§3.8). The research in §3.1–3.5 is
unchanged; it is the evidence for asking only the diet question.
**Location:** everything lives in `nutrition_ext/`. Nothing in the main project was changed; three
main-project modules are imported read-only (`tools/who_zscore.py`, `tools/muac_models.py`,
`tools/segmenter_frontier.py`).

---

## 0. What was asked, and the rules followed

The project guide asked for an extension: after NutriVision says whether a child is malnourished,
also say **what the child is likely deficient in** and **what they should eat**.

Rules agreed before building:

1. **Extension only.** The existing photo → MUAC → z-score → refer/clear pipeline is unchanged.
2. **No extra photo.** A short questionnaire is allowed. (It was built and tested, then dropped on 25 Oct 2026; see §3.7.)
3. **Every statement must come from a real dataset or an official guideline**, never from an
   AI-generated answer.

---

## 1. What the feature does

As deployed (since 26 Oct 2026). **One new, optional input**: diet type, asked on the child's details screen.

```
EXISTING PIPELINE (unchanged)
photo + age + sex + weight ──► MUAC ──► MUAC-for-age z-score ──► normal / at risk / moderate / severe
                                                                           │
age + sex (+ diet, optional)                                               │
   │                                                                       ▼
   └──► HOW COMMON each of 7 deficiencies is ──────────────────► FOOD PLAN
        CNNS 2016-18 rates for the child's age, sex (and diet)     severe   → refer now, no diet plan
        flag if ≥ 20 in 100 (WHO public-health level)               moderate → where to get extra food, by age
                                                                               (Anganwadi < 6 y, school meal 6–14 y,
                                                                               health centre) + the plan
                                                                    others   → the plan
                                                                    plan = ICMR-NIN daily grams (Annexure V)
                                                                         + ONE menu: a food per slot chosen for all
                                                                           flagged nutrients together (IFCT 2017)
                                                                         + what the menu gives + advice lines
```

**Outputs for each child:**
- The ICMR-NIN daily plan for their age and sex: grams of 9 food groups, energy, protein. For a moderate result, the note that this plan is for normal growth and a malnourished child needs extra food on top.
- How common each of 7 deficiencies is in Indian children of this age, sex (and diet): anaemia, iron, vitamin D, zinc, vitamin A, folate, B12, each traced to its CNNS rows. The screen says this is not a test of this child and does not depend on the arm size.
- Today's menu: one common Indian food for each part of the plan (millet share, pulses, greens, vegetables, roots, fruit, nuts/seeds, milk, and for egg / non-veg diets an egg, meat or fish instead of 30 g of pulses), with two alternatives each for other days.
- For each flagged nutrient: how much the menu gives, and the guideline's advice line.
- A general note to limit high fat, sugar and salt foods (DGI 2024 Guideline 15).

The original design (§3.5–3.6 as built on 16 Oct) also had an 11-question questionnaire: diet type, urban/rural, state,
vitamin-D supplement and 7 "ate yesterday?" questions. The engine in `india_risk.py` still accepts those inputs; `food_plan.py` no longer passes them.

---

## 2. Datasets

| Dataset | Origin | What it gave us | Access | Files |
|---|---|---|---|---|
| **CNNS 2016–18 National Report** | India (MoHFW, UNICEF, Population Council, 2019), ages 0–19 | Deficiency **rates** for 7 nutrients by age sub-group, sex, diet type, urban/rural, state (and more). These are blood-test results on Indian children. | Free PDF (`dataset/micronutrieints.pdf`) | `data/cnns/cnns_prevalence.csv` |
| **NHANES 2011–2023** | USA (CDC), 5 survey cycles | **Individual** children with blood tests, MUAC, weight, yesterday's diet and supplements, used to learn what a questionnaire can predict | Free download, no registration | `data/nhanes/raw/` (≈0.6 GB) |
| **IFCT 2017** | India (ICMR-NIN) | Nutrient content of 542 Indian foods | Free (GitHub `nodef/ifct2017`, AGPL-3.0 packaging of NIN data) | `data/ifct2017/` |
| **Dietary Guidelines for Indians 2024** | India (ICMR-NIN) | Daily food-group grams per age/sex (Annexure V); dietary rules | Free PDF from NIN | `data/icmr_nin_rda/` |
| ICMR-NIN RDA brief note 2020 | India | Energy and protein requirements (cross-check) | Free PDF | `data/icmr_nin_rda/brief_note.pdf` |

**Not used:**
- **CNNS unit-level data:** needs a formal request. The extension works without it (§6).
- **NFHS-5:** CNNS already covers anaemia at all ages.
- **Image-based anaemia datasets:** ruled out by "no extra photo".
- **ICMR-NIN full RDA book (₹400):** the free DGI 2024 Annexure V already gives a daily plan designed to meet the RDA.

---

## 3. Step by step: what was done and what came out

### 3.1 CNNS report tables → CSV (`cnns_extract.py`)

- **Tables extracted:** 18 tables from the 317-page report. Tables 6.1–6.6 cover anaemia and iron; 7.1–7.6 cover vitamins A and D and zinc; 7.7–7.12 cover B12 and folate. Each group is given by background characteristics and by state, for ages 1–4, 5–9 and 10–19.
- **Result:** **1,365 values**. Row counts match the report exactly (e.g. 30 states + India = 31 rows).
- **Self-checks:**
  - Every "Total" row equals the matching state table's "India" row: **0 mismatches**.
  - 8 values checked by hand against the PDF: **all match**.
  - 10 cells are blank because the report suppresses groups with N < 50.

National deficiency rates (CNNS, %):

| | 1–4 y | 5–9 y | 10–19 y |
|---|---|---|---|
| Anaemia | 40.5 | 23.5 | 28.4 |
| Iron deficiency | 31.9 | 17.0 | 21.5 |
| Vitamin D deficiency | 13.8 | 18.2 | 23.9 |
| Zinc deficiency | 18.9 | 16.8 | 31.7 |
| Vitamin A deficiency | 17.6 | 21.5 | 15.6 |
| Folate deficiency | 23.3 | 28.2 | 36.7 |
| Vitamin B12 deficiency | 13.8 | 17.2 | 30.9 |

### 3.2 NHANES analysis table (`nhanes_build.py`)

**Cohort:**
- **18,924 children aged 1–19** from 2011-12, 2013-14, 2015-16, 2017-18 and 2021-23. The 2017–2020 pre-pandemic files are not used because they overlap 2017-18.
- **12,973 have every input the app also has:** weight, MUAC (MUAC-for-age is defined up to 228 months) and a complete day-1 diet recall.

**Inputs:**
- **Height is deliberately excluded:** the app never asks for it.
- **MUAC-for-age z-score:** computed with the main project's own `tools/who_zscore.py`.
- **Yesterday's food groups:** every recall food code is mapped to the 10 food groups CNNS asked about, using the USDA food-code structure. Exclusions: infant formula and juices are left out, and "refried" doesn't count as fried.
- **Supplements:** any supplement; iron supplement; supplement containing vitamin D.
- **Data quirk fixed:** the NHANES file format stores zero as 5.4×10⁻⁷⁹. These are restored to true zeros (the first build had wrongly shown "100% take supplements").

**Deficiency labels use CNNS's own cut-offs**, so "deficient" means the same in both datasets:

| Label | Cut-off | Children | Deficient |
|---|---|---|---|
| Anaemia | Hb < 11.0 / 11.5 / 12.0 / 13.0 g/dL by age and sex (WHO 2011) | 10,684 | 634 (5.9%) |
| Iron deficiency | ferritin < 12 µg/L (< 5 y), < 15 (≥ 5 y); CRP > 5 mg/L excluded | 2,429 | 285 (11.7%) |
| Vitamin D deficiency | 25(OH)D < 30 nmol/L (12 ng/mL) | 10,312 | 474 (4.6%) |
| Zinc deficiency | IZiNCG by sampling session and fasting (CNNS uses the morning values) | 1,797 | 159 (8.8%) |
| Vitamin A deficiency | retinol < 20 µg/dL; CRP > 5 excluded | 1,379 | **6** |
| Folate deficiency | RBC folate < 151 ng/mL | 9,809 | **14** |
| B12 deficiency | serum B12 < 203 pg/mL | **1** | 0 |

**What NHANES can and can't support:**
- It can support models for **anaemia, iron, vitamin D and zinc**.
- **Vitamin A, folate and B12 have almost no deficient US children.** The likely reason is US food fortification. These three come from CNNS only.

### 3.3 Can a short questionnaire predict a deficiency? (`train_eval.py`)

**Protocol (same as the main project):**
- 20 paired stratified 75/25 splits.
- Every configuration is compared with an **age band × sex baseline**.
- Paired comparisons use the Wilcoxon signed-rank test.
- The model is L2 logistic regression with its penalty chosen by inner cross-validation.

AUROC (mean of 20 splits) and gain over age + sex:

| Inputs | Anaemia | Iron | Vitamin D | Zinc |
|---|---|---|---|---|
| age + sex (baseline) | 0.679 | 0.701 | 0.724 | 0.537 |
| + body (MACZ, weight) | 0.676 (−0.003) | 0.704 (+0.002) | 0.733 (+0.010, 19/20) | 0.533 |
| + yesterday's food groups | 0.681 (+0.002) | 0.707 (+0.005) | 0.762 (+0.039, 20/20) | 0.508 (**−0.029**) |
| + supplements | 0.685 (+0.005, p = 0.027) | 0.705 (+0.004) | **0.777 (+0.053, 20/20)** | 0.510 (−0.027) |
| gradient boosting, all inputs | 0.703 (+0.024) | 0.711 (+0.009) | 0.772 (+0.048) | 0.508 |

**Findings:**
- **Only vitamin D is predicted clearly better by the questionnaire.** Anaemia gains less than 0.01. Iron gains nothing significant. Zinc is close to chance (0.54), and adding diet makes it *worse* (overfitting).
- **The MUAC estimate from the app is good enough.** Models were trained on tape-measured MUAC. When test-set MUAC is replaced by a simulated app estimate, AUROC changes by < 0.005 for every nutrient. The simulation uses the real out-of-fold errors of the shipped MUAC model, including its shrinkage toward the mean (`muac_app_residuals.py`): average error 1.098 cm, which reproduces the published 1.09 cm.
- **Selection rule (disclosed):**
  - First run: a block of questions was kept if it beat the current model with p < 0.05. That kept "+supplements" for anaemia on a +0.005 gain, and the signs were implausible: iron supplements appeared to *raise* anaemia risk (reverse causation: anaemic children are the ones given iron).
  - The rule was then tightened to **p < 0.05 and a gain of at least 0.01 AUROC**. This tightening was decided *after* seeing the results. Both selections are saved in `results/deficiency_eval_summary.csv`.

### 3.4 Does it transfer to Indian children? (`india_checks.py`, `supplement_effect.py`)

The vitamin D model's strongest signals turned out to be **US-specific**:

| Signal | Effect | Why it does not transfer |
|---|---|---|
| Milk yesterday | lower risk | US milk is vitamin-D-fortified by regulation; most Indian milk is not |
| "Any supplement" | OR 0.50 | US child supplements are mostly multivitamins with vitamin D; India's common child supplement (IFA) has none |
| Heavier body weight | higher risk | adiposity effect in a population with high child obesity |
| Fish yesterday | OR 1.20 (higher risk) | biologically implausible; a US fish-product artefact |

**Direction check.** Do the two countries agree on whether animal-source food lowers deficiency?
- **NHANES:** odds ratio for eating egg/fish/meat yesterday, adjusted for age × sex, with a bootstrap 95% CI.
- **CNNS:** odds ratio for non-vegetarian vs vegetarian.

| | CNNS (India) non-veg vs veg | NHANES (USA) animal food yesterday | Verdict |
|---|---|---|---|
| Anaemia | 0.79 / 1.06 / 0.86 (1–4 / 5–9 / 10–19 y) | 1.22 [1.00–1.49] | **opposite** in 2 of 3 age groups |
| Iron | 0.90 / 0.79 / 0.81 | 0.75 [0.56–1.01] | NHANES not significant |
| Vitamin D | **0.48 / 0.63 / 0.72** | 0.89 [0.72–1.11] | India clear, USA no effect |
| Zinc | 0.86 / 0.97 / 1.10 | 1.19 [0.76–1.77] | NHANES not significant |

**Conclusion:** US food effects should **not** be used to score Indian children. Diet type is taken from CNNS, which is Indian data, instead.

**The one individual effect that does transfer: a supplement that contains vitamin D.** It works by the same physiology everywhere.
- Odds ratio **0.30 (95% CI 0.21–0.41)**, adjusted for age × sex.
- AUROC 0.724 → **0.747** (+0.023, better on 20/20 splits, p = 1.9×10⁻⁶).
- That's most of the full US model's India-transferable gain (+0.028) from a single question.

### 3.5 The final risk layer (`india_risk.py`, `combination_shrinkage.py`)

**How a child's risk is built:**
- For each nutrient, the CNNS rates that apply to the child are combined on the log-odds scale: age sub-group, sex, urban/rural, diet type and state.

      logit(risk) = logit(national rate) + λ · Σ [logit(group rate) − logit(national rate)]

- For vitamin D, if the child takes a vitamin-D supplement: `logit(risk) += log(0.30)`.
- A nutrient is **flagged at risk ≥ 20%**, the WHO threshold at which a deficiency is a "moderate" public-health problem (WHO 2011 anaemia; WHO 2009 vitamin A).
- Children under 12 months get no estimate, because CNNS starts at 1 year.

**Is combining one-way rates valid?** CNNS publishes only one-way tables, so this was tested on NHANES, where the true cross-tabs exist:

| Test | Combined estimate: error | Age-group rate alone: error |
|---|---|---|
| Weakly related factors (sex, supplement, animal food), cells n ≥ 50 | **0.45–2.05 pp** | 1.80–4.07 pp |
| Correlated factors (adds race/ethnicity and income tertile, which are associated with each other, like state and diet), 232 cells n ≥ 30 | **1.83–3.63 pp** with λ = 0.89 | 1.97–5.85 pp (zinc, 3 cells: 1.97 vs 2.51 combined) |

**Fitting λ:**
- λ was fitted on anaemia + vitamin D and tested on iron + zinc, then the other way round. The fitted values were 0.89 and 0.94, and shrinking improved the held-out half both times. The final value is λ = 0.888.
- Why it was needed: without λ, an urban vegetarian girl in Punjab came out at 87% vitamin D risk, because Punjab's rate already contains its vegetarian share. With λ she is at 83%.
- That 83% is supported by CNNS: Punjab adolescents measured **68%** deficient, and both female (34% vs 14% for boys) and urban (33% vs 21%) raise it.
- Zinc had only 3 test cells, and there the combination was slightly worse than the age-group rate (2.5 vs 2.0 pp).

### 3.6 The food plan (`food_plan.py`)

**Severity** comes from the main pipeline's MUAC-for-age category:

| Category | What the app says |
|---|---|
| Severe (z < −3) | **Refer now** to a health facility. No home diet plan; severe acute malnutrition needs facility or therapeutic-food treatment (WHO 2013). |
| Moderate (−3 ≤ z < −2) | Contact the **Anganwadi / ICDS** centre for supplementary nutrition, plus the daily plan |
| At risk / normal | The daily plan |

**Daily plan:**
- Comes from ICMR-NIN *Dietary Guidelines for Indians 2024*, **Annexure V** (PDF p.146), transcribed to `dgi2024_annexure5_children.csv`.
- It gives grams per day of cereals/millets, pulses, green leafy vegetables, other vegetables, roots and tubers, fruits, nuts, milk/curd and oil, plus energy and protein.
- Rows: 7–12 months, 1–3, 4–6 and 7–9 years, then boys and girls separately for 10–12, 13–15 and 16–18 years.
- Non-vegetarians may swap 30 g of pulses for meat or fish (Annexure V footnote).

**Targeted foods.** For each flagged nutrient, the engine finds the Indian foods (IFCT 2017) to choose for each food group's allowance, e.g. *"horse gram as the day's 60 g of pulses → 5.3 mg iron"*.
- **Allowances:**
  - cereals: only the 20% millet share (Annexure V footnote), so only millets are suggested there: the Government of India's Nutri-Cereals (Gazette notification, 10 April 2018) that IFCT lists — jowar, bajra, ragi, samai (little millet), varagu (kodo millet), amaranth. Rice, wheat, maize and barley are not.
  - milk group: liquid milk, curd and buttermilk only, since the allowance is in ml
  - egg: one whole boiled egg, 50 g (DGI Table 2.1)
  - meat/fish: 30 g (the pulse swap)
- **Diet:** every child is assumed non-vegetarian, so egg, meat and fish are included (§3.7).
- **Common foods only:** a food must have been sampled in **at least 5 of IFCT 2017's 6 regions** (IFCT column "No. of Regions"). This removes foods like shiitake, quinoa, black amaranth seed and red-stem gogu leaves (1 region each).
- **Not suggested:**
  - beef and pork (not widely eaten in India)
  - dried vegetables, fruits and mushrooms (allowances are fresh weight)
  - tamarind (a condiment)
  - rarely eaten organ parts: spleen, brain, lungs, kidney, heart, tripe (liver is kept)
- **Vitamin D:**
  - IFCT 2017 reports vitamin D2 in cereals and millets (e.g. ragi 41 µg/100 g), which other food tables don't show.
  - DGI names sunlight as the main source.
  - So vitamin D food suggestions are limited to fish, eggs, milk and mushrooms, and sunlight advice comes first.
- **B12:** IFCT has no B12 column, so the app gives the DGI rule only (curd, eggs, flesh foods).

**Rules quoted from DGI 2024 (PDF pages):**
- p.36: vitamin C fruits with plant iron; no tea with meals; folate sources.
- p.30: B12 sources.
- pp.30, 34: sunlight for vitamin D.
- Guideline 15: limit high-fat/sugar/salt foods.

**Example** (full output in `results/example_food_plans.txt`): a 12.5-year-old girl, MUAC 17.5 cm.
- **Screening:** z = −2.46 → MODERATE → contact the Anganwadi centre, plus the 10–12 y girls' plan (2,000 kcal, 71 g protein).
- **Flagged** (CNNS rates for girls of her age): anaemia 34%, iron 27%, vitamin D 34%, zinc 29%, folate 34%, B12 25% (vitamin A 18%, not flagged).
- **Iron foods:** cluster beans (200 g → 7.8 mg), horse gram (80 g → 7.0 mg), niger seeds, beetroot leaves, amaranth seed. Advice: vitamin C fruit with these, no tea with meals.
- **Vitamin D:** sunlight first; then milk, fish (chakla, catla) and one boiled egg.
- **Zinc:** soya bean, gingelly seeds, baby corn, goat meat, bajra.
- **Folate:** moth bean, field beans, colocasia leaves, beetroot, mango.

**Coverage test:** every age from 6 to 228 months × both sexes × 3 severity levels:
1,338 runs, 0 errors (§8).

### 3.7 Simplification: no questions (25 Oct 2026)

**Decision (project team):** the extension is a prototype feature, so it should not add any screen of questions.
Every child is assumed non-vegetarian.

**Why this is supported by the results above:** the questionnaire carried little individual information (§3.3).
The "ate yesterday?" questions never fed the deployed risk at all; they only produced a "missed yesterday" note.
Diet type, state, urban/rural and the vitamin-D supplement did shift the CNNS rates, but CNNS's own age × sex rates
are the honest default when those answers are unknown.

**What changed in `food_plan.py`:**

| | Before (16 Oct) | Now (25 Oct) |
|---|---|---|
| New inputs | 11 questions | none |
| Risk | age, sex, diet, residence, state, vitamin-D supplement | age and sex (CNNS) |
| Diet | asked; foods filtered by it | assumed non-veg; output says so |
| Foods | any IFCT food (e.g. shiitake, quinoa, parsley) | sampled in ≥ 5 of 6 IFCT regions; millets only for the millet share; boiled egg; no beef/pork |
| Notes | "missed yesterday", fried food / soft drink if eaten | general "limit high fat, sugar, salt" note for everyone |
| Coverage | 4,014 runs (× 3 diets) | 1,338 runs, 0 errors |

**Cost:** every child of the same age and sex gets the same flagged nutrients. The daily plan still changes with age
and sex, and the severity message still comes from the photo. A vegetarian family will see egg/meat/fish
suggestions; the plant foods in each list still apply to them.

### 3.8 Second revision after a design critique (26 Oct 2026)

A critique of the 25 Oct design found these problems. The fixes were agreed with the project team.

| Problem | Fix |
|---|---|
| Our own Indian data says diet matters (CNNS non-veg vs veg vitamin D OR 0.48–0.72), yet the diet question was removed; vegetarian families got egg/meat/fish advice | **One optional diet question** (veg / veg + egg / non-veg) on the details screen. Answered: CNNS diet rates join the combination and foods are filtered by diet. Skipped: as on 25 Oct (non-veg foods, all-children rates). |
| Each nutrient had its own food list, so the same 60 g of pulses was horse gram for iron, moth bean for folate and soya for zinc at once; one food filled a whole group every day | **One combined daily menu.** For each Annexure V slot, the food with the highest score Σ over flagged measures of amount ÷ best amount in that slot (each measure counts 0–1, so units don't matter), and the next two as alternatives for other days. Egg / non-veg diets get a swap slot: an egg, meat or fish instead of 30 g of pulses ("for non-vegetarians, 30 g of pulses may be substituted with meat or eggs", DGI 2024). The screen shows what the menu's first choices give of each flagged nutrient. |
| "Risk" read like a statement about this child; 20 % used as a per-child cut-off | Relabelled "how common at this age in India"; 20 in 100 explained as WHO's public-health level; the screen says it is not a test of this child. |
| The deficiency list ignores malnutrition status | **Not fixable with available data:** the CNNS report has no deficiency tables by stunting, wasting or MUAC (searched the whole report). Stated on screen instead, with our own evidence: in NHANES, body size (MACZ, weight) added < 0.01 AUROC to age × sex (§3.3). Caveat: few US children are undernourished. |
| Annexure V is for children growing normally, but moderate cases got it as is | Moderate results now say the plan is for normal growth and a malnourished child needs extra on top, and say where to get it by age: Anganwadi supplementary nutrition for 6 months–6 years (NFSA 2013 Schedule II, revised January 2023 — the revised amounts are not quoted), school midday meal (PM POSHAN) for 6–14 years, the health centre for all. Moderate under 6 months adds "have the baby checked". |
| "Not sure — measure by hand" children got a plan with no warning | The app shows "measure the arm by hand first; this plan uses the photo estimate" above the plan. (App only: the Python engine has no "not sure" state.) |
| Lab names ("Goat, chops", "Mango, ripe, banganapalli") | Plain names in `data/ifct2017/display_names.csv` for all 57 foods the menu can ever suggest (checked by `coverage_sweep.py`); the IFCT name stays in small print for traceability. |
| Dry dates and mustard seeds slipped through | The "no dried forms" rule now also catches "dry"; mustard seeds excluded as a condiment, like tamarind. |
| No child targets ("7.8 mg of the X mg needed") | **Not done:** child RDA/EAR values are only in the paid ICMR-NIN RDA 2020 book (the free brief note has adults only). Amounts are shown without a target. |
| Long, text-heavy screen; old records silently showed new advice | Sources fold away until tapped; the speak button reads the action and today's foods; the food-plan tables carry a version stamp shown on screen. |

**Example** (`results/example_food_plans.txt`): a 4-year-old vegetarian girl, at risk. Flagged: anaemia 29, iron 23,
zinc 20, folate 21 in 100. Menu: bajra 32 g (millet share), soya bean 60 g, colocasia leaves 50 g, spring onion
100 g, beetroot 50 g, mango 75 g, black sesame 15 g, buffalo milk 350 ml; it gives about 15 mg iron, 7 mg zinc
and 490 µg folate. No egg/meat/fish swap, because the diet is vegetarian.

---

## 4. Scoreboard: what worked and what didn't

| | Result |
|---|---|
| ✅ CNNS report turned into a validated dataset | 1,365 values, 0 mismatches, 8/8 hand checks |
| ✅ Labels harmonised between India and USA | CNNS cut-offs applied to NHANES, incl. CRP exclusion and zinc session/fasting rules |
| ✅ Questionnaire predicts vitamin D | +0.053 AUROC (US inputs), +0.028 (India-transferable inputs), 20/20 splits |
| ✅ Vitamin-D supplement effect | OR 0.30 [0.21–0.41], +0.023 AUROC, 20/20 |
| ✅ Combining one-way rates validated | 0.5–3.6 pp error vs 1.8–5.9 pp without, with a fitted shrinkage |
| ✅ App's MUAC estimate is good enough | < 0.005 AUROC change vs tape-measured MUAC |
| ❌ Questionnaire predicts anaemia | +0.005, below the 0.01 bar; implausible signs |
| ❌ Questionnaire predicts iron | no significant gain |
| ❌ Questionnaire predicts zinc | baseline 0.54; diet questions make it worse |
| ❌ US diet effects transfer to India | directions disagree or vanish (§3.4) |
| ❌ NHANES models for vitamin A, folate, B12 | 6, 14 and 1 deficient children; not trainable |
| ⚠️ Gradient boosting beats logistic for anaemia (+0.024) | not used: the gain is an age/sex pattern of US data, which CNNS replaces |

**The research finding in one sentence:** a short dietary questionnaire carries little
individual-level information about micronutrient status. Where it does carry information
(vitamin D), the strongest signals are country-specific (fortification, supplement composition).
So an Indian screening tool should take its deficiency risk from Indian survey data and apply
only effects that are physiologically transferable.

---

## 5. Limitations (state these in any report)

1. **No validation on individual Indian children.** CNNS unit-level data was not obtained. The CNNS layer is validated only indirectly: the combination method on NHANES cross-tabs, and every value traced to the report.
2. **Group rates, not a diagnosis.** A risk of 35% means "35% of children like this one are deficient". The app must say "likely, please confirm with a blood test", and does.
3. **Independence assumption.** The one-way CNNS rates are combined with a shrinkage fitted on US data (λ = 0.89). Indian factors may be more strongly correlated. Since 25 Oct at most three rates are combined (age sub-group, sex, and diet when answered), so this matters less.
4. **The vitamin-D supplement effect is from US children** (observational, adjusted only for age × sex). It's kept because the mechanism is physiological, but it isn't an Indian trial result. Not used since 25 Oct: there is no supplement question.
5. **CNNS is from 2016–18.** Rates may have changed since.
6. **No child-specific micronutrient targets.** The ICMR-NIN full RDA book (paid) was not used, so the menu's amounts ("15 mg iron") are shown without a target. The plan relies on Annexure V, which ICMR-NIN designed to meet daily requirements.
7. **IFCT oddities.** Plant vitamin D2 values (excluded) and mushroom vitamin D vary in the literature. (Mushrooms are no longer suggested: IFCT sampled them in at most 2 regions.)
8. **Severity thresholds** reuse the main pipeline's MUAC-for-age categories. The moderate-case advice (Anganwadi, school meal, health centre) is programme guidance, not a calorie prescription: the NFSA Schedule II amounts were revised in 2023 and are not quoted, and DGI 2024 gives extra-calorie tables only for undernourished *pregnant women*, not children.
9. **Non-vegetarian assumption when the diet question is skipped.** Then vegetarian families see egg, meat and fish suggestions they cannot use; the plant foods still apply.
10. **The deficiency list does not depend on malnutrition status.** The CNNS report publishes no deficiency rates by stunting, wasting or MUAC, so two children of the same age, sex and diet get the same flags whatever their arm size. The supporting evidence that body size predicts little (< 0.01 AUROC) is from US children, few of whom are undernourished. State and residence are not asked either.
11. **"Common" is a proxy.** Being sampled in ≥ 5 of IFCT's 6 regions means a food is widely available, not that a given family eats it or can afford it. Beef and pork are excluded by our judgment (not widely eaten in India), not by a dataset.
12. **The menu score is a design choice.** Every flagged nutrient counts equally (0–1 each); bioavailability (phytates, haem vs non-haem iron), cooking losses (IFCT values are raw), cost and season are ignored, apart from the guideline's vitamin C / tea advice. Because each slot's allowance only scales all candidates alike, the chosen foods depend on the flagged set and the diet, not on the exact age.
13. **Wording written by the team.** The plain food names (57 foods) and the Hindi, Kannada, Tamil and Telugu text in the app were written by the project, not taken from a source, and still need a native-speaker review. Local food names are IFCT's own, in Latin script.

---

## 6. If CNNS unit-level data is obtained later

Request it from MoHFW / UNICEF India / Population Council (the report credits all three). Then:
1. Re-run `train_eval.py` on Indian children with the same ladder. Questions answerable in CNNS: diet type, weekly food groups, residence, state.
2. Use NHANES as the second population, the way ARAN was used in the main project.
3. Replace the one-way combination with a model fitted on individual Indian children, and compare.

---

## 7. Files and how to reproduce

Run from the project root with `.venv-cv\Scripts\python.exe`, in this order:

| Step | Script | Output |
|---|---|---|
| 1 | `nutrition_ext/scripts/nhanes_probe.py` | which NHANES files exist per cycle (no download) |
| 2 | `nutrition_ext/scripts/nhanes_download.py` | `data/nhanes/raw/<cycle>/*.xpt` (HSCRP and FASTQX were fetched the same way afterwards) |
| 3 | `nutrition_ext/scripts/nhanes_inventory.py` | first count of labelled children (early cut-offs; superseded by step 5) |
| 4 | `nutrition_ext/scripts/cnns_extract.py` | `data/cnns/cnns_prevalence.csv` + self-checks |
| 5 | `nutrition_ext/scripts/nhanes_build.py` | `data/nhanes/nhanes_analysis.csv` |
| 6 | `nutrition_ext/scripts/muac_app_residuals.py` | `data/muac_app_residuals.csv` (shipped MUAC model's real errors) |
| 7 | `nutrition_ext/scripts/train_eval.py` | `results/deficiency_eval_*.csv`, `models/deficiency_*.json` |
| 8 | `nutrition_ext/scripts/india_checks.py` | `results/check_combination.csv`, `check_direction.csv`, `vitD_model_odds_ratios.csv` |
| 9 | `nutrition_ext/scripts/supplement_effect.py` | `models/vitD_supplement_effect.json` |
| 10 | `nutrition_ext/scripts/combination_shrinkage.py` | `models/combination_shrinkage.json`, `results/check_combination_correlated.csv` |
| 11 | `nutrition_ext/scripts/india_risk.py` | risk module (prints an example) |
| 12 | `nutrition_ext/scripts/food_plan.py` | food-plan engine; `results/example_food_plans.txt` |
| 13 | `nutrition_ext/scripts/coverage_sweep.py` | runs the engine over every age × sex × diet answer × severity |
| app | `Nutrivison_App/scripts/make-nutrition-tables.py`, then `npm run verify:nutrition` | exports the tables + fixture to the app; checks the app's TypeScript against this engine |

The exported models are plain JSON (feature list, means, scales, coefficients, intercept), like the
main project's MUAC calibration JSON. Rebuilding each model from the JSON matches scikit-learn's
predictions to < 3×10⁻¹⁷.

**What the app needs:** one optional input. `food_plan()` takes age (months), sex, the app's MUAC estimate and,
if answered, diet type (veg / veg + egg / non-veg). (The 16 Oct design needed an 11-question questionnaire; it was
dropped on 25 Oct, §3.7, and the diet question alone came back on 26 Oct, §3.8.)

---

## 8. Coverage test result

`nutrition_ext/scripts/coverage_sweep.py` ran the whole food-plan engine for every age 6–228
months × both sexes × 4 diet answers (not asked, veg, veg + egg, non-veg) × 4 severities (MUAC set to a
z-score of 0, −1.5, −2.5 and −3.5). Re-run 26 Oct 2026 after the second revision (§3.8):

- **7,136 runs, 0 errors.**
- 1,784 normal → plan, 1,784 at risk → plan, 1,784 severe → referral only (no plan); moderate → Anganwadi
  (528, under 6 y), school meal (768, 6–14 y) or health centre (488, 14–19 y).
- Every flagged nutrient gets at least one menu food (B12 is rule-only by design).
- Ages 6–11 months get the infant row of Annexure V and no deficiency estimate (CNNS starts at 1 year).
- Across all children and diets the menu can suggest 57 different foods, all with a plain display name.

The app's TypeScript reproduces this engine exactly: `npm run verify:nutrition` replays 1,808 cases (every age
3–228 months × sex × diet answer) and 42,966 menu foods with zero difference in score and totals.

(Earlier runs: 16 Oct, 4,014 runs with the questionnaire; 25 Oct, 1,338 runs with no questions; both 0 errors.)
