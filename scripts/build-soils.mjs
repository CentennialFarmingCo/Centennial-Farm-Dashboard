// Fetches SSURGO soil map units intersecting the field AOI from USDA NRCS
// Soil Data Access (SDA), clips them to the field polygons, and writes:
//   - public/soils.geojson         GeoJSON of clipped soil polygons (per field)
//   - public/soil-summary.json     Per-field soil composition (acres + %)
//
// Source: USDA NRCS Soil Data Access (SDA) — https://sdmdataaccess.nrcs.usda.gov
// No API key required; the service is free and authoritative for SSURGO.
//
// Run: node scripts/build-soils.mjs   (or `npm run soil:build`)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import polygonClipping from 'polygon-clipping';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FIELDS_PATH = join(ROOT, 'public', 'fields.geojson');
const SOILS_PATH = join(ROOT, 'public', 'soils.geojson');
const SUMMARY_PATH = join(ROOT, 'public', 'soil-summary.json');

const SDA_URL = 'https://sdmdataaccess.nrcs.usda.gov/Tabular/post.rest';

function bboxOfFeatures(features) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of features) {
    for (const ring of f.geometry.coordinates) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  // pad slightly so SSURGO map units that just touch our boundary are included
  const padX = 0.005, padY = 0.005;
  return [minX - padX, minY - padY, maxX + padX, maxY + padY];
}

function bboxToWkt([minX, minY, maxX, maxY]) {
  return `POLYGON((${minX} ${minY}, ${maxX} ${minY}, ${maxX} ${maxY}, ${minX} ${maxY}, ${minX} ${minY}))`;
}

async function sdaPost(query) {
  const r = await fetch(SDA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'JSON', query }),
  });
  const txt = await r.text();
  if (!r.ok) {
    throw new Error(`SDA HTTP ${r.status}: ${txt.slice(0, 400)}`);
  }
  return JSON.parse(txt);
}

// Parse SQL Server WKT POLYGON or MULTIPOLYGON into a polygon-clipping geom
// (an array of polygons, each polygon = array of rings, each ring = [[x,y],...]).
function parseWktToGeom(wkt) {
  const trimmed = wkt.trim();
  if (trimmed.startsWith('MULTIPOLYGON')) {
    // MULTIPOLYGON(((x y, ...), (...)), ((x y, ...)))
    const inner = trimmed.slice('MULTIPOLYGON'.length).trim().replace(/^\(\(\(/, '').replace(/\)\)\)$/, '');
    // split top-level polygons by ")),(("  but be careful with nested parens
    return splitMultiPolygon(trimmed);
  }
  if (trimmed.startsWith('POLYGON')) {
    const inner = trimmed.slice('POLYGON'.length).trim();
    return [parsePolygon(inner)];
  }
  throw new Error('Unsupported WKT: ' + trimmed.slice(0, 60));
}

function splitMultiPolygon(wkt) {
  // Strip MULTIPOLYGON( and trailing )
  let s = wkt.slice('MULTIPOLYGON'.length).trim();
  if (!s.startsWith('(') || !s.endsWith(')')) throw new Error('bad multipolygon');
  s = s.slice(1, -1);
  // s now: (((x y, ...), (...)), ((x y, ...)))
  // Split at "), (" where the next char starts a new polygon group
  const polys = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        polys.push(s.slice(start, i + 1));
        // skip optional ", "
        while (i + 1 < s.length && (s[i + 1] === ',' || s[i + 1] === ' ')) i++;
        start = i + 1;
      }
    }
  }
  return polys.map(parsePolygon);
}

function parsePolygon(polyWkt) {
  // polyWkt is "((x y, x y, ...), (x y, ...))"
  let s = polyWkt.trim();
  if (!s.startsWith('(') || !s.endsWith(')')) throw new Error('bad polygon');
  s = s.slice(1, -1);
  // Split rings by "),("
  const rings = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        rings.push(s.slice(start, i + 1));
        while (i + 1 < s.length && (s[i + 1] === ',' || s[i + 1] === ' ')) i++;
        start = i + 1;
      }
    }
  }
  if (rings.length === 0) {
    // Single ring without inner parens — SSURGO geometries typically wrap the ring in parens already
    rings.push('(' + s + ')');
  }
  return rings.map(parseRing);
}

function parseRing(ringWkt) {
  let s = ringWkt.trim();
  if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1);
  return s.split(',').map(pair => {
    const [x, y] = pair.trim().split(/\s+/).map(Number);
    return [x, y];
  });
}

// Spherical excess area (m^2) for a GeoJSON-style ring of [lon,lat] degrees.
// Reference: Chamberlain & Duquette, "Some Algorithms for Polygons on a Sphere",
// JPL Publication 07-3 (2007). Adequate for planar farm-scale fields.
const EARTH_RADIUS_M = 6378137; // WGS84 equatorial radius
function ringAreaM2(ring) {
  if (ring.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % ring.length];
    total += toRad(lon2 - lon1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return Math.abs(total * EARTH_RADIUS_M * EARTH_RADIUS_M / 2);
}
function toRad(d) { return d * Math.PI / 180; }
const M2_PER_ACRE = 4046.8564224;

function polyAreaAcres(polygons) {
  // polygons: polygon-clipping geom (array of polygons; each polygon = outer + holes)
  let area = 0;
  for (const poly of polygons) {
    if (!poly.length) continue;
    area += ringAreaM2(poly[0]);
    for (let h = 1; h < poly.length; h++) area -= ringAreaM2(poly[h]);
  }
  return area / M2_PER_ACRE;
}

function geomToGeoJsonGeometry(geom) {
  if (geom.length === 1) {
    return { type: 'Polygon', coordinates: geom[0] };
  }
  return { type: 'MultiPolygon', coordinates: geom };
}

async function main() {
  const fields = JSON.parse(readFileSync(FIELDS_PATH, 'utf8'));
  if (fields.type !== 'FeatureCollection') {
    throw new Error('fields.geojson is not a FeatureCollection');
  }
  console.log(`Loaded ${fields.features.length} field polygons`);

  const bbox = bboxOfFeatures(fields.features);
  const aoiWkt = bboxToWkt(bbox);
  console.log(`AOI bbox (WGS84): ${bbox.map(n => n.toFixed(5)).join(', ')}`);

  console.log('Querying USDA SDA for map unit metadata (mapunit + dominant component)...');
  const muSql = `
    SELECT m.mukey, l.areasymbol, m.musym, m.muname,
           c.compname, c.comppct_r, c.drainagecl, c.hydgrp,
           c.taxorder, c.taxsuborder, c.taxgrtgroup
    FROM mapunit AS m
    INNER JOIN legend AS l ON l.lkey = m.lkey
    LEFT JOIN component AS c
      ON c.mukey = m.mukey AND c.majcompflag = 'Yes'
    WHERE m.mukey IN (
      SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${aoiWkt}')
    )
  `;
  const muResp = await sdaPost(muSql);
  const muMeta = new Map();
  for (const row of muResp.Table ?? []) {
    const [mukey, areasymbol, musym, muname, compname, comppct, drainagecl, hydgrp, taxorder, taxsuborder, taxgrtgroup] = row;
    // First (highest-pct) major component wins; if mukey already present, keep it.
    if (muMeta.has(mukey)) continue;
    muMeta.set(mukey, {
      mukey, areasymbol, musym, muname,
      dominantComponent: compname || null,
      dominantPct: comppct != null ? Number(comppct) : null,
      drainageClass: drainagecl || null,
      hydrologicGroup: hydgrp || null,
      taxOrder: taxorder || null,
      taxSuborder: taxsuborder || null,
      taxGreatGroup: taxgrtgroup || null,
    });
  }
  console.log(`Map units in AOI: ${muMeta.size}`);

  console.log('Querying USDA SDA for soil polygon geometries (mupolygon)...');
  const polySql = `
    SELECT mupolygonkey, mukey, mupolygongeo.STAsText() AS wkt
    FROM mupolygon
    WHERE mupolygonkey IN (
      SELECT * FROM SDA_Get_Mupolygonkey_from_intersection_with_WktWgs84('${aoiWkt}')
    )
  `;
  const polyResp = await sdaPost(polySql);
  const soilPolys = (polyResp.Table ?? []).map(([mupolygonkey, mukey, wkt]) => ({
    mupolygonkey, mukey, geom: parseWktToGeom(wkt),
  }));
  console.log(`Soil polygons fetched: ${soilPolys.length}`);

  // Index soil polys by mukey for quick lookup; we still need to iterate all to clip.
  // For each field, intersect every overlapping soil polygon with the field polygon.
  const summary = [];
  const clippedFeatures = [];
  let totalIntersections = 0;

  for (const field of fields.features) {
    const fieldId = field.properties.fieldId;
    const block = field.properties.block ?? field.properties.kmlName;
    if (fieldId == null) continue;

    const fieldGeom = field.geometry.type === 'Polygon'
      ? [field.geometry.coordinates]
      : field.geometry.coordinates; // MultiPolygon
    const fieldAcres = polyAreaAcres(fieldGeom);

    // Bounding box of field for fast prefilter
    let fxmin = Infinity, fymin = Infinity, fxmax = -Infinity, fymax = -Infinity;
    for (const poly of fieldGeom) for (const ring of poly) for (const [x, y] of ring) {
      if (x < fxmin) fxmin = x; if (x > fxmax) fxmax = x;
      if (y < fymin) fymin = y; if (y > fymax) fymax = y;
    }

    const compositions = new Map(); // mukey -> acres

    for (const sp of soilPolys) {
      // bbox prefilter
      let pxmin = Infinity, pymin = Infinity, pxmax = -Infinity, pymax = -Infinity;
      for (const poly of sp.geom) for (const ring of poly) for (const [x, y] of ring) {
        if (x < pxmin) pxmin = x; if (x > pxmax) pxmax = x;
        if (y < pymin) pymin = y; if (y > pymax) pymax = y;
      }
      if (pxmax < fxmin || pxmin > fxmax || pymax < fymin || pymin > fymax) continue;

      let inter;
      try {
        inter = polygonClipping.intersection(fieldGeom, sp.geom);
      } catch (e) {
        // Some SSURGO polygons trip the clipper on degenerate edges; skip with a warning.
        console.warn(`  ! intersection failed field=${fieldId} mupolygonkey=${sp.mupolygonkey}: ${e.message}`);
        continue;
      }
      if (!inter || !inter.length) continue;

      const acres = polyAreaAcres(inter);
      if (acres < 0.001) continue; // ignore slivers <0.001 ac

      compositions.set(sp.mukey, (compositions.get(sp.mukey) ?? 0) + acres);
      totalIntersections++;

      const meta = muMeta.get(sp.mukey) ?? {};
      clippedFeatures.push({
        type: 'Feature',
        geometry: geomToGeoJsonGeometry(inter),
        properties: {
          fieldId,
          block,
          mukey: sp.mukey,
          musym: meta.musym ?? null,
          muname: meta.muname ?? null,
          areasymbol: meta.areasymbol ?? null,
          dominantComponent: meta.dominantComponent ?? null,
          drainageClass: meta.drainageClass ?? null,
          hydrologicGroup: meta.hydrologicGroup ?? null,
          taxOrder: meta.taxOrder ?? null,
          acres: Number(acres.toFixed(3)),
        },
      });
    }

    const totalSoilAcres = Array.from(compositions.values()).reduce((s, a) => s + a, 0);
    const components = Array.from(compositions.entries())
      .map(([mukey, acres]) => {
        const meta = muMeta.get(mukey) ?? {};
        return {
          mukey,
          musym: meta.musym ?? null,
          muname: meta.muname ?? null,
          dominantComponent: meta.dominantComponent ?? null,
          drainageClass: meta.drainageClass ?? null,
          hydrologicGroup: meta.hydrologicGroup ?? null,
          taxOrder: meta.taxOrder ?? null,
          acres: Number(acres.toFixed(3)),
          percent: totalSoilAcres > 0 ? Number(((acres / totalSoilAcres) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.acres - a.acres);

    summary.push({
      fieldId,
      block,
      ranch: field.properties.ranch,
      reportedAcres: field.properties.acres ?? null,
      polygonAcres: Number(fieldAcres.toFixed(2)),
      soilCoverageAcres: Number(totalSoilAcres.toFixed(2)),
      coveragePct: fieldAcres > 0 ? Number(((totalSoilAcres / fieldAcres) * 100).toFixed(1)) : 0,
      components,
    });
  }

  const generated = new Date().toISOString();
  const provenance = {
    source: 'USDA NRCS Soil Data Access (SDA) — SSURGO',
    sourceUrl: SDA_URL,
    retrievedAt: generated,
    method: 'SDA_Get_Mukey_from_intersection_with_WktWgs84 + SDA_Get_Mupolygonkey_from_intersection_with_WktWgs84; clipped to field polygons via polygon-clipping (Greiner-Hormann)',
    aoiBbox: bbox,
    caveat: 'Soil survey lines are approximate and not a substitute for on-site sampling.',
  };

  const soilFc = {
    type: 'FeatureCollection',
    metadata: {
      ...provenance,
      polygonCount: clippedFeatures.length,
      mapUnitCount: muMeta.size,
      fieldCount: summary.length,
    },
    features: clippedFeatures,
  };
  writeFileSync(SOILS_PATH, JSON.stringify(soilFc));
  console.log(`Wrote ${SOILS_PATH} (${clippedFeatures.length} clipped polygons across ${summary.length} fields)`);

  const summaryDoc = {
    metadata: {
      ...provenance,
      fieldCount: summary.length,
      mapUnitCount: muMeta.size,
    },
    fields: summary,
  };
  writeFileSync(SUMMARY_PATH, JSON.stringify(summaryDoc, null, 2));
  console.log(`Wrote ${SUMMARY_PATH} (${summary.length} field summaries)`);

  // Sanity: ensure every field has at least one component
  const empty = summary.filter(s => s.components.length === 0).map(s => s.fieldId);
  if (empty.length) {
    console.warn(`WARNING: ${empty.length} fields have no soil components: ${empty.join(', ')}`);
  }
  console.log(`Total field/soil intersections kept: ${totalIntersections}`);
}

main().catch(err => {
  console.error('build-soils FAILED:', err);
  process.exit(1);
});
