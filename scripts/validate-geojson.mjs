// Sanity-checks public/fields.geojson:
// - is valid JSON, type FeatureCollection
// - polygon count matches expectation
// - every feature has Polygon geometry with a closed outer ring of >=4 points
// - every feature.properties.fieldId, when set, points to a real FIELDS_DATA row
// - report match coverage
//
// Exits non-zero on failure. Run: node scripts/validate-geojson.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FIELDS_DATA } from '../app/fields.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GEOJSON_PATH = join(ROOT, 'public', 'fields.geojson');

const errors = [];
const json = JSON.parse(readFileSync(GEOJSON_PATH, 'utf8'));

if (json.type !== 'FeatureCollection') errors.push(`type is "${json.type}", expected "FeatureCollection"`);
if (!Array.isArray(json.features)) errors.push('features is not an array');

const idSet = new Set(FIELDS_DATA.map(f => f.id));
const blockSet = new Set(FIELDS_DATA.map(f => f.block.toLowerCase()));
let matched = 0;
for (const f of json.features ?? []) {
  if (f.type !== 'Feature') errors.push(`feature.type "${f.type}" != Feature`);
  if (!f.geometry || f.geometry.type !== 'Polygon') {
    errors.push(`feature ${f.properties?.kmlName} not a Polygon`);
    continue;
  }
  const ring = f.geometry.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) {
    errors.push(`feature ${f.properties?.kmlName} ring too short (${ring?.length})`);
  } else {
    const first = ring[0], last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      errors.push(`feature ${f.properties?.kmlName} ring not closed`);
    }
  }
  if (f.properties?.matched) matched++;
  if (f.properties?.fieldId != null && !idSet.has(f.properties.fieldId)) {
    errors.push(`feature ${f.properties?.kmlName} fieldId=${f.properties.fieldId} not in FIELDS_DATA`);
  }
  if (f.properties?.block && f.properties?.matched && !blockSet.has(f.properties.block.toLowerCase())) {
    errors.push(`feature ${f.properties?.kmlName} matched=true but block "${f.properties.block}" not in FIELDS_DATA`);
  }
}

const total = json.features?.length ?? 0;
console.log(`Polygons: ${total}`);
console.log(`Matched to FIELDS_DATA: ${matched}/${total}`);

if (errors.length) {
  console.error('VALIDATION FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('OK');
