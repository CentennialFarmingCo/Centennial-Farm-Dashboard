// Convert public/Farming-Field-Map.kml -> public/fields.geojson.
// Parses each <Placemark> name into { fieldNumber, ranch, block, variety, crop, acres }
// and matches against app/fields.js FIELDS_DATA by `block`. Reports unmatched items.
//
// Run: node scripts/kml-to-geojson.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FIELDS_DATA } from '../app/fields.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const KML_PATH = join(ROOT, 'public', 'Farming-Field-Map.kml');
const OUT_PATH = join(ROOT, 'public', 'fields.geojson');

const kml = readFileSync(KML_PATH, 'utf8');

// Match each <Placemark> ... </Placemark> block.
const placemarkRe = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/g;
const nameRe = /<name>([\s\S]*?)<\/name>/;
const coordsRe = /<outerBoundaryIs>\s*<LinearRing>\s*<coordinates>([\s\S]*?)<\/coordinates>\s*<\/LinearRing>\s*<\/outerBoundaryIs>/;

function parseCoords(text) {
  // KML format: lon,lat[,alt] separated by whitespace.
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(triple => {
      const [lon, lat] = triple.split(',').map(Number);
      return [lon, lat];
    });
}

// Parse a placemark name like:
//   "Field 1 - Johnston Block 1 - Kaweah Freestone Peach - 33 acres"
// Returns parsed fields, or null fields when a part doesn't match.
function parseName(rawName) {
  const name = rawName.trim();
  const parts = name.split(/\s*-\s*/).map(s => s.trim());
  // Expected: ["Field N", "{Ranch} Block X" or "{Ranch} {Something}", "{Variety} {Crop}", "N acres"]
  const result = {
    name,
    fieldNumber: null,
    block: null,
    ranch: null,
    variety: null,
    crop: null,
    acres: null,
  };

  if (parts[0]) {
    const m = /^Field\s+(\d+)/i.exec(parts[0]);
    if (m) result.fieldNumber = Number(m[1]);
  }
  if (parts[1]) {
    // The middle is the block label as it appears in fields.js: "Johnston Block 1",
    // "Blue Lupin Block 17", "Fagundes Mello", "Fagundes Angel Ranch", etc.
    // Normalize "block" (lower b) to "Block" so matches like "Johnston block 5B" work.
    result.block = parts[1].replace(/\bblock\b/g, 'Block');
    // Ranch = first word group up to "Block ..." or "<Ranch> <Other>".
    const blockMatch = /^(.*?)\s+Block\b/i.exec(result.block);
    if (blockMatch) {
      result.ranch = blockMatch[1].trim();
    } else {
      // e.g. "Fagundes Mello", "Fagundes Angel Ranch" — first word is parent ranch label,
      // rest is the sub-ranch name; we'll let FIELDS_DATA matching resolve the canonical ranch.
      const firstSpace = result.block.indexOf(' ');
      result.ranch = firstSpace >= 0 ? result.block.slice(0, firstSpace) : result.block;
    }
  }
  if (parts[2]) {
    // "{Variety...} {Crop}" where Crop is "Almond" | "Freestone Peach" | "Cling Peach".
    const cropMatch = /(Freestone Peach|Cling Peach|Almond)\s*$/i.exec(parts[2]);
    if (cropMatch) {
      result.crop = cropMatch[1].replace(/\b\w/g, c => c.toUpperCase()).replace('peach', 'Peach');
      result.variety = parts[2].slice(0, cropMatch.index).trim();
    } else {
      result.variety = parts[2];
    }
  }
  if (parts[3]) {
    const m = /([\d.]+)\s*acres?/i.exec(parts[3]);
    if (m) result.acres = Number(m[1]);
  }
  return result;
}

const features = [];
const unmatched = [];
let placemarkCount = 0;
let m;
while ((m = placemarkRe.exec(kml)) !== null) {
  const body = m[1];
  const nameMatch = nameRe.exec(body);
  const coordsMatch = coordsRe.exec(body);
  if (!nameMatch || !coordsMatch) continue;
  placemarkCount++;
  const parsed = parseName(nameMatch[1]);
  const ring = parseCoords(coordsMatch[1]);

  // Match against FIELDS_DATA: prefer (1) exact block string match, (2) field-number index.
  let matched = FIELDS_DATA.find(f => f.block.toLowerCase() === (parsed.block ?? '').toLowerCase());
  if (!matched && parsed.fieldNumber != null) {
    matched = FIELDS_DATA.find(f => f.id === parsed.fieldNumber);
  }

  if (!matched) {
    unmatched.push({ name: parsed.name, parsedBlock: parsed.block });
  }

  features.push({
    type: 'Feature',
    properties: {
      kmlName: parsed.name,
      fieldNumber: parsed.fieldNumber,
      block: matched ? matched.block : parsed.block,
      ranch: matched ? matched.ranch : parsed.ranch,
      variety: matched ? matched.variety : parsed.variety,
      crop: matched ? matched.crop : parsed.crop,
      acres: matched ? matched.acres : parsed.acres,
      fieldId: matched ? matched.id : null,
      matched: Boolean(matched),
    },
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
  });
}

const geojson = {
  type: 'FeatureCollection',
  metadata: {
    source: 'public/Farming-Field-Map.kml',
    generated: new Date().toISOString(),
    polygonCount: features.length,
    matchedCount: features.filter(f => f.properties.matched).length,
  },
  features,
};

writeFileSync(OUT_PATH, JSON.stringify(geojson, null, 2) + '\n');

console.log(`Placemarks: ${placemarkCount}`);
console.log(`Polygons written: ${features.length}`);
console.log(`Matched to FIELDS_DATA: ${geojson.metadata.matchedCount}/${features.length}`);
if (unmatched.length) {
  console.log('Unmatched placemarks:');
  for (const u of unmatched) console.log(`  - ${u.name}  (parsedBlock="${u.parsedBlock}")`);
}
console.log(`Wrote ${OUT_PATH}`);
