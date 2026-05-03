// Sanity-checks public/irrigation-districts.geojson and public/irrigation-summary.json:
// - both files are valid JSON
// - districts geojson is a FeatureCollection of Polygon/MultiPolygon features
// - every feature.properties.fieldId points to a real FIELDS_DATA row
// - irrigation-summary.json's fields[].fieldId all exist in FIELDS_DATA
// - every field in FIELDS_DATA appears in the summary
// - per-field district coverage <= ~110% of the field polygon area (overlap is
//   possible because adjacent agencies sometimes overlap by a sliver, but
//   anything wildly above 100% suggests a bug)
// - component percentages don't exceed ~110 in aggregate (same rationale)
// - polygon areas are within ±50% of reported acres (reportedAcres are
//   coarse / not the source of truth, so this is a sanity check, not a fail)
//
// Exits non-zero on failure. Run: node scripts/validate-districts.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FIELDS_DATA } from '../app/fields.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DISTRICTS_PATH = join(ROOT, 'public', 'irrigation-districts.geojson');
const SUMMARY_PATH = join(ROOT, 'public', 'irrigation-summary.json');

const errors = [];
const warnings = [];

const idSet = new Set(FIELDS_DATA.map(f => f.id));

const districts = JSON.parse(readFileSync(DISTRICTS_PATH, 'utf8'));
if (districts.type !== 'FeatureCollection') {
  errors.push(`irrigation-districts.geojson type "${districts.type}" != FeatureCollection`);
}

let polyOk = 0;
for (const f of districts.features ?? []) {
  if (f.type !== 'Feature') errors.push(`district feature type "${f.type}" != Feature`);
  const g = f.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) {
    errors.push(`district feature agency=${f.properties?.agencyName} not Polygon/MultiPolygon`);
    continue;
  }
  if (f.properties?.fieldId == null || !idSet.has(f.properties.fieldId)) {
    errors.push(`district feature fieldId=${f.properties?.fieldId} not in FIELDS_DATA`);
  }
  if (!f.properties?.agencyName) errors.push('district feature missing agencyName');
  polyOk++;
}

const summary = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8'));
if (!Array.isArray(summary.fields)) errors.push('irrigation-summary.json fields is not an array');

const seenIds = new Set();
let fieldsWithDistrict = 0;
for (const fld of summary.fields ?? []) {
  if (!idSet.has(fld.fieldId)) {
    errors.push(`summary fieldId=${fld.fieldId} not in FIELDS_DATA`);
    continue;
  }
  seenIds.add(fld.fieldId);

  if (typeof fld.coveragePct !== 'number') {
    errors.push(`field ${fld.fieldId} missing coveragePct`);
  } else if (fld.coveragePct > 115) {
    errors.push(`field ${fld.fieldId} (${fld.block}) district coverage ${fld.coveragePct}% — implausibly above 100%`);
  }

  if (Array.isArray(fld.components) && fld.components.length > 0) {
    fieldsWithDistrict++;
    const pctSum = fld.components.reduce((s, c) => s + (c.percent || 0), 0);
    if (pctSum > 115) {
      errors.push(`field ${fld.fieldId} (${fld.block}) district percentages sum to ${pctSum}, expected <=~110`);
    }
    for (const c of fld.components) {
      if (!c.agencyName) errors.push(`field ${fld.fieldId} component missing agencyName`);
      if (c.acres == null || c.acres < 0) errors.push(`field ${fld.fieldId} agency=${c.agencyName} bad acres=${c.acres}`);
      if (typeof c.percent !== 'number' || c.percent < 0) errors.push(`field ${fld.fieldId} agency=${c.agencyName} bad percent=${c.percent}`);
    }
  } else {
    // Not an error — fields outside any public district are valid; the UI
    // surfaces a "no public district overlap" message in that case.
    warnings.push(`field ${fld.fieldId} (${fld.block}) has no public district overlap`);
  }

  if (fld.reportedAcres && fld.polygonAcres) {
    const ratio = fld.polygonAcres / fld.reportedAcres;
    if (ratio < 0.5 || ratio > 1.5) {
      warnings.push(`field ${fld.fieldId} polygonAcres=${fld.polygonAcres} vs reported=${fld.reportedAcres} (ratio ${ratio.toFixed(2)})`);
    }
  }
}

for (const id of idSet) {
  if (!seenIds.has(id)) errors.push(`field id=${id} missing from irrigation-summary.json`);
}

if (!summary.metadata?.source || !summary.metadata?.sourceUrl) {
  errors.push('irrigation-summary.json metadata missing source/sourceUrl');
}
if (!summary.metadata?.retrievedAt) {
  errors.push('irrigation-summary.json metadata missing retrievedAt');
}

console.log(`District clipped polygons: ${polyOk}`);
console.log(`Field summaries: ${summary.fields?.length ?? 0}/${idSet.size}`);
console.log(`Fields with at least one public district overlap: ${fieldsWithDistrict}`);
if (warnings.length) {
  console.warn('Warnings:');
  for (const w of warnings) console.warn('  - ' + w);
}
if (errors.length) {
  console.error('VALIDATION FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('OK');
