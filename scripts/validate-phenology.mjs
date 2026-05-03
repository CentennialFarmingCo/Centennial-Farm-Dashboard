// Sanity-checks public/phenology-summary.json:
// - file is valid JSON with metadata + blocks structure
// - if available:false, reason is non-empty; no fabricated chill/DD numbers
// - if available:true:
//   * chill portions is a finite number >= 0
//   * each pest DD entry has finite cumulativeDDF >= 0 and matches known UC IPM
//     thresholds (peach twig borer = 50/88, navel orangeworm = 55/94)
//   * every FIELDS_DATA row appears in blocks[]
//   * peach blocks reference peachTwigBorer, almond blocks reference navelOrangeworm
//   * date strings are valid ISO YYYY-MM-DD and chill-season start <= end,
//     DD-window start <= end
//
// Exits non-zero on failure. Run: node scripts/validate-phenology.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FIELDS_DATA } from '../app/fields.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PATH = join(ROOT, 'public', 'phenology-summary.json');

const errors = [];
const warnings = [];

if (!existsSync(PATH)) {
  console.error(
    `phenology-summary.json missing at ${PATH}. Run: npm run phenology:build`,
  );
  process.exit(1);
}

const doc = JSON.parse(readFileSync(PATH, 'utf8'));
if (!doc || typeof doc !== 'object') {
  errors.push('top-level value is not an object');
}
const meta = doc?.metadata;
if (!meta || typeof meta !== 'object') errors.push('metadata missing');
if (typeof meta?.generatedAt !== 'string')
  errors.push('metadata.generatedAt missing');
if (typeof meta?.available !== 'boolean')
  errors.push('metadata.available must be boolean');

function isIsoDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

const knownThresholds = {
  peachTwigBorer: { lowerF: 50, upperF: 88 },
  navelOrangeworm: { lowerF: 55, upperF: 94 },
};

const pestForCrop = crop =>
  crop === 'Almond'
    ? 'navelOrangeworm'
    : crop === 'Freestone Peach' || crop === 'Cling Peach'
      ? 'peachTwigBorer'
      : null;

if (meta?.available === false) {
  if (!meta.reason || typeof meta.reason !== 'string' || !meta.reason.length) {
    errors.push('available:false but metadata.reason is empty');
  }
  if (doc.chill != null) errors.push('available:false but chill is non-null');
  if (doc.degreeDays != null)
    errors.push('available:false but degreeDays is non-null');
  if (Array.isArray(doc.blocks) && doc.blocks.length > 0) {
    errors.push('available:false but blocks[] is non-empty (no fake data allowed)');
  }
} else if (meta?.available === true) {
  // Chill portions
  if (
    !doc.chill ||
    typeof doc.chill.portions !== 'number' ||
    !Number.isFinite(doc.chill.portions) ||
    doc.chill.portions < 0
  ) {
    errors.push('chill.portions must be a finite number >= 0');
  }
  if (
    !doc.chill?.season ||
    !isIsoDate(doc.chill.season.start) ||
    !isIsoDate(doc.chill.season.end)
  ) {
    errors.push('chill.season.{start,end} must be YYYY-MM-DD');
  } else if (doc.chill.season.start >= doc.chill.season.end) {
    errors.push('chill.season.start must be < end');
  }

  // Degree days per pest
  for (const [key, expected] of Object.entries(knownThresholds)) {
    const e = doc.degreeDays?.[key];
    if (!e) {
      errors.push(`degreeDays.${key} missing`);
      continue;
    }
    if (e.lowerF !== expected.lowerF || e.upperF !== expected.upperF) {
      errors.push(
        `degreeDays.${key} thresholds ${e.lowerF}/${e.upperF} != UC IPM ${expected.lowerF}/${expected.upperF}`,
      );
    }
    if (
      typeof e.cumulativeDDF !== 'number' ||
      !Number.isFinite(e.cumulativeDDF) ||
      e.cumulativeDDF < 0
    ) {
      errors.push(`degreeDays.${key}.cumulativeDDF must be finite >= 0`);
    }
    if (!isIsoDate(e.biofix) || !isIsoDate(e.windowEnd)) {
      errors.push(`degreeDays.${key} biofix/windowEnd must be YYYY-MM-DD`);
    } else if (e.biofix > e.windowEnd) {
      errors.push(`degreeDays.${key} biofix > windowEnd`);
    }
    if (typeof e.sourceUrl !== 'string' || !e.sourceUrl.startsWith('http')) {
      errors.push(`degreeDays.${key}.sourceUrl missing/invalid`);
    }
  }

  // Station metadata sanity
  if (!doc.metadata?.station?.id) {
    warnings.push('station.id missing — was the station meta API reachable?');
  }

  // Block coverage
  const idSet = new Set(FIELDS_DATA.map(f => f.id));
  const seen = new Set();
  for (const b of doc.blocks ?? []) {
    if (!idSet.has(b.fieldId)) {
      errors.push(`block fieldId=${b.fieldId} not in FIELDS_DATA`);
      continue;
    }
    seen.add(b.fieldId);
    const expectedPestKey = pestForCrop(b.crop);
    if (expectedPestKey === null) {
      warnings.push(`block ${b.fieldId} (${b.crop}) has no pest model mapping`);
    } else if (b.pestModelKey !== expectedPestKey) {
      errors.push(
        `block ${b.fieldId} (${b.crop}) pestModelKey=${b.pestModelKey} expected ${expectedPestKey}`,
      );
    }
    if (
      typeof b.chillPortions !== 'number' ||
      !Number.isFinite(b.chillPortions) ||
      b.chillPortions < 0
    ) {
      errors.push(`block ${b.fieldId} chillPortions invalid`);
    }
    if (b.pestModel) {
      if (
        typeof b.pestModel.cumulativeDDF !== 'number' ||
        !Number.isFinite(b.pestModel.cumulativeDDF) ||
        b.pestModel.cumulativeDDF < 0
      ) {
        errors.push(`block ${b.fieldId} pestModel.cumulativeDDF invalid`);
      }
      const expected = knownThresholds[expectedPestKey];
      if (
        expected &&
        (b.pestModel.lowerF !== expected.lowerF ||
          b.pestModel.upperF !== expected.upperF)
      ) {
        errors.push(
          `block ${b.fieldId} pestModel thresholds ${b.pestModel.lowerF}/${b.pestModel.upperF} != UC IPM ${expected.lowerF}/${expected.upperF}`,
        );
      }
    }
  }
  for (const id of idSet) {
    if (!seen.has(id))
      errors.push(`field id=${id} missing from phenology blocks[]`);
  }
} else {
  errors.push('metadata.available must be true or false');
}

if (warnings.length) {
  console.warn('Warnings:');
  for (const w of warnings) console.warn('  - ' + w);
}
if (errors.length) {
  console.error('VALIDATION FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(
  meta?.available
    ? `OK (available; chill=${doc.chill.portions}, blocks=${doc.blocks.length})`
    : `OK (unavailable; reason: ${meta?.reason?.slice(0, 80)}...)`,
);
