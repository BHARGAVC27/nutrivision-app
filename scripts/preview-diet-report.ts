/**
 * Renders the PDF report's diet page to standalone HTML files, so its layout
 * can be checked in a desktop browser without building the app.
 *
 *     npx tsx scripts/preview-diet-report.ts <out-dir>
 *
 * Writes one file per case below; open them in Chrome/Edge (or print to PDF).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DIET_STYLE, dietSectionHtml, type DietReportInput } from '../src/pdf/diet-report';
import type { LangCode } from '../src/i18n/strings';

const out = process.argv[2] ?? 'preview';
mkdirSync(out, { recursive: true });

const cases: [string, DietReportInput, LangCode][] = [
  ['refer-2y-en', { name: 'Asha', ageMonths: 30, sex: 'F', weightKg: 9.5, decision: 'refer', category: 'moderate', diet: 'veg' }, 'en'],
  ['unsure-5y-hi', { name: 'Ravi', ageMonths: 60, sex: 'M', weightKg: 15, decision: 'unsure', category: 'at_risk', diet: null }, 'hi'],
  ['clear-11y-en', { name: 'Meena', ageMonths: 132, sex: 'F', weightKg: 34, decision: 'clear', category: 'normal', diet: 'egg' }, 'en'],
  ['refer-8mo-ta', { name: '', ageMonths: 8, sex: 'M', weightKg: 6.8, decision: 'refer', category: 'severe', diet: 'nonveg' }, 'ta'],
  ['refer-4mo-en', { name: '', ageMonths: 4, sex: 'M', weightKg: 5.2, decision: 'refer', category: 'severe', diet: null }, 'en'],
];

// Minimal stand-in for report.ts's BASE_STYLE: just the card shell the diet page sits in.
const SHELL = `@page { margin: 28px; } * { box-sizing: border-box; }
  body { font-family: Roboto, 'Segoe UI', sans-serif; background:#F6F1E7; margin:0; padding:16px; color:#2A2420; }
  .card { background:#FFFDF8; border:1px solid #E4DACA; border-radius:14px; overflow:hidden; max-width:720px; margin:0 auto; }`;

for (const [file, input, lang] of cases) {
  const html = `<!doctype html><html><head><meta charset="utf-8" /><style>${SHELL}${DIET_STYLE}</style></head><body>${dietSectionHtml(input, lang)}</body></html>`;
  writeFileSync(join(out, `${file}.html`), html);
}
console.log(`wrote ${cases.length} previews to ${out}`);
