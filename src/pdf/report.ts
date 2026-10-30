import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';

import type { Extra, LangCode, Strings } from '@/i18n/strings';
import { MACZ_MAX_MONTHS, MACZ_MIN_MONTHS, muacCurve, type Sex } from '@/pipeline/zscore';
import type { ScreeningResult } from '@/pipeline/run';
import { categoryText, decisionText } from '@/store/result-view';
import { formatWhen } from '@/ui/record-row';
import { barScale } from '@/ui/charts';
import type { Diet } from '@/nutrition/plan';
import { brand as appBrand } from '@/ui/brand';
import { colors, decisionColors } from '@/ui/theme';

import { DIET_STYLE, dietSectionHtml } from './diet-report';

/**
 * Builds the HTML `expo-print` turns into a PDF: one shareable report for a
 * single screening, or a whole register export with one card per record.
 * Kept in plain HTML/CSS (not React Native) because that is what the print
 * engine renders — see `share this result` (result.tsx) and `Export` (settings.tsx).
 */

export type ReportEntry = {
  name: string;
  /** Diet answer for the food menu; null or absent = not asked. */
  diet?: Diet | null;
  ageMonths: number;
  sex: Sex;
  weightKg: number;
  result: ScreeningResult;
  /** ISO timestamp. */
  when: string;
  /** `file://`-less path to the still, or null if none was kept. */
  photoPath: string | null;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Reads a kept still into a data URI — Android's print engine cannot load `file://` images. */
export async function photoDataUri(photoPath: string | null): Promise<string | null> {
  if (!photoPath) return null;
  try {
    const f = new File(photoPath.startsWith('file://') ? photoPath : `file://${photoPath}`);
    if (!f.exists) return null;
    const ext = (f.extension || '.jpg').replace('.', '').toLowerCase();
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${await f.base64()}`;
  } catch {
    return null;
  }
}

const PHOTO_MAX_W = 260;
const PHOTO_MAX_H = 340;

/** Same log-x/linear-y mapping as `GrowthCurve` (charts.tsx), redrawn in plain SVG for print. */
function growthCurveSvg(entry: ReportEntry, L: Strings): string {
  const X = (a: number) => 8 + (Math.log(a / MACZ_MIN_MONTHS) / Math.log(MACZ_MAX_MONTHS / MACZ_MIN_MONTHS)) * 280;
  const Y = (cm: number) => 150 - ((cm - 8) / 26) * 140;
  const pt = (a: number, cm: number) => `${X(a).toFixed(1)},${Y(cm).toFixed(1)}`;

  const curve = muacCurve(entry.sex);
  const median = curve.map((c) => pt(c.age, c.median)).join(' ');
  const low = curve.map((c) => pt(c.age, c.lo));
  const high = curve.map((c) => pt(c.age, c.hi));
  const band = [...high, ...[...low].reverse()].join(' ');
  const childX = X(Math.max(MACZ_MIN_MONTHS, Math.min(MACZ_MAX_MONTHS, entry.ageMonths)));
  const childY = Y(Math.max(8, Math.min(34, entry.result.muacCm)));
  const fill = decisionColors[entry.result.decision].bg;

  return `
    <svg viewBox="0 0 300 170" width="100%" height="150" style="margin-top:8px">
      <polygon points="${band}" fill="${colors.divider}" />
      <polyline points="${median}" fill="none" stroke="${colors.stone}" stroke-width="2" />
      <line x1="${childX}" y1="10" x2="${childX}" y2="150" stroke="${colors.dashed}" stroke-width="1" />
      <circle cx="${childX}" cy="${childY}" r="6" fill="${fill}" stroke="${colors.surface}" stroke-width="2" />
      <text x="2" y="164" font-size="9" fill="${colors.muted}">3 mo</text>
      <text x="250" y="164" font-size="9" fill="${colors.muted}">228 mo</text>
      <text x="2" y="16" font-size="9" fill="${colors.muted}">34 cm</text>
      <text x="2" y="148" font-size="9" fill="${colors.muted}">8 cm</text>
    </svg>
    <div class="legend">
      <span><i style="background:${colors.stone}"></i>${escapeHtml(L.curve)}</span>
      <span><i style="background:${colors.divider}"></i>±2 SD</span>
    </div>`;
}

/** Same track/range/marker math as `ConfidenceBar` (charts.tsx), redrawn as absolutely-positioned divs. */
function confidenceBarHtml(entry: ReportEntry): string {
  const r = entry.result;
  const s = barScale(r, entry.ageMonths, entry.sex);
  const pct = (cm: number) => Math.max(0, Math.min(100, ((cm - s.min) / (s.max - s.min)) * 100));
  const cut = pct(r.cutCm);
  const lo = pct(r.lowCm);
  const hi = pct(r.highCm);
  const marker = pct(r.muacCm);
  return `
    <div class="confTrack">
      <div class="confBelow" style="width:${cut}%"></div>
      <div class="confCi" style="left:${lo}%;width:${Math.max(0, hi - lo)}%"></div>
      <div class="confMarker" style="left:${marker}%"></div>
    </div>
    <div class="confAxis"><span>${s.min}</span><span class="confCut" style="left:${cut}%">${r.cutCm.toFixed(1)}</span><span>${s.max}</span></div>`;
}

function photoBlockHtml(entry: ReportEntry, photo: string | null, L: Strings, X: Extra): string {
  const r = entry.result;
  // Points are normalized to the photo's own aspect ratio; the frame must keep
  // that ratio too (not stretch to a fixed box) or the overlay drifts off the arm.
  const aspect = r.photoWidth > 0 && r.photoHeight > 0 ? r.photoWidth / r.photoHeight : 3 / 4;
  let w = PHOTO_MAX_W;
  let h = w / aspect;
  if (h > PHOTO_MAX_H) {
    h = PHOTO_MAX_H;
    w = h * aspect;
  }
  const inner = photo ? `<img src="${photo}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" />` : `<div class="photoGhost"></div>`;
  const points = r.points
    .map((p) => `<div class="point ${p.used ? 'used' : 'unused'}" style="left:${(p.x * w - 6).toFixed(1)}px;top:${(p.y * h - 6).toFixed(1)}px"></div>`)
    .join('');
  return `
    <div class="kicker">${escapeHtml(L.prov)}</div>
    <div class="photoWrap" style="width:${w.toFixed(1)}px;height:${h.toFixed(1)}px">${inner}${points}</div>
    <div class="caption">${escapeHtml(X.arm_line(Math.round(r.armWidthPx), r.pointsUsed))}</div>`;
}

/** One screening, as a self-contained report card. Used standalone and inside the register export. */
function entryCardHtml(entry: ReportEntry, photo: string | null, L: Strings, E: Strings, X: Extra, lang: LangCode): string {
  const r = entry.result;
  const d = decisionText(r.decision, L);
  const dEn = decisionText(r.decision, E);
  const tone = decisionColors[r.decision];
  const sexLabel = entry.sex === 'F' ? L.girl : L.boy;
  const name = entry.name.trim() || '—';

  return `
    <section class="card">
      <div class="hero" style="background:${tone.bg}">
        <div class="kicker light">${escapeHtml(L.status)}</div>
        <div class="decision">${escapeHtml(d.label)}</div>
        ${dEn.label && dEn.label !== d.label ? `<div class="decisionEn">${escapeHtml(dEn.label)}</div>` : ''}
        <div class="tiles">
          <div class="tile"><div class="tileK">MUAC</div><div class="tileV">${r.muacCm.toFixed(1)} <span>cm</span></div></div>
          <div class="tile"><div class="tileK">${escapeHtml(L.category)}</div><div class="tileV2">${escapeHtml(categoryText(r.category, L))}</div></div>
        </div>
      </div>
      <div class="body">
        <div class="subjectRow">
          <div class="subjectName">${escapeHtml(name)}</div>
          <div class="subjectMeta">${entry.ageMonths} mo · ${escapeHtml(sexLabel)} · ${entry.weightKg} kg · z ${r.z >= 0 ? '+' : ''}${r.z.toFixed(2)}</div>
        </div>
        <p class="plain">${escapeHtml(d.plain)}</p>

        <div class="kicker">${escapeHtml(L.confidence)}</div>
        ${confidenceBarHtml(entry)}
        <div class="confText">${escapeHtml(L.confidence)}: ${r.lowCm.toFixed(1)}–${r.highCm.toFixed(1)} cm</div>

        <div class="grid2">
          <div>${photoBlockHtml(entry, photo, L, X)}</div>
          <div>
            <div class="kicker">${escapeHtml(L.curve)}</div>
            ${growthCurveSvg(entry, L)}
          </div>
        </div>

        <div class="stamp">${escapeHtml(formatWhen(entry.when, lang, true))} · ${escapeHtml(r.model)}</div>
      </div>
    </section>`;
}

const BASE_STYLE = `
  @page { margin: 28px; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, 'Segoe UI', sans-serif; color: ${colors.ink}; background: ${colors.page}; margin: 0; }
  .brand { display:flex; align-items:baseline; gap:8px; padding: 4px 0 14px; }
  .brand .mark { font-family: Georgia, serif; font-weight:700; font-size:22px; color:${colors.green}; }
  .brand .tag { font-size:12px; color:${colors.muted}; }
  .card { background:${colors.surface}; border:1px solid ${colors.border}; border-radius:14px; overflow:hidden; margin-bottom:18px; page-break-inside: avoid; }
  .hero { padding: 18px 20px 20px; color: ${colors.surface}; }
  .kicker { font-size:11px; letter-spacing:1px; text-transform:uppercase; color:${colors.muted}; margin: 14px 0 6px; }
  .kicker.light { color: rgba(255,253,248,0.85); margin: 0; }
  .decision { font-family: Georgia, serif; font-size:24px; font-weight:700; margin-top:6px; }
  .decisionEn { font-size:14px; opacity:0.9; margin-top:2px; }
  .tiles { display:flex; gap:10px; margin-top:14px; }
  .tile { flex:1; background:rgba(255,253,248,0.16); border-radius:10px; padding:10px 12px; }
  .tileK { font-size:10px; letter-spacing:0.8px; text-transform:uppercase; opacity:0.85; }
  .tileV { font-size:20px; font-weight:700; margin-top:2px; }
  .tileV span { font-size:12px; font-weight:400; opacity:0.85; }
  .tileV2 { font-size:15px; font-weight:600; margin-top:3px; }
  .body { padding: 16px 20px 20px; }
  .subjectRow { border-bottom:1px solid ${colors.divider}; padding-bottom:10px; }
  .subjectName { font-size:16px; font-weight:600; }
  .subjectMeta { font-family: 'Courier New', monospace; font-size:12px; color:${colors.muted}; margin-top:3px; }
  .plain { font-size:14px; line-height:22px; margin: 12px 0 4px; }
  .confTrack { position:relative; height:12px; background:${colors.sand}; border-radius:999px; margin-top:4px; }
  .confBelow { position:absolute; left:0; top:0; height:100%; background:${colors.redSoft}; border-radius:999px 0 0 999px; }
  .confCi { position:absolute; top:-3px; height:18px; background:rgba(42,36,32,0.2); border-radius:4px; }
  .confMarker { position:absolute; top:-4px; bottom:-4px; width:3px; margin-left:-1.5px; background:${colors.ink}; border-radius:2px; }
  .confAxis { position:relative; display:flex; justify-content:space-between; font-family:'Courier New',monospace; font-size:10px; color:${colors.muted}; margin-top:2px; }
  .confCut { position:absolute; color:${colors.redText}; transform: translateX(-50%); }
  .confText { font-family:'Courier New',monospace; font-size:12px; color:${colors.muted2}; margin-top:10px; }
  .grid2 { display:flex; gap:20px; margin-top:6px; flex-wrap:wrap; }
  .photoWrap { position:relative; border-radius:10px; overflow:hidden; background:${colors.stripeB}; }
  .photoGhost { position:absolute; inset:16px; border:2px dashed rgba(255,253,248,0.4); border-radius:8px; }
  .point { position:absolute; width:12px; height:12px; border-radius:6px; border:2px solid ${colors.surface}; }
  .point.used { background:${colors.green}; }
  .point.unused { background:${colors.ghost}; }
  .caption { font-family:'Courier New',monospace; font-size:10px; color:${colors.muted}; margin-top:6px; }
  .legend { display:flex; gap:14px; font-size:11px; color:${colors.muted2}; margin-top:6px; }
  .legend i { display:inline-block; width:12px; height:8px; margin-right:4px; border-radius:2px; vertical-align:middle; }
  .stamp { font-family:'Courier New',monospace; font-size:11px; color:${colors.muted}; margin-top:16px; padding-top:12px; border-top:1px solid ${colors.divider}; }
  .disclaimer { font-size:11px; color:${colors.muted}; margin-top:18px; }
  .summary { display:flex; gap:10px; margin: 4px 0 20px; flex-wrap:wrap; }
  .summary .stat { flex:1; min-width:110px; background:${colors.surface}; border:1px solid ${colors.border}; border-radius:10px; padding:12px 14px; }
  .summary .statV { font-size:22px; font-weight:700; }
  .summary .statK { font-size:11px; color:${colors.muted}; margin-top:2px; }
`;

function documentHtml(title: string, bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>${BASE_STYLE}${DIET_STYLE}</style></head><body>${bodyHtml}</body></html>`;
}

/** A one-screening report — the "share this result" PDF: the result card, then the child's diet plan on its own page. */
export async function buildSingleReportHtml(entry: ReportEntry, L: Strings, E: Strings, X: Extra, lang: LangCode): Promise<string> {
  const photo = await photoDataUri(entry.photoPath);
  const brand = `<div class="brand"><span class="mark">${escapeHtml(appBrand.name)}</span><span class="tag">${escapeHtml(L.offline)}</span></div>`;
  const diet = dietSectionHtml(
    { name: entry.name, ageMonths: entry.ageMonths, sex: entry.sex, weightKg: entry.weightKg, decision: entry.result.decision, category: entry.result.category, diet: entry.diet ?? null },
    lang
  );
  return documentHtml(
    entry.name.trim() || 'Screening result',
    `${brand}${entryCardHtml(entry, photo, L, E, X, lang)}<p class="disclaimer">${escapeHtml(X.aid)}</p>${diet}`
  );
}

/** The whole on-phone register — the settings screen's "Export" PDF. */
export async function buildRegisterReportHtml(entries: ReportEntry[], L: Strings, E: Strings, X: Extra, lang: LangCode): Promise<string> {
  const referred = entries.filter((e) => e.result.decision === 'refer').length;
  const unsure = entries.filter((e) => e.result.decision === 'unsure').length;
  const clear = entries.length - referred - unsure;
  const brand = `<div class="brand"><span class="mark">${escapeHtml(appBrand.name)}</span><span class="tag">${escapeHtml(L.history)} — ${escapeHtml(formatWhen(new Date().toISOString(), lang, true))}</span></div>`;
  const summary = `
    <div class="summary">
      <div class="stat"><div class="statV">${entries.length}</div><div class="statK">${escapeHtml(X.records(entries.length))}</div></div>
      <div class="stat"><div class="statV">${referred}</div><div class="statK">${escapeHtml(L.f_refer)}</div></div>
      <div class="stat"><div class="statV">${unsure}</div><div class="statK">${escapeHtml(L.f_unsure)}</div></div>
      <div class="stat"><div class="statV">${clear}</div><div class="statK">${escapeHtml(L.f_ok)}</div></div>
    </div>`;

  const cards: string[] = [];
  for (const entry of entries) {
    const photo = await photoDataUri(entry.photoPath);
    cards.push(entryCardHtml(entry, photo, L, E, X, lang));
  }

  return documentHtml(L.history, `${brand}${summary}${cards.join('')}<p class="disclaimer">${escapeHtml(X.aid)}</p>`);
}

const EXPORT_DIR = 'exports';

/** Renders HTML to a PDF and gives it a stable, sensible filename (Print's own output name is a cache-scoped random one). */
export async function renderPdf(html: string, filename: string): Promise<File> {
  const { uri } = await Print.printToFileAsync({ html });
  const dir = new Directory(Paths.document, EXPORT_DIR);
  if (!dir.exists) dir.create();
  const dest = new File(dir, filename);
  if (dest.exists) dest.delete();
  new File(uri).moveSync(dest);
  return dest;
}

/** A safe-ish filename fragment from free text (a child's name, say). */
export function slugify(s: string): string {
  const slug = s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'screening';
}
