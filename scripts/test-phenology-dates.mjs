// Unit tests for the date-handling helpers in build-phenology.mjs.
//
// These guard against regression of the bug where Vercel/Node running in UTC
// produced a "tomorrow in California" date late in the day and tripped CIMIS's
// HTTP 400 [ERR1010-FUTURE DATE FAULT]. We verify that:
//   1. todayInLosAngeles() returns the same calendar date as a manual LA-zone
//      computation, including across the UTC->LA day-boundary.
//   2. todayInLosAngeles() does NOT roll forward to tomorrow when run from a
//      UTC clock instant that is "still today" in Los Angeles.
//
// Run: node scripts/test-phenology-dates.mjs   (exits non-zero on failure)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, 'build-phenology.mjs'), 'utf8');

// Pull out the helper definition without executing the rest of the module
// (which would try to fetch from CIMIS as a side-effect of `main()` running).
const m = SRC.match(/function todayInLosAngeles\([\s\S]*?\n\}\n/);
if (!m) {
  console.error('FAIL: todayInLosAngeles not found in build-phenology.mjs');
  process.exit(1);
}
const todayInLosAngeles = new Function(`${m[0]}\nreturn todayInLosAngeles;`)();

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

// 1. Reference: 2026-05-04T00:30:00Z is 17:30 PDT on 2026-05-03.
//    UTC-derived date would say "2026-05-04"; LA-derived must say "2026-05-03".
{
  const instant = new Date('2026-05-04T00:30:00Z');
  const got = todayInLosAngeles(instant);
  assert(
    got === '2026-05-03',
    `expected 2026-05-03 for 2026-05-04T00:30:00Z (17:30 PDT prev day), got ${got}`,
  );
}

// 2. After LA midnight: 2026-05-04T08:00:00Z is 01:00 PDT on 2026-05-04.
{
  const instant = new Date('2026-05-04T08:00:00Z');
  const got = todayInLosAngeles(instant);
  assert(got === '2026-05-04', `expected 2026-05-04, got ${got}`);
}

// 3. Standard time (PST, UTC-8): 2026-01-15T07:30:00Z is 23:30 PST on 2026-01-14.
{
  const instant = new Date('2026-01-15T07:30:00Z');
  const got = todayInLosAngeles(instant);
  assert(got === '2026-01-14', `expected 2026-01-14 PST, got ${got}`);
}

// 4. Standard time crossing: 2026-01-15T08:30:00Z is 00:30 PST on 2026-01-15.
{
  const instant = new Date('2026-01-15T08:30:00Z');
  const got = todayInLosAngeles(instant);
  assert(got === '2026-01-15', `expected 2026-01-15 PST, got ${got}`);
}

// 5. Format must be YYYY-MM-DD (zero-padded).
{
  const instant = new Date('2026-03-05T20:00:00Z');
  const got = todayInLosAngeles(instant);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(got), `bad format: ${got}`);
}

if (failures.length > 0) {
  console.error('TEST FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`OK (${5} todayInLosAngeles cases)`);
