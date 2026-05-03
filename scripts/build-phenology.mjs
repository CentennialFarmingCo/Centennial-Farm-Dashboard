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

// Chill season window. Default Nov 1 (prior calendar year) through Mar 1 of
// current calendar year, matching UC Davis chill accumulation reporting.
const today = new Date();
const yyyy = today.getUTCFullYear();
const CHILL_SEASON_START =
  process.env.CHILL_SEASON_START?.trim() || `${yyyy - 1}-11-01`;
const CHILL_SEASON_END =
  process.env.CHILL_SEASON_END?.trim() ||
  `${yyyy}-03-01`;

// Degree-day window. Default Jan 1 of current year through today.
// UC IPM trap-biofix dates differ year-to-year and by orchard; defaulting to
// season-to-date is clearly labelled in the UI as such.
const DD_START =
  process.env.PHENOLOGY_START_DATE?.trim() ||
  process.env.DEGREE_DAY_BIOFIX_PEACH?.trim() ||
  `${yyyy}-01-01`;
const DD_END =
  process.env.PHENOLOGY_END_DATE?.trim() ||
  isoDate(today);

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
async function fetchCimisHourly(stationId, startDate, endDate) {
  const url = new URL('https://et.water.ca.gov/api/data');
  url.searchParams.set('appKey', CIMIS_APP_KEY);
  url.searchParams.set('targets', stationId);
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('dataItems', 'hly-air-tmp');
  url.searchParams.set('unitOfMeasure', 'E'); // English (Fahrenheit)
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) {
    throw new Error(`CIMIS HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  return r.json();
}

async function fetchCimisDaily(stationId, startDate, endDate) {
  const url = new URL('https://et.water.ca.gov/api/data');
  url.searchParams.set('appKey', CIMIS_APP_KEY);
  url.searchParams.set('targets', stationId);
  url.searchParams.set('startDate', startDate);
  url.searchParams.set('endDate', endDate);
  url.searchParams.set('dataItems', 'day-air-tmp-min,day-air-tmp-max');
  url.searchParams.set('unitOfMeasure', 'E');
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) {
    throw new Error(`CIMIS HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  return r.json();
}

async function fetchCimisStationMeta(stationId) {
  const url = `https://et.water.ca.gov/api/station/${encodeURIComponent(stationId)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) {
    throw new Error(`CIMIS station meta HTTP ${r.status}`);
  }
  return r.json();
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

function unavailable(reason, extra = {}) {
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      available: false,
      reason,
      ...extra,
    },
    chill: null,
    degreeDays: null,
    blocks: [],
  };
}

function classifyPestForCrop(crop) {
  if (crop === 'Almond') return 'navelOrangeworm';
  if (crop === 'Freestone Peach' || crop === 'Cling Peach') return 'peachTwigBorer';
  return null;
}

async function main() {
  if (!CIMIS_APP_KEY) {
    const doc = unavailable(
      'No CIMIS_APP_KEY configured at build time. Set CIMIS_APP_KEY (and optionally CIMIS_STATION) to fetch live chill portions and pest degree-day totals. See README "Seasonal Models" section.',
      {
        configHint: {
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
          chillSeason: { start: CHILL_SEASON_START, end: CHILL_SEASON_END },
          degreeDayWindow: { start: DD_START, end: DD_END },
          stationId: CIMIS_STATION,
        },
        models: pestModelsForReport(),
      },
    );
    writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2));
    console.log(
      `No CIMIS_APP_KEY set; wrote ${OUT_PATH} with available:false (dashboard will render an unavailable state).`,
    );
    return;
  }

  console.log(`Fetching CIMIS station ${CIMIS_STATION} metadata...`);
  let stationMeta = null;
  try {
    const j = await fetchCimisStationMeta(CIMIS_STATION);
    stationMeta = j?.Stations?.[0] ?? null;
  } catch (e) {
    console.warn(`Station meta unavailable: ${e.message}`);
  }

  console.log(
    `Fetching CIMIS hourly air temperature ${CHILL_SEASON_START} → ${CHILL_SEASON_END} (chill window)...`,
  );
  let hourly;
  try {
    hourly = await fetchCimisHourly(
      CIMIS_STATION,
      CHILL_SEASON_START,
      CHILL_SEASON_END,
    );
  } catch (e) {
    const doc = unavailable(`CIMIS hourly fetch failed: ${e.message}`, {
      configHint: {
        stationId: CIMIS_STATION,
        chillSeason: { start: CHILL_SEASON_START, end: CHILL_SEASON_END },
        degreeDayWindow: { start: DD_START, end: DD_END },
      },
      models: pestModelsForReport(),
    });
    writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2));
    console.error(`Wrote unavailable state due to CIMIS hourly fetch failure.`);
    process.exitCode = 2;
    return;
  }

  const hourlyRecs = parseHourlyTempsF(hourly);
  const validHourly = hourlyRecs.filter(r => Number.isFinite(r.tF));
  console.log(
    `Hourly records: ${hourlyRecs.length} total / ${validHourly.length} with valid air temperature`,
  );

  const hourlyC = validHourly.map(r => fToC(r.tF));
  const chillPortions = chillPortionsFromHourlyC(hourlyC);

  console.log(
    `Fetching CIMIS daily min/max air temperature ${DD_START} → ${DD_END} (DD window)...`,
  );
  let daily;
  try {
    daily = await fetchCimisDaily(CIMIS_STATION, DD_START, DD_END);
  } catch (e) {
    const doc = unavailable(`CIMIS daily fetch failed: ${e.message}`, {
      configHint: {
        stationId: CIMIS_STATION,
        chillSeason: { start: CHILL_SEASON_START, end: CHILL_SEASON_END },
        degreeDayWindow: { start: DD_START, end: DD_END },
      },
      partialChillPortions: Number(chillPortions.toFixed(2)),
      models: pestModelsForReport(),
    });
    writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2));
    console.error(`Wrote unavailable state due to CIMIS daily fetch failure.`);
    process.exitCode = 2;
    return;
  }
  const dailyRecs = parseDailyTempsF(daily);
  const validDaily = dailyRecs.filter(
    r => Number.isFinite(r.tminF) && Number.isFinite(r.tmaxF),
  );
  console.log(
    `Daily records: ${dailyRecs.length} total / ${validDaily.length} with valid min+max`,
  );

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
    `Wrote ${OUT_PATH}: chill portions=${doc.chill.portions} / DD-PTB=${ddByPest.peachTwigBorer.cumulativeDDF} / DD-NOW=${ddByPest.navelOrangeworm.cumulativeDDF}`,
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
  console.error('build-phenology FAILED:', err);
  // Even on unexpected failure, write an unavailable state so the dashboard
  // never renders fabricated values.
  try {
    const doc = unavailable(`Unexpected build error: ${err.message}`, {
      models: pestModelsForReport(),
    });
    writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2));
  } catch {
    /* already failing */
  }
  process.exit(1);
});
