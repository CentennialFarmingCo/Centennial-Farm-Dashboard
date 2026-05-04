// Fetches hourly weather from a CIMIS station and computes per-block seasonal
// chill portions (Fishman et al. 1987 Dynamic Model) and pest degree-day totals
// (UC IPM single-sine method, horizontal cutoff) for peach and almond blocks.
// Writes `public/phenology-summary.json` consumed by the dashboard at runtime.
//
// Sources / authoritative references:
//   - CIMIS Web API:
//       https://et.water.ca.gov/Rest/Index
//     (requires a free AppKey from CIMIS; see README for setup)
//   - UC IPM degree-day calculator (single-sine, horizontal cutoff):
//       https://ipm.ucanr.edu/WEATHER/abtddcalc.html
//       https://ipm.ucanr.edu/weather/ddconcepts.html
//   - UC IPM peach twig borer model thresholds (Lower=50F, Upper=88F):
//       https://ipm.ucanr.edu/WEATHER/ddretrievetext.html
//   - UC IPM navel orangeworm model thresholds (Lower=55F, Upper=94F):
//       https://ipm.ucanr.edu/weather/pest-and-plant-models/?MODEL=NOW&CROP=almonds
//   - Dynamic Model (chill portions) — Fishman, Erez & Couvillon (1987),
//     "The temperature dependence of dormancy breaking in plants":
//       J. Theor. Biol. 124(4):473-483.
//   - UC Davis Fruit & Nut Research & Information Center — chill portions
//     and chilling reference:
//       https://fruitsandnuts.ucdavis.edu/about-chilling-hours-units-and-portions
//       https://fruitsandnuts.ucdavis.edu/weather-models
//
// IMPORTANT: This script never invents data. If no CIMIS_APP_KEY is configured
// (or live data cannot be retrieved), it writes a phenology-summary.json with
// `available: false` and a clear unavailable status — the dashboard renders an
// "unavailable" state and no fake numbers are ever shown.
//
// Run: node scripts/build-phenology.mjs   (or `npm run phenology:build`)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FIELDS_DATA } from '../app/fields.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_PATH = join(ROOT, 'public', 'phenology-summary.json');

// --- Configuration (env vars; documented in README) ---
const CIMIS_APP_KEY = process.env.CIMIS_APP_KEY?.trim() || '';
// CIMIS station number for Merced County region. Default: Merced II (#148).
// Override with CIMIS_STATION if a closer station is preferred.
// CIMIS station list: https://cimis.water.ca.gov/Stations.aspx
const CIMIS_STATION = (process.env.CIMIS_STATION || '148').trim();

// CIMIS reports California weather and rejects requests where any date is
// strictly greater than "today" in the station's local (Pacific) timezone with
// HTTP 400 [ERR1010-FUTURE DATE FAULT]. Vercel/Node runs in UTC, which means a
// naive `new Date()` rolls over to tomorrow-in-LA after 4 PM PST / 5 PM PDT —
// so any UTC-derived "today" produced a guaranteed bad-date during evening
// builds. We compute today (and the default season anchor year) in
// America/Los_Angeles so build-time defaults always match CIMIS's calendar.
const TODAY_LA = todayInLosAngeles();
const yyyy = Number(TODAY_LA.slice(0, 4));
const CHILL_SEASON_START =
  process.env.CHILL_SEASON_START?.trim() || `${yyyy - 1}-11-01`;
const CHILL_SEASON_END =
  process.env.CHILL_SEASON_END?.trim() ||
  `${yyyy}-03-01`;

// Degree-day window. Default Jan 1 of current year through today (LA).
// UC IPM trap-biofix dates differ year-to-year and by orchard; defaulting to
// season-to-date is clearly labelled in the UI as such.
const DD_START =
  process.env.PHENOLOGY_START_DATE?.trim() ||
  process.env.DEGREE_DAY_BIOFIX_PEACH?.trim() ||
  `${yyyy}-01-01`;
const DD_END =
  process.env.PHENOLOGY_END_DATE?.trim() ||
  TODAY_LA;

// Per-pest biofix overrides (optional; otherwise DD_START is used)
const BIOFIX_PTB =
  process.env.DEGREE_DAY_BIOFIX_PEACH?.trim() || DD_START;
const BIOFIX_NOW =
  process.env.DEGREE_DAY_BIOFIX_ALMOND?.trim() || DD_START;

// --- Pest model definitions (UC IPM thresholds) ---
const PEST_MODELS = {
  peachTwigBorer: {
    pest: 'Peach twig borer (Anarsia lineatella)',
    appliesTo: ['Freestone Peach', 'Cling Peach'],
    lowerF: 50,
    upperF: 88,
    method: 'single-sine, horizontal cutoff',
    sourceUrl: 'https://ipm.ucanr.edu/WEATHER/ddretrievetext.html',
    biofix: BIOFIX_PTB,
  },
  navelOrangeworm: {
    pest: 'Navel orangeworm (Amyelois transitella)',
    appliesTo: ['Almond'],
    lowerF: 55,
    upperF: 94,
    method: 'single-sine, horizontal cutoff',
    sourceUrl:
      'https://ipm.ucanr.edu/weather/pest-and-plant-models/?MODEL=NOW&CROP=almonds',
    biofix: BIOFIX_NOW,
  },
};

function isoDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Today's date as YYYY-MM-DD in the America/Los_Angeles timezone (CIMIS's
// reference calendar). Uses Intl with an explicit timeZone so it works
// regardless of Node's process timezone — Vercel functions run in UTC, where
// `new Date()` ticks over to "tomorrow LA" any time after ~16:00 local.
// CIMIS rejects future-dated requests with HTTP 400 [ERR1010-FUTURE DATE
// FAULT], so we anchor every default and clamp on this value.
function todayInLosAngeles(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

// ---------- Dynamic Model (chill portions) ----------
// Implementation based on the Fishman / Erez / Couvillon (1987) formulation
// as published and validated in the chillR R package and in the UC Davis
// Fruit & Nut Center reference. See:
//   - Fishman, Erez & Couvillon (1987) J. Theor. Biol. 124:473-483.
//   - Luedeling & Brown (2011) International Journal of Biometeorology.
//   - chillR::Dynamic_Model — https://cran.r-project.org/package=chillR
//
// Inputs: array of hourly air temperatures in degrees Celsius.
// Output: cumulative chill portions across the input window.
const DM_E0 = 4153.5;
const DM_E1 = 12888.8;
const DM_A0 = 139500;
const DM_A1 = 2.567e18;
const DM_SLP = 1.6;
const DM_TETMLT = 277;
const DM_AA = DM_A0 / DM_A1;
const DM_EE = DM_E1 - DM_E0;

function chillPortionsFromHourlyC(hourlyC) {
  let x = 0;
  let xs = 0;
  let xi = 0;
  let portions = 0;
  for (const tC of hourlyC) {
    if (!Number.isFinite(tC)) continue;
    const tK = tC + 273;
    const ftmprt = DM_SLP * DM_TETMLT * (tK - DM_TETMLT) / tK;
    const sr = Math.exp(ftmprt);
    xi = sr / (1 + sr);
    xs = DM_AA * Math.exp(DM_EE / tK);
    const ak1 = DM_A1 * Math.exp(-DM_E1 / tK);
    const interE = xs - (xs - x) * Math.exp(-ak1);
    let delta = 0;
    if (interE >= 1) {
      delta = interE * xi;
      x = 0;
    } else {
      x = interE;
    }
    portions += delta;
  }
  return portions;
}

// ---------- Single-sine degree days, horizontal cutoff (UC IPM) ----------
// Reference: Baskerville & Emin (1969); UC IPM:
//   https://ipm.ucanr.edu/WEATHER/ddss-cutoff.html
function degreeDaysSingleSineF(tminF, tmaxF, lowerF, upperF) {
  if (!Number.isFinite(tminF) || !Number.isFinite(tmaxF)) return 0;
  if (tmaxF < tminF) [tminF, tmaxF] = [tmaxF, tminF];
  // Horizontal cutoff: cap tmax at upper threshold.
  const tmax = Math.min(tmaxF, upperF);
  const tmin = Math.min(tminF, upperF);
  if (tmax <= lowerF) return 0;
  if (tmin >= lowerF) {
    return (tmax + tmin) / 2 - lowerF;
  }
  // tmin < lower < tmax: integrate the sine wave above the lower threshold.
  const avg = (tmax + tmin) / 2;
  const amp = (tmax - tmin) / 2;
  const theta = Math.asin((lowerF - avg) / amp);
  const dd =
    ((avg - lowerF) * (Math.PI / 2 - theta) + amp * Math.cos(theta)) / Math.PI;
  return Math.max(0, dd);
}

function fToC(f) {
  return ((f - 32) * 5) / 9;
}

// ---------- CIMIS Web API client ----------
// CIMIS Web API caps responses at 1,750 records per request. For a single
// station, hourly air temperature returns 24 records/day, so any chunk must
// stay under ~72 days. We use 60 days for headroom.
const CIMIS_HOURLY_CHUNK_DAYS = 60;
// CIMIS daily data is at most 1 record/day, so 1,750 days fits in a single
// request — no chunking needed for typical season-to-date windows.

// Strip the appKey from any string before logging, just in case the API
// echoes it back in an error body or it ends up in a stack trace.
function redactKey(s) {
  if (typeof s !== 'string' || !CIMIS_APP_KEY) return s;
  return s.split(CIMIS_APP_KEY).join('***REDACTED_APPKEY***');
}

// Classify a fetch error / non-2xx response into a stable category for the
// JSON `errorKind` field and logging. Never includes the appKey.
function classifyHttpError({ status, body, network }) {
  if (network) return 'network';
  if (status === 401 || status === 403) return 'auth';
  if (status === 400) {
    const b = (body || '').toLowerCase();
    if (b.includes('appkey') || b.includes('app key')) return 'auth';
    if (b.includes('date')) return 'bad-date';
    return 'bad-request';
  }
  if (status === 404) return 'not-found';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'cimis-server-error';
  return 'http-error';
}

async function cimisFetch(url, label) {
  let r;
  try {
    r = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (e) {
    const err = new Error(`${label} network failure: ${redactKey(e.message)}`);
    err.errorKind = 'network';
    err.httpStatus = null;
    throw err;
  }
  if (!r.ok) {
    let body = '';
    try {
      body = (await r.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    const kind = classifyHttpError({ status: r.status, body, network: false });
    const err = new Error(
      `${label} HTTP ${r.status} (${kind}): ${redactKey(body)}`,
    );
    err.errorKind = kind;
    err.httpStatus = r.status;
    throw err;
  }
  try {
    return await r.json();
  } catch (e) {
    const err = new Error(
      `${label} returned non-JSON response: ${redactKey(e.message)}`,
    );
    err.errorKind = 'bad-response';
    err.httpStatus = r.status;
    throw err;
  }
}

async function fetchCimisHourlyChunk(stationId, startDate, endDate) {
  const url = new URL('https://et.water.ca.gov/api/data');
  url.searchParams.set('appKey', CIMIS_APP_KEY);
  url.searchParams.set('targets', stationId);
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('dataItems', 'hly-air-tmp');
  url.searchParams.set('unitOfMeasure', 'E'); // English (Fahrenheit)
  return cimisFetch(url, `CIMIS hourly (${startDate}→${endDate})`);
}

// Fetch hourly data across a window by splitting into <=60-day chunks to stay
// under the CIMIS 1,750 record/request limit. Concatenates Records arrays.
async function fetchCimisHourly(stationId, startDate, endDate) {
  const chunks = chunkDateRange(startDate, endDate, CIMIS_HOURLY_CHUNK_DAYS);
  if (chunks.length === 0) {
    const err = new Error(
      `CIMIS hourly: empty/invalid date range ${startDate} → ${endDate}`,
    );
    err.errorKind = 'bad-date';
    throw err;
  }
  const allRecords = [];
  for (const [s, e] of chunks) {
    console.log(`  CIMIS hourly chunk ${s} → ${e}`);
    const j = await fetchCimisHourlyChunk(stationId, s, e);
    const recs = j?.Data?.Providers?.[0]?.Records ?? [];
    allRecords.push(...recs);
  }
  return { Data: { Providers: [{ Records: allRecords }] } };
}

async function fetchCimisDaily(stationId, startDate, endDate) {
  const url = new URL('https://et.water.ca.gov/api/data');
  url.searchParams.set('appKey', CIMIS_APP_KEY);
  url.searchParams.set('targets', stationId);
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('dataItems', 'day-air-tmp-min,day-air-tmp-max');
  url.searchParams.set('unitOfMeasure', 'E');
  return cimisFetch(url, `CIMIS daily (${startDate}→${endDate})`);
}

async function fetchCimisStationMeta(stationId) {
  const url = `https://et.water.ca.gov/api/station/${encodeURIComponent(stationId)}`;
  return cimisFetch(url, `CIMIS station meta (${stationId})`);
}

// Split [start, end] (inclusive, ISO YYYY-MM-DD) into consecutive chunks each
// at most `maxDays` long (inclusive). Returns [[s0,e0], [s1,e1], ...]. Returns
// [] if start > end or either date is malformed.
function chunkDateRange(startDate, endDate, maxDays) {
  if (!isIsoDateStr(startDate) || !isIsoDateStr(endDate)) return [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!(start.getTime() <= end.getTime())) return [];
  const out = [];
  let cursor = start;
  const ONE_DAY_MS = 86400000;
  while (cursor.getTime() <= end.getTime()) {
    const chunkEnd = new Date(
      Math.min(
        cursor.getTime() + (maxDays - 1) * ONE_DAY_MS,
        end.getTime(),
      ),
    );
    out.push([isoDate(cursor), isoDate(chunkEnd)]);
    cursor = new Date(chunkEnd.getTime() + ONE_DAY_MS);
  }
  return out;
}

function isIsoDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseHourlyTempsF(cimisJson) {
  const records = cimisJson?.Data?.Providers?.[0]?.Records ?? [];
  return records.map(rec => {
    const v = rec?.HlyAirTmp?.Value;
    const f = v == null || v === '' ? NaN : Number(v);
    return {
      date: rec.Date,
      hour: rec.Hour,
      tF: f,
    };
  });
}

function parseDailyTempsF(cimisJson) {
  const records = cimisJson?.Data?.Providers?.[0]?.Records ?? [];
  return records.map(rec => {
    const min = rec?.DayAirTmpMin?.Value;
    const max = rec?.DayAirTmpMax?.Value;
    return {
      date: rec.Date,
      tminF: min == null || min === '' ? NaN : Number(min),
      tmaxF: max == null || max === '' ? NaN : Number(max),
    };
  });
}

// errorKind values:
//   'missing-key'        — CIMIS_APP_KEY not configured
//   'auth'               — 401/403 or CIMIS rejected the AppKey
//   'http-error'         — non-2xx response not otherwise classified
//   'bad-request'        — 400 with non-key, non-date message
//   'bad-date'           — 400/date-range invalid or empty window
//   'not-found'          — 404 (e.g. unknown station)
//   'rate-limited'       — 429
//   'cimis-server-error' — 5xx
//   'network'            — DNS/connection failure
//   'bad-response'       — 2xx but body could not be parsed as JSON
//   'no-data'            — request succeeded but returned no usable records
//   'unexpected'         — uncaught exception
function unavailable(reason, errorKind, extra = {}) {
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      available: false,
      reason: redactKey(reason),
      errorKind: errorKind || 'unknown',
      ...extra,
    },
    chill: null,
    degreeDays: null,
    blocks: [],
  };
}

function writeUnavailable(reason, errorKind, extra = {}) {
  const doc = unavailable(reason, errorKind, extra);
  writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2));
  console.warn(
    `[phenology] available:false (${errorKind}): ${redactKey(reason).slice(0, 200)}`,
  );
  console.warn(
    `[phenology] wrote ${OUT_PATH} — build will continue; dashboard will show unavailable state.`,
  );
}

function classifyPestForCrop(crop) {
  if (crop === 'Almond') return 'navelOrangeworm';
  if (crop === 'Freestone Peach' || crop === 'Cling Peach') return 'peachTwigBorer';
  return null;
}

async function main() {
  const baseConfigHint = {
    stationId: CIMIS_STATION,
    chillSeason: { start: CHILL_SEASON_START, end: CHILL_SEASON_END },
    degreeDayWindow: { start: DD_START, end: DD_END },
    requiredEnv: ['CIMIS_APP_KEY'],
    optionalEnv: [
      'CIMIS_STATION',
      'CHILL_SEASON_START',
      'CHILL_SEASON_END',
      'PHENOLOGY_START_DATE',
      'PHENOLOGY_END_DATE',
      'DEGREE_DAY_BIOFIX_PEACH',
      'DEGREE_DAY_BIOFIX_ALMOND',
    ],
  };

  if (!CIMIS_APP_KEY) {
    writeUnavailable(
      'No CIMIS_APP_KEY configured at build time. Set CIMIS_APP_KEY (and optionally CIMIS_STATION) to fetch live chill portions and pest degree-day totals. See README "Seasonal Models" section.',
      'missing-key',
      {
        configHint: baseConfigHint,
        models: pestModelsForReport(),
      },
    );
    return;
  }

  // Sanity-check date ranges before hitting CIMIS.
  if (
    !isIsoDateStr(CHILL_SEASON_START) ||
    !isIsoDateStr(CHILL_SEASON_END) ||
    CHILL_SEASON_START >= CHILL_SEASON_END
  ) {
    writeUnavailable(
      `Invalid CHILL_SEASON window: ${CHILL_SEASON_START} → ${CHILL_SEASON_END} (must be ISO YYYY-MM-DD with start < end)`,
      'bad-date',
      { configHint: baseConfigHint, models: pestModelsForReport() },
    );
    return;
  }
  if (
    !isIsoDateStr(DD_START) ||
    !isIsoDateStr(DD_END) ||
    DD_START > DD_END
  ) {
    writeUnavailable(
      `Invalid degree-day window: ${DD_START} → ${DD_END} (must be ISO YYYY-MM-DD with start <= end)`,
      'bad-date',
      { configHint: baseConfigHint, models: pestModelsForReport() },
    );
    return;
  }

  // CIMIS rejects any request where startDate or endDate is strictly later
  // than "today" in California local time (HTTP 400 [ERR1010-FUTURE DATE
  // FAULT]). When the operator did not pin a date via env, our defaults are
  // already anchored on TODAY_LA. When an operator *did* set an explicit
  // override that is future-dated relative to TODAY_LA, refuse rather than
  // silently shipping a request CIMIS will reject — emit an unavailable JSON
  // with a clear, actionable diagnostic so the build still succeeds.
  const futureDates = [];
  if (CHILL_SEASON_END > TODAY_LA) futureDates.push(['CHILL_SEASON_END', CHILL_SEASON_END]);
  if (CHILL_SEASON_START > TODAY_LA) futureDates.push(['CHILL_SEASON_START', CHILL_SEASON_START]);
  if (DD_END > TODAY_LA) futureDates.push(['PHENOLOGY_END_DATE', DD_END]);
  if (DD_START > TODAY_LA) futureDates.push(['PHENOLOGY_START_DATE/DEGREE_DAY_BIOFIX_PEACH', DD_START]);
  if (BIOFIX_PTB > TODAY_LA) futureDates.push(['DEGREE_DAY_BIOFIX_PEACH', BIOFIX_PTB]);
  if (BIOFIX_NOW > TODAY_LA) futureDates.push(['DEGREE_DAY_BIOFIX_ALMOND', BIOFIX_NOW]);
  if (futureDates.length > 0) {
    const detail = futureDates.map(([k, v]) => `${k}=${v}`).join(', ');
    writeUnavailable(
      `Configured date(s) are in the future relative to California local date ${TODAY_LA}: ${detail}. CIMIS rejects future-dated requests with [ERR1010-FUTURE DATE FAULT]. Adjust the env override(s) or unset them to use today-in-LA.`,
      'bad-date',
      { configHint: baseConfigHint, todayLocal: TODAY_LA, models: pestModelsForReport() },
    );
    return;
  }

  console.log(`[phenology] Fetching CIMIS station ${CIMIS_STATION} metadata...`);
  let stationMeta = null;
  try {
    const j = await fetchCimisStationMeta(CIMIS_STATION);
    stationMeta = j?.Stations?.[0] ?? null;
  } catch (e) {
    // Station metadata is optional — keep building with id-only.
    console.warn(
      `[phenology] Station meta unavailable (${e.errorKind || 'unknown'}): ${redactKey(e.message)}`,
    );
  }

  console.log(
    `[phenology] Fetching CIMIS hourly air temperature ${CHILL_SEASON_START} → ${CHILL_SEASON_END} (chill window, chunked ≤${CIMIS_HOURLY_CHUNK_DAYS}d)...`,
  );
  let hourly;
  try {
    hourly = await fetchCimisHourly(
      CIMIS_STATION,
      CHILL_SEASON_START,
      CHILL_SEASON_END,
    );
  } catch (e) {
    writeUnavailable(
      `CIMIS hourly fetch failed: ${e.message}`,
      e.errorKind || 'http-error',
      {
        httpStatus: e.httpStatus ?? null,
        configHint: baseConfigHint,
        models: pestModelsForReport(),
      },
    );
    return;
  }

  const hourlyRecs = parseHourlyTempsF(hourly);
  const validHourly = hourlyRecs.filter(r => Number.isFinite(r.tF));
  console.log(
    `[phenology] Hourly records: ${hourlyRecs.length} total / ${validHourly.length} with valid air temperature`,
  );

  if (hourlyRecs.length === 0) {
    writeUnavailable(
      `CIMIS hourly returned 0 records for station ${CIMIS_STATION} ${CHILL_SEASON_START} → ${CHILL_SEASON_END}. Verify station number and that data exists for that window.`,
      'no-data',
      { configHint: baseConfigHint, models: pestModelsForReport() },
    );
    return;
  }
  if (validHourly.length === 0) {
    writeUnavailable(
      `CIMIS hourly returned ${hourlyRecs.length} records but none had a usable air-temperature value for station ${CIMIS_STATION} ${CHILL_SEASON_START} → ${CHILL_SEASON_END}.`,
      'no-data',
      { configHint: baseConfigHint, models: pestModelsForReport() },
    );
    return;
  }

  const hourlyC = validHourly.map(r => fToC(r.tF));
  const chillPortions = chillPortionsFromHourlyC(hourlyC);

  console.log(
    `[phenology] Fetching CIMIS daily min/max air temperature ${DD_START} → ${DD_END} (DD window)...`,
  );
  let daily;
  try {
    daily = await fetchCimisDaily(CIMIS_STATION, DD_START, DD_END);
  } catch (e) {
    writeUnavailable(
      `CIMIS daily fetch failed: ${e.message}`,
      e.errorKind || 'http-error',
      {
        httpStatus: e.httpStatus ?? null,
        configHint: baseConfigHint,
        partialChillPortions: Number(chillPortions.toFixed(2)),
        models: pestModelsForReport(),
      },
    );
    return;
  }
  const dailyRecs = parseDailyTempsF(daily);
  const validDaily = dailyRecs.filter(
    r => Number.isFinite(r.tminF) && Number.isFinite(r.tmaxF),
  );
  console.log(
    `[phenology] Daily records: ${dailyRecs.length} total / ${validDaily.length} with valid min+max`,
  );

  if (validDaily.length === 0) {
    writeUnavailable(
      `CIMIS daily returned ${dailyRecs.length} records but none had usable min+max for station ${CIMIS_STATION} ${DD_START} → ${DD_END}.`,
      'no-data',
      {
        configHint: baseConfigHint,
        partialChillPortions: Number(chillPortions.toFixed(2)),
        models: pestModelsForReport(),
      },
    );
    return;
  }

  // Compute per-pest cumulative DD across the window. The same station record
  // is applied to every block (single-station case); per-block DD totals will
  // diverge only if a per-pest biofix differs.
  const ddByPest = {};
  for (const [key, m] of Object.entries(PEST_MODELS)) {
    const biofix = m.biofix;
    let total = 0;
    let firstDate = null;
    let lastDate = null;
    let n = 0;
    for (const d of validDaily) {
      if (d.date < biofix) continue;
      if (d.date > DD_END) continue;
      total += degreeDaysSingleSineF(d.tminF, d.tmaxF, m.lowerF, m.upperF);
      if (!firstDate) firstDate = d.date;
      lastDate = d.date;
      n++;
    }
    ddByPest[key] = {
      pest: m.pest,
      lowerF: m.lowerF,
      upperF: m.upperF,
      method: m.method,
      biofix,
      windowEnd: DD_END,
      daysAccumulated: n,
      firstDate,
      lastDate,
      cumulativeDDF: Number(total.toFixed(1)),
      sourceUrl: m.sourceUrl,
    };
  }

  // Per-block summary: every block currently uses the same station, but we
  // surface chill portions and the relevant pest model per block so the UI
  // can render block-level cards.
  const blocks = FIELDS_DATA.map(f => {
    const pestKey = classifyPestForCrop(f.crop);
    return {
      fieldId: f.id,
      block: f.block,
      ranch: f.ranch,
      crop: f.crop,
      variety: f.variety,
      acres: f.acres,
      chillPortions: Number(chillPortions.toFixed(2)),
      pestModelKey: pestKey,
      pestModel: pestKey
        ? {
            pest: ddByPest[pestKey].pest,
            biofix: ddByPest[pestKey].biofix,
            windowEnd: ddByPest[pestKey].windowEnd,
            cumulativeDDF: ddByPest[pestKey].cumulativeDDF,
            lowerF: ddByPest[pestKey].lowerF,
            upperF: ddByPest[pestKey].upperF,
            method: ddByPest[pestKey].method,
            sourceUrl: ddByPest[pestKey].sourceUrl,
          }
        : null,
    };
  });

  const station = stationMeta
    ? {
        id: String(stationMeta.StationNbr ?? CIMIS_STATION),
        name: stationMeta.Name ?? null,
        city: stationMeta.City ?? null,
        county: stationMeta.County ?? null,
        regionalOffice: stationMeta.RegionalOffice ?? null,
        elevationFt: stationMeta.Elevation
          ? Number(stationMeta.Elevation)
          : null,
        latitude: stationMeta.HmsLatitude
          ? Number(String(stationMeta.HmsLatitude).split('/').pop())
          : null,
        longitude: stationMeta.HmsLongitude
          ? Number(String(stationMeta.HmsLongitude).split('/').pop())
          : null,
        connectAt: stationMeta.ConnectDate ?? null,
      }
    : { id: String(CIMIS_STATION), name: null };

  const doc = {
    metadata: {
      generatedAt: new Date().toISOString(),
      todayLocal: TODAY_LA,
      available: true,
      source: {
        weather: 'California Irrigation Management Information System (CIMIS)',
        weatherUrl: 'https://et.water.ca.gov/',
        chillModel:
          'Dynamic Model (chill portions) — Fishman, Erez & Couvillon (1987)',
        chillModelUrl:
          'https://fruitsandnuts.ucdavis.edu/about-chilling-hours-units-and-portions',
        degreeDayMethod:
          'Single-sine method with horizontal cutoff (UC IPM)',
        degreeDayMethodUrl: 'https://ipm.ucanr.edu/WEATHER/ddss-cutoff.html',
      },
      station,
      chillSeason: {
        start: CHILL_SEASON_START,
        end: CHILL_SEASON_END,
        hourlyRecordsTotal: hourlyRecs.length,
        hourlyRecordsValid: validHourly.length,
      },
      degreeDayWindow: {
        start: DD_START,
        end: DD_END,
        dailyRecordsTotal: dailyRecs.length,
        dailyRecordsValid: validDaily.length,
      },
      caveat:
        'Chill portion and degree-day estimates are decision-support only. Confirm with UC IPM and a local PCA before scheduling sprays or evaluating chill satisfaction.',
    },
    chill: {
      portions: Number(chillPortions.toFixed(2)),
      season: { start: CHILL_SEASON_START, end: CHILL_SEASON_END },
    },
    degreeDays: ddByPest,
    blocks,
  };

  writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2));
  console.log(
    `[phenology] Wrote ${OUT_PATH}: chill portions=${doc.chill.portions} / DD-PTB=${ddByPest.peachTwigBorer.cumulativeDDF} / DD-NOW=${ddByPest.navelOrangeworm.cumulativeDDF}`,
  );
}

function pestModelsForReport() {
  const out = {};
  for (const [k, m] of Object.entries(PEST_MODELS)) {
    out[k] = {
      pest: m.pest,
      lowerF: m.lowerF,
      upperF: m.upperF,
      method: m.method,
      sourceUrl: m.sourceUrl,
      appliesTo: m.appliesTo,
    };
  }
  return out;
}

main().catch(err => {
  // Even on unexpected failure, write an unavailable state so the dashboard
  // never renders fabricated values AND the build still succeeds. Vercel /
  // CI must never fail solely because CIMIS is unreachable or buggy.
  console.error(
    `[phenology] unexpected error (build will continue): ${redactKey(err?.message || String(err))}`,
  );
  if (err?.stack) console.error(redactKey(err.stack));
  try {
    writeUnavailable(
      `Unexpected build error: ${err?.message || String(err)}`,
      err?.errorKind || 'unexpected',
      {
        httpStatus: err?.httpStatus ?? null,
        models: pestModelsForReport(),
      },
    );
  } catch (writeErr) {
    console.error(
      `[phenology] failed to write unavailable state: ${redactKey(writeErr?.message || String(writeErr))}`,
    );
  }
  // Exit 0 so npm prebuild does not fail the Vercel/CI build.
  process.exit(0);
});
