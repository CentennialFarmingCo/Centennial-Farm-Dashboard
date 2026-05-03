// Sanity-checks public/soils.geojson and public/soil-summary.json:
// - both files are valid JSON
// - soils.geojson is a FeatureCollection of Polygon/MultiPolygon features
// - every feature.properties.fieldId points to a real FIELDS_DATA row
// - soil-summary.json's fields[].fieldId all exist in FIELDS_DATA
// - every field in FIELDS_DATA appears in the summary
// - per-field soil coverage is at least 95% of the field polygon area
// - component percentages sum to ~100 within each field (when components present)
//
// Exits non-zero on failure. Run: node scripts/validate-soils.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FIELDS_DATA } from '../app/fields.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOILS_PATH = join(ROOT, 'public', 'soils.geojson');
const SUMMARY_PATH = join(ROOT, 'public', 'soil-summary.json');

const errors = [];
const warnings = [];

const idSet = new Set(FIELDS_DATA.map(f => f.id));

const soils = JSON.parse(readFileSync(SOILS_PATH, 'utf8'));
if (soils.type !== 'FeatureCollection') errors.push(`soils.geojson type "${soils.type}" != FeatureCollection`);

let polyOk = 0;
for (const f of soils.features ?? []) {
  if (f.type !== 'Feature') errors.push(`soil feature type "${f.type}" != Feature`);
  const g = f.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) {
    errors.push(`soil feature mukey=${f.properties?.mukey} not Polygon/MultiPolygon`);
    continue;
  }
  if (f.properties?.fieldId == null || !idSet.has(f.properties.fieldId)) {
    errors.push(`soil feature fieldId=${f.properties?.fieldId} not in FIELDS_DATA`);
  }
  if (!f.properties?.mukey) errors.push(`soil feature missing mukey`);
  polyOk++;
}

const summary = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8'));
if (!Array.isArray(summary.fields)) errors.push('soil-summary.json fields is not an array');

const seenIds = new Set();
for (const fld of summary.fields ?? []) {
  if (!idSet.has(fld.fieldId)) {
    errors.push(`summary fieldId=${fld.fieldId} not in FIELDS_DATA`);
    continue;
  }
  seenIds.add(fld.fieldId);
  if (typeof fld.coveragePct !== 'number') {
    errors.push(`field ${fld.fieldId} missing coveragePct`);
  } else if (fld.coveragePct < 95) {
    errors.push(`field ${fld.fieldId} (${fld.block}) soil coverage only ${fld.coveragePct}% — expected >=95%`);
  }
  if (Array.isArray(fld.components) && fld.components.length > 0) {
    const pctSum = fld.components.reduce((s, c) => s + (c.percent || 0), 0);
    // tolerate ±1.5% for rounding (each component rounded to 0.1)
    if (Math.abs(pctSum - 100) > 1.5) {
      errors.push(`field ${fld.fieldId} (${fld.block}) component percentages sum to ${pctSum}, expected ~100`);
    }
    for (const c of fld.components) {
      if (!c.mukey) errors.push(`field ${fld.fieldId} component missing mukey`);
      if (!c.musym && !c.muname) warnings.push(`field ${fld.fieldId} mukey=${c.mukey} missing musym/muname`);
      if (c.acres == null || c.acres < 0) errors.push(`field ${fld.fieldId} mukey=${c.mukey} bad acres=${c.acres}`);
    }
  } else {
    errors.push(`field ${fld.fieldId} (${fld.block}) has no soil components`);
  }
  // polygon area should be in the same ballpark as reported acres (±25%)
  if (fld.reportedAcres && fld.polygonAcres) {
    const ratio = fld.polygonAcres / fld.reportedAcres;
    if (ratio < 0.5 || ratio > 1.5) {
      warnings.push(`field ${fld.fieldId} polygonAcres=${fld.polygonAcres} vs reported=${fld.reportedAcres} (ratio ${ratio.toFixed(2)})`);
    }
  }
}

for (const id of idSet) {
  if (!seenIds.has(id)) errors.push(`field id=${id} missing from soil-summary.json`);
}

console.log(`Soil polygons: ${polyOk}`);
console.log(`Field summaries: ${summary.fields?.length ?? 0}/${idSet.size}`);
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
