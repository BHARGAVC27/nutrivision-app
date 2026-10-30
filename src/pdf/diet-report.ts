import { dietPlan, FOOD_GROUPS, type DietPlan, type FoodGroup } from '@/diet/plan';
import { DIET, type DietStrings } from '@/diet/strings';
import { EXTRA, STR, type LangCode, type Strings } from '@/i18n/strings';
import { amountsFrom } from '@/nutrition/amounts';
import { FLAG_AT, foodPlanForAmounts, type Diet, type Nutrient, type SlotId } from '@/nutrition/plan';
import type { DecisionKey } from '@/pipeline/decide';
import type { MaczCategory, Sex } from '@/pipeline/zscore';
import { colors, decisionColors } from '@/ui/theme';

/**
 * The diet-plan page of the shared PDF report — print only; the in-app
 * screen (`app/diet.tsx`) stays deliberately plain.
 *
 * Every picture is inline SVG drawn here: the report is built offline and
 * Android's print engine cannot load files, so there are no image assets.
 * The numbers are the same `dietPlan()` the screen uses. Kept free of native
 * imports so `scripts/preview-diet-report.ts` can render it on a desktop.
 */

export type DietReportInput = {
  name: string;
  ageMonths: number;
  sex: Sex;
  weightKg: number;
  decision: DecisionKey;
  category: MaczCategory;
  /** Diet answer from the details screen; null = not asked (the menu then assumes non-veg). */
  diet: Diet | null;
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** One colour per food group — warm, food-like, distinct from the red/amber/green decision colours. */
const GROUP_COLOR: Record<FoodGroup, string> = {
  cereals_millets: '#D49A2A',
  pulses_beans: '#C8692E',
  milk_curd: '#5B8DB8',
  egg_meat_fish: '#B4543A',
  green_leafy_veg: '#3C8A4E',
  other_veg_roots: '#E07B2E',
  fruits: '#D9443F',
  nuts_oilseeds: '#8C5A33',
  ghee_oil: '#E3B21C',
  sugar_junk: '#8A8279',
};

/** Flat food illustrations, 48×48. */
const ICON: Record<FoodGroup, string> = {
  cereals_millets: `
    <path d="M24 8c-1 6-1 12 0 18M24 14c-4-2-7-1-8 1 3 1 6 1 8-1zm0 0c4-2 7-1 8 1-3 1-6 1-8-1zm0 6c-4-2-7-1-8 1 3 1 6 1 8-1zm0 0c4-2 7-1 8 1-3 1-6 1-8-1z" fill="#E9C46A" stroke="#B07F1A" stroke-width="1.2"/>
    <path d="M7 27h34c0 8-7.6 13-17 13S7 35 7 27z" fill="#D49A2A"/><path d="M7 27h34" stroke="#8A5F12" stroke-width="2"/>
    <ellipse cx="24" cy="27" rx="15" ry="2.5" fill="#F6E3B0"/>`,
  pulses_beans: `
    <path d="M7 24h34c0 9-7.6 15-17 15S7 33 7 24z" fill="#9C4F22"/>
    <ellipse cx="24" cy="24" rx="17" ry="4.5" fill="#F0A13A"/>
    <circle cx="17" cy="23" r="1.6" fill="#C8692E"/><circle cx="23" cy="25" r="1.6" fill="#C8692E"/><circle cx="29" cy="23" r="1.6" fill="#C8692E"/><circle cx="33" cy="25" r="1.4" fill="#C8692E"/><circle cx="20" cy="26" r="1.3" fill="#C8692E"/>
    <path d="M30 10c3 3 3 7 0 10M25 12c2 2 2 5 0 7" stroke="#C9B9A6" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  milk_curd: `
    <path d="M15 9h18l-2.5 31h-13z" fill="#EAF2F9" stroke="#5B8DB8" stroke-width="1.6"/>
    <path d="M16.1 20h15.8l-1.4 20h-13z" fill="#FFFFFF"/>
    <path d="M16.1 20c3 2 6 -2 9 0s5 1 5.8 0" stroke="#5B8DB8" stroke-width="1.4" fill="none"/>
    <circle cx="36" cy="34" r="6" fill="#F4F1EA" stroke="#5B8DB8" stroke-width="1.4"/><path d="M31 33h10" stroke="#5B8DB8" stroke-width="1.2"/>`,
  egg_meat_fish: `
    <path d="M18 8c6 0 10 9 10 15s-4.5 10-10 10S8 29 8 23s4-15 10-15z" fill="#FFF6E6" stroke="#C9A77A" stroke-width="1.4"/>
    <circle cx="18" cy="24" r="4.5" fill="#F2A900"/>
    <path d="M24 34c4-5 12-5 16 0-4 5-12 5-16 0z" fill="#B4543A"/><path d="M40 34l5-4v8z" fill="#B4543A"/><circle cx="28" cy="33" r="1" fill="#fff"/>`,
  green_leafy_veg: `
    <path d="M24 42C10 34 8 18 18 8c4 10 8 18 6 34z" fill="#3C8A4E"/>
    <path d="M24 42c14-8 16-24 6-34-4 10-8 18-6 34z" fill="#5FAE5E"/>
    <path d="M24 42c-1-10-3-20-6-30M24 42c1-10 3-20 6-30" stroke="#1F5A30" stroke-width="1.2" fill="none"/>`,
  other_veg_roots: `
    <path d="M30 14L14 42c-1 2 1 3 3 2l18-24z" fill="#E07B2E"/>
    <path d="M20 30l4 1M17 36l4 1M24 24l3 1" stroke="#B85B16" stroke-width="1.2"/>
    <path d="M31 15c2-5 6-7 10-6-2 3-5 5-10 6zm0 0c-1-5 0-9 3-11 1 4 0 8-3 11zm0 0c4-1 8 0 10 3-4 1-7 0-10-3z" fill="#3C8A4E"/>`,
  fruits: `
    <path d="M24 15c-4-3-14-3-15 8-1 9 6 18 11 18 2 0 3-1 4-1s2 1 4 1c5 0 12-9 11-18-1-11-11-11-15-8z" fill="#D9443F"/>
    <path d="M24 15c0-4 1-7 3-9" stroke="#6B4423" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M26 11c3-4 8-4 10-2-3 3-7 3-10 2z" fill="#5FAE5E"/>
    <ellipse cx="16" cy="22" rx="2.5" ry="4" fill="#F28B86" opacity="0.8"/>`,
  nuts_oilseeds: `
    <path d="M16 10c6-2 11 3 10 8-1 3 1 5 3 7 4 4 3 12-4 14-6 2-11-3-10-8 1-3-1-5-3-7-4-4-2-12 4-14z" fill="#C9955E" stroke="#8C5A33" stroke-width="1.4"/>
    <path d="M14 16c2 1 4 1 6 0M20 30c2 1 4 1 6 0M17 22c2 1 4 1 6 0" stroke="#8C5A33" stroke-width="1" fill="none"/>
    <circle cx="36" cy="14" r="3" fill="#8C5A33"/><circle cx="40" cy="20" r="2.4" fill="#A0703C"/>`,
  ghee_oil: `
    <path d="M24 6C19 15 13 21 13 29a11 11 0 0 0 22 0c0-8-6-14-11-23z" fill="#E3B21C"/>
    <path d="M19 28c0 3 2 6 5 6" stroke="#FFF3C4" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  sugar_junk: `
    <rect x="13" y="18" width="22" height="13" rx="3" fill="#C9C2B8"/>
    <path d="M13 24.5l-7-5v10zM35 24.5l7-5v10z" fill="#ADA59A"/>
    <circle cx="24" cy="24.5" r="17" fill="none" stroke="#C0392B" stroke-width="3"/>
    <path d="M12 12.5l24 24" stroke="#C0392B" stroke-width="3"/>`,
};

const svg = (inner: string, size = 40) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}">${inner}</svg>`;

const TILE_ICON = {
  energy: `<path d="M24 5c2 8 12 12 12 24a12 12 0 0 1-24 0c0-6 3-9 5-12 1 4 3 6 5 6-1-7 0-12 2-18z" fill="#F08A24"/><path d="M24 26c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3 0-5 1-7z" fill="#FFD166"/>`,
  protein: `<path d="M18 8c6 0 10 9 10 15s-4.5 10-10 10S8 29 8 23s4-15 10-15z" fill="#FFF6E6" stroke="#C9A77A" stroke-width="1.4"/><circle cx="18" cy="24" r="4.5" fill="#F2A900"/><path d="M26 30h16l-2 10H28z" fill="#9C4F22"/><ellipse cx="34" cy="30" rx="8" ry="2.4" fill="#F0A13A"/>`,
  meals: `<circle cx="24" cy="26" r="16" fill="#FFFFFF" stroke="#C9BBA3" stroke-width="2"/><circle cx="24" cy="26" r="10" fill="#F4EBDD"/><path d="M6 8v12M4 8v6a2 2 0 0 0 4 0V8M42 8c-3 2-3 8 0 12v14" stroke="#7A6E60" stroke-width="2" fill="none" stroke-linecap="round"/>`,
};

const PLATE_ORDER: FoodGroup[] = ['cereals_millets', 'pulses_beans', 'milk_curd', 'green_leafy_veg', 'other_veg_roots', 'fruits', 'nuts_oilseeds', 'ghee_oil'];

function gramsFor(g: FoodGroup, p: DietPlan): number {
  const b = p.basket;
  switch (g) {
    case 'cereals_millets': return b.cereals_g;
    case 'pulses_beans': return b.pulses_g;
    case 'milk_curd': return b.milk_ml;
    case 'green_leafy_veg': return b.glv_g;
    case 'other_veg_roots': return b.vegetables_g + b.roots_tubers_g;
    case 'fruits': return b.fruits_g;
    case 'nuts_oilseeds': return b.nuts_g;
    case 'ghee_oil': return b.fats_g;
    default: return 0;
  }
}

function amountText(g: FoodGroup, p: DietPlan, D: DietStrings, ageMonths: number): string {
  if (g === 'sugar_junk') return D.avoid;
  if (g === 'egg_meat_fish') return '';
  if (g === 'milk_curd') return ageMonths < 12 ? D.bm : `${p.basket.milk_ml} ml`;
  return `${gramsFor(g, p)} g`;
}

/** Donut "plate": each group's share of the day's food by raw weight, ICMR My Plate style. */
function plateSvg(p: DietPlan, D: DietStrings): string {
  const parts = PLATE_ORDER.map((g) => ({ g, v: gramsFor(g, p) })).filter((x) => x.v > 0);
  const total = parts.reduce((s, x) => s + x.v, 0);
  const R = 62;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = parts
    .map(({ g, v }) => {
      const len = (v / total) * C;
      const arc = `<circle cx="90" cy="90" r="${R}" fill="none" stroke="${GROUP_COLOR[g]}" stroke-width="30" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 90 90)"/>`;
      offset += len;
      return arc;
    })
    .join('');
  const legend = parts
    .map(({ g, v }) => `<div class="lg"><i style="background:${GROUP_COLOR[g]}"></i><span>${esc(D.groups[g])}</span><b>${Math.round((v / total) * 100)}%</b></div>`)
    .join('');
  return `
    <div class="plateRow">
      <svg viewBox="0 0 180 180" width="170" height="170">
        <circle cx="90" cy="90" r="86" fill="#FFFFFF" stroke="${colors.border}" stroke-width="2"/>
        ${arcs}
        <circle cx="90" cy="90" r="44" fill="#FFFDF8"/>
        <text x="90" y="88" text-anchor="middle" font-size="22" font-weight="700" fill="${colors.ink}">${p.kcalTarget}</text>
        <text x="90" y="106" text-anchor="middle" font-size="11" fill="${colors.muted}">kcal · ${esc(D.per_day)}</text>
      </svg>
      <div class="legend2">${legend}</div>
    </div>`;
}

/** Meal times anchored to a normal day; extra meals spread out, snacks dropped into the longest gaps. */
const MEAL_TIMES: Record<number, number[]> = {
  1: [13 * 60],
  2: [8 * 60, 19.5 * 60],
  3: [8 * 60, 13 * 60, 20 * 60],
  4: [7.5 * 60, 11.5 * 60, 15.5 * 60, 20 * 60],
  5: [7 * 60, 10.5 * 60, 14 * 60, 17.5 * 60, 20.5 * 60],
};

function scheduleHtml(p: DietPlan, D: DietStrings): string {
  const meals = MEAL_TIMES[Math.min(5, Math.max(1, p.mealsPerDay))] ?? [];
  const slots: { t: number; meal: boolean }[] = meals.map((t) => ({ t, meal: true }));
  for (let i = 0; i < p.snacksPerDay; i++) {
    const times = slots.map((x) => x.t).sort((a, b) => a - b);
    if (times.length < 2) {
      slots.push({ t: 16.5 * 60, meal: false });
      continue;
    }
    let best = 0;
    for (let j = 1; j < times.length - 1; j++) if (times[j + 1] - times[j] > times[best + 1] - times[best]) best = j;
    slots.push({ t: Math.round((times[best] + times[best + 1]) / 2 / 30) * 30, meal: false });
  }
  slots.sort((a, b) => a.t - b.t);
  const fmt = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  return `<div class="timeline">${slots
    .map(
      (x) => `
      <div class="slot ${x.meal ? 'meal' : 'snack'}">
        <div class="dot">${x.meal ? svg(TILE_ICON.meals, 26) : svg(ICON.fruits, 22)}</div>
        <div class="slotT">${fmt(x.t)}</div>
        <div class="slotK">${esc(x.meal ? D.meal : D.snack)}</div>
      </div>`
    )
    .join('')}</div>`;
}

function groupCardsHtml(p: DietPlan, D: DietStrings, ageMonths: number): string {
  return FOOD_GROUPS.map((g) => {
    const score = p.scores[g];
    const c = GROUP_COLOR[g];
    const avoid = score === 0;
    const dots = [1, 2, 3, 4, 5].map((i) => `<i style="background:${i <= score ? c : '#EDE6DA'}"></i>`).join('');
    const badge = score === 5 ? `<span class="badge" style="background:${c}">★ ${esc(D.top)}</span>` : '';
    return `
      <div class="fg ${avoid ? 'avoid' : ''}" style="border-color:${avoid ? '#E3BEB8' : c + '55'}">
        <div class="fgIcon" style="background:${c}1F">${svg(ICON[g], 38)}</div>
        <div class="fgBody">
          <div class="fgName">${esc(D.groups[g])}</div>
          ${amountText(g, p, D, ageMonths) ? `<div class="fgAmt" style="color:${avoid ? colors.redText : c}">${esc(amountText(g, p, D, ageMonths))}</div>` : ''}
          <div class="dots">${dots}<b>${score}/5</b></div>
        </div>
        ${badge}
      </div>`;
  }).join('');
}

function tipsHtml(p: DietPlan, D: DietStrings): string {
  const tips =
    p.ageGroup === '0_6m'
      ? [...(p.decision === 'refer' ? [D.tips.refer_infant] : p.decision === 'unsure' ? [D.tips.unsure[3]] : []), ...D.tips.bf]
      : [...D.tips[p.decision], ...D.tips.all];
  return `<ol class="tips">${tips.map((t) => `<li><span>${esc(t)}</span></li>`).join('')}</ol>`;
}

/** The whole diet page for one child, or '' when no plan exists (age out of range). */
export function dietSectionHtml(input: DietReportInput, lang: LangCode): string {
  const p = dietPlan(input.decision, input.ageMonths, input.sex, input.weightKg);
  if (!p) return '';
  const D = DIET[lang];
  const tone = decisionColors[input.decision];
  const infant = p.ageGroup === '0_6m';
  const name = input.name.trim();
  const ex = D.examples[p.ageGroup];

  const tiles = infant
    ? ''
    : `
      <div class="tiles3">
        <div class="t3" style="background:#FFF1E2"><div class="t3i">${svg(TILE_ICON.energy, 40)}</div><div><div class="t3k">${esc(D.energy)}</div><div class="t3v">${p.kcalTarget} <span>kcal</span></div><div class="t3s">${esc(D.per_day)}</div></div></div>
        <div class="t3" style="background:#FDF3DF"><div class="t3i">${svg(TILE_ICON.protein, 40)}</div><div><div class="t3k">${esc(D.protein)}</div><div class="t3v">${p.proteinG} <span>g</span></div><div class="t3s">${esc(D.per_day)}</div></div></div>
        <div class="t3" style="background:#EEF3EA"><div class="t3i">${svg(TILE_ICON.meals, 40)}</div><div><div class="t3k">${esc(D.meals_h)}</div><div class="t3v small">${esc(D.meals_line(p.mealsPerDay, p.snacksPerDay))}</div><div class="t3s">${esc(D.per_day)}</div></div></div>
      </div>`;

  const notes = [p.fromFoodKcal != null ? D.infant_food(p.fromFoodKcal) : null, p.breastfeed && !infant ? D.bf_note : null].filter(Boolean) as string[];

  const menus = `
        <div class="h2" style="margin-top:18px">${esc(D.examples_h)}</div>
        <div class="menus">
          <div class="menu veg"><div class="menuK"><i></i>${esc(D.veg)}</div><p>${esc(ex.veg)}</p></div>
          <div class="menu nonveg"><div class="menuK"><i></i>${esc(D.nonveg)}</div><p>${esc(ex.nonveg)}</p></div>
        </div>`;

  const body = infant
    ? `
      <div class="bf">
        <div class="bfIcon">${svg(ICON.milk_curd, 54)}</div>
        <div><div class="h2">${esc(D.bf_h)}</div><p>${esc(D.bf_s)}</p></div>
      </div>`
    : `
      <div class="panel">
        <div class="h2">${esc(D.plate_h)}</div>
        <div class="sub">${esc(D.plate_s)}</div>
        ${plateSvg(p, D)}
      </div>
      <div class="panel">
          <div class="h2">${esc(D.schedule_h)}</div>
          <div class="sub">${esc(D.meals_line(p.mealsPerDay, p.snacksPerDay))}</div>
          ${scheduleHtml(p, D)}
          ${notes.map((n) => `<div class="note">${esc(n)}</div>`).join('')}
      </div>
      ${menus}
      <div class="h2 newPage">${esc(D.scores_h)}</div>
      <div class="sub">${esc(D.scores_s)}</div>
      <div class="fgGrid">${groupCardsHtml(p, D, input.ageMonths)}</div>
      <div class="swap">${esc(D.nonveg_swap)}</div>`;

  return `
    <section class="card diet">
      <div class="dHero" style="background:linear-gradient(120deg, ${tone.bg}, ${tone.bg}CC)">
        <div class="dHeroTop">
          <div>
            <div class="dTitle">${esc(D.title)}</div>
            ${lang !== 'en' ? `<div class="dTitleEn">${esc(DIET.en.title)}</div>` : ''}
            <div class="dWho">${esc(name || '—')} · ${input.ageMonths} mo · ${input.weightKg} kg</div>
          </div>
          <div class="dIcons">${svg(ICON.green_leafy_veg, 34)}${svg(ICON.fruits, 34)}${svg(ICON.milk_curd, 34)}</div>
        </div>
        <div class="dBanner"><b>${tone.icon}</b><span>${esc(D.banner[input.decision])}</span></div>
      </div>
      <div class="dBody">
        ${tiles}
        ${body}
        ${infant ? menus : ''}
        <div class="h2" style="margin-top:18px">${esc(D.tips_h)}</div>
        ${tipsHtml(p, D)}
        <div class="dSource">${esc(D.source)}</div>
      </div>
    </section>${nutritionHtml(input, p, lang)}`;
}

const NUTRIENT_KEY: Record<Nutrient, keyof Strings> = {
  anaemia: 'n_anaemia', iron_def: 'n_iron', vitD_def: 'n_vitd', zinc_def: 'n_zinc', vitA_def: 'n_vita', folate_def: 'n_folate', b12_def: 'n_b12',
};
const SLOT_KEY: Record<SlotId, keyof Strings> = {
  millets: 'sl_millets', pulses: 'g_pulses', glv: 'g_glv', vegetables: 'g_veg', roots: 'g_roots', fruits: 'g_fruits', nuts: 'g_nuts', milk: 'g_milk', swap: 'sl_swap',
};

/** The nutrition extension's page: deficiency rates for children like this one, and today's menu in the child's amounts. */
function nutritionHtml(input: DietReportInput, p: DietPlan, lang: LangCode): string {
  if (p.ageGroup === '0_6m') return '';
  const L = STR[lang];
  const X = EXTRA[lang];
  const plan = foodPlanForAmounts(input.ageMonths, input.sex, input.category, input.diet, amountsFrom(p, input.ageMonths));
  const local = (f: { display: string; local: Record<'hi' | 'kn' | 'ta' | 'te', string | null> }) =>
    lang === 'en' ? f.display : f.local[lang] ? `${f.local[lang]} (${f.display})` : f.display;
  const risks = plan.risks
    ? `<div class="sub">${esc(X.risk_s)}</div>
       <div class="rbars">${plan.risks
         .map((r) => {
           const n = Math.round(100 * r.risk);
           return `<div class="rb ${r.flagged ? 'on' : ''}"><div class="rbHead"><span>${esc(String(L[NUTRIENT_KEY[r.nutrient]]))}</span><b>${esc(X.of100(n))}</b></div>
             <div class="rbTrack"><i style="width:${Math.min(100, n)}%"></i><em style="left:${Math.round(100 * FLAG_AT)}%"></em></div></div>`;
         })
         .join('')}</div>
       <div class="note warn">${esc(X.confirm)}</div>`
    : `<div class="sub">${esc(X.no_risk_infant)}</div>`;
  const dietWord = String(L[plan.diet === 'veg' ? 'd_veg' : plan.diet === 'egg' ? 'd_egg' : 'd_nonveg']);
  const menu = plan.menu.length
    ? `<div class="h2" style="margin-top:16px">${esc(L.menu_h)}</div>
       <div class="sub">${esc(X.menu_s)}</div>
       <table class="menuT"><tbody>${plan.menu
         .map((s) => {
           const [top, ...alts] = s.foods;
           const amt = `${Math.round(top ? top.portion : s.grams)} ${s.slot === 'milk' ? 'ml' : 'g'}`;
           const others = alts.length ? `<div class="alt">${esc(L.or_w)}: ${esc(alts.map((a) => local(a.food)).join(', '))}</div>` : '';
           return `<tr><td class="ms">${esc(String(L[SLOT_KEY[s.slot]]))}<br><span>${esc(amt)}</span></td><td><b>${esc(top ? local(top.food) : L.any_food)}</b>${others}</td></tr>`;
         })
         .join('')}</tbody></table>
       <div class="sub">${esc(plan.dietAsked ? X.diet_used(dietWord) : X.diet_none)}</div>`
    : '';
  return `
    <section class="card diet nut">
      <div class="dBody">
        <div class="h2">${esc(L.risk_h)}</div>
        ${risks}
        ${menu}
        <div class="dSource">CNNS 2016–18 (MoHFW, UNICEF, Population Council) · IFCT 2017 and DGI 2024 (ICMR-NIN). ${esc(X.not_arm)}</div>
      </div>
    </section>`;
}

export const DIET_STYLE = `
  .nut { page-break-before: always; }
  .rbars { margin-top:10px; display:grid; grid-template-columns: 1fr 1fr; column-gap:22px; row-gap:10px; }
  .rbHead { display:flex; justify-content:space-between; font-size:12.5px; color:${colors.muted}; }
  .rb.on .rbHead { color:${colors.amberText}; font-weight:700; }
  .rbTrack { position:relative; height:8px; border-radius:999px; background:${colors.tint}; margin-top:4px; overflow:hidden; }
  .rbTrack i { position:absolute; left:0; top:0; bottom:0; background:${colors.stoneLight}; border-radius:999px; }
  .rb.on .rbTrack i { background:${colors.amber}; }
  .rbTrack em { position:absolute; top:0; bottom:0; width:2px; background:${colors.ink}; opacity:0.45; }
  .note.warn { background:${colors.amberBg}; color:${colors.amberText}; }
  .menuT { width:100%; border-collapse:collapse; margin-top:8px; }
  .menuT td { border-top:1px solid ${colors.divider}; padding:7px 6px; font-size:12.5px; vertical-align:top; color:${colors.ink}; }
  .menuT td.ms { width:34%; color:${colors.muted}; }
  .menuT td.ms span { font-family:'Courier New',monospace; color:${colors.ink}; font-size:12px; }
  .menuT .alt { color:${colors.muted2}; font-size:11.5px; margin-top:2px; }

  .diet { page-break-before: always; }
  .dHero { padding: 20px 22px 18px; color: #FFFDF8; }
  .dHeroTop { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
  .dTitle { font-family: Georgia, serif; font-size:26px; font-weight:700; }
  .dTitleEn { font-size:13px; opacity:0.85; margin-top:1px; }
  .dWho { font-size:12px; opacity:0.92; margin-top:6px; font-family:'Courier New',monospace; }
  .dIcons { display:flex; gap:4px; background:rgba(255,253,248,0.92); border-radius:999px; padding:6px 10px; }
  .dBanner { display:flex; gap:10px; align-items:flex-start; margin-top:14px; background:rgba(255,253,248,0.18); border:1px solid rgba(255,253,248,0.35); border-radius:12px; padding:10px 12px; font-size:13.5px; line-height:20px; }
  .dBanner b { font-size:16px; }
  .dBody { padding: 16px 20px 20px; }
  .tiles3 { display:flex; gap:10px; }
  .t3 { flex:1; display:flex; gap:10px; align-items:center; border-radius:12px; padding:10px 12px; }
  .t3k { font-size:10px; letter-spacing:0.8px; text-transform:uppercase; color:${colors.muted}; }
  .t3v { font-size:22px; font-weight:700; color:${colors.ink}; }
  .t3v span { font-size:12px; font-weight:400; color:${colors.muted}; }
  .t3v.small { font-size:14px; line-height:18px; margin:3px 0 1px; }
  .t3s { font-size:10px; color:${colors.muted}; }
  .h2 { font-family: Georgia, serif; font-size:16px; font-weight:700; color:${colors.ink}; }
  .sub { font-size:11px; color:${colors.muted2}; margin-top:2px; }
  .panel { background:#FFFFFF; border:1px solid ${colors.border}; border-radius:12px; padding:12px 16px; margin-top:12px; page-break-inside: avoid; }
  .plateRow { display:flex; align-items:center; gap:22px; margin-top:6px; }
  .legend2 { flex:1; display:grid; grid-template-columns: 1fr 1fr; column-gap:18px; row-gap:4px; }
  .lg { display:flex; align-items:center; gap:7px; font-size:12px; line-height:18px; color:${colors.ink}; padding:3px 0; border-bottom:1px dotted ${colors.divider}; }
  .lg i { width:10px; height:10px; border-radius:3px; flex:none; }
  .lg span { flex:1; }
  .lg b { font-family:'Courier New',monospace; font-size:12px; color:${colors.ink}; }
  .timeline { position:relative; display:flex; justify-content:space-between; margin:14px 6px 4px; }
  .timeline:before { content:''; position:absolute; left:16px; right:16px; top:17px; height:3px; background:repeating-linear-gradient(90deg, ${colors.sand} 0 6px, transparent 6px 10px); }
  .slot { position:relative; display:flex; flex-direction:column; align-items:center; width:46px; }
  .slot .dot { width:36px; height:36px; border-radius:18px; display:flex; align-items:center; justify-content:center; background:#FFFFFF; border:2px solid ${colors.green}; }
  .slot.snack .dot { width:30px; height:30px; margin-top:3px; border-color:#E07B2E; }
  .slotT { font-family:'Courier New',monospace; font-size:10.5px; font-weight:700; margin-top:5px; color:${colors.ink}; }
  .slotK { font-size:10px; color:${colors.muted}; }
  .note { font-size:11px; color:${colors.greenText}; background:${colors.greenBg}; border-radius:8px; padding:6px 9px; margin-top:8px; }
  .fgGrid { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
  .fg { position:relative; width:calc(50% - 4px); display:flex; gap:10px; align-items:center; background:#FFFFFF; border:1.5px solid; border-radius:12px; padding:8px 10px; page-break-inside: avoid; }
  .fg.avoid { background:${colors.redBg}; }
  .fgIcon { width:50px; height:50px; border-radius:25px; display:flex; align-items:center; justify-content:center; flex:none; }
  .fgBody { flex:1; }
  .fgName { font-size:12.5px; font-weight:600; color:${colors.ink}; }
  .fgAmt { font-family:'Courier New',monospace; font-size:13px; font-weight:700; margin-top:1px; }
  .dots { display:flex; align-items:center; gap:3px; margin-top:4px; }
  .dots i { width:12px; height:7px; border-radius:4px; }
  .dots b { font-family:'Courier New',monospace; font-size:10px; color:${colors.muted}; margin-left:5px; }
  .badge { position:absolute; top:-8px; right:10px; color:#FFFFFF; font-size:9px; font-weight:700; letter-spacing:0.4px; border-radius:999px; padding:2px 8px; }
  .newPage { page-break-before: always; padding-top: 6px; margin-top: 18px; }
  .swap { font-size:11px; color:${colors.muted2}; margin-top:8px; }
  .bf { display:flex; gap:14px; align-items:center; margin-top:4px; background:#EAF2F9; border-radius:12px; padding:14px; }
  .bf p { font-size:13px; line-height:20px; margin:4px 0 0; }
  .menus { display:flex; gap:10px; margin-top:8px; page-break-inside: avoid; }
  .menu { flex:1; border-radius:12px; padding:10px 12px; }
  .menu p { font-size:12.5px; line-height:19px; margin:6px 0 0; color:${colors.ink}; }
  .menu.veg { background:#EEF6EC; } .menu.nonveg { background:#FBEDE7; }
  .menuK { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700; letter-spacing:0.6px; text-transform:uppercase; }
  .menuK i { width:12px; height:12px; border:2px solid; border-radius:2px; position:relative; }
  .menu.veg .menuK { color:#2E7D32; } .menu.veg .menuK i { border-color:#2E7D32; background:radial-gradient(circle, #2E7D32 0 3px, transparent 3.5px); }
  .menu.nonveg .menuK { color:#A0412D; } .menu.nonveg .menuK i { border-color:#A0412D; background:radial-gradient(circle, #A0412D 0 3px, transparent 3.5px); }
  .tips { counter-reset: tip; list-style:none; padding:0; margin:8px 0 0; columns: 2; column-gap: 14px; }
  .tips li { counter-increment: tip; display:flex; gap:8px; font-size:12px; line-height:18px; margin-bottom:8px; break-inside: avoid; }
  .tips li:before { content: counter(tip); flex:none; width:20px; height:20px; border-radius:10px; background:${colors.green}; color:#FFFFFF; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; }
  .dSource { font-size:10.5px; color:${colors.muted}; margin-top:12px; padding-top:10px; border-top:1px solid ${colors.divider}; }
`;
