// Fetches public California water/irrigation district polygons from the
// California DWR Water Districts ArcGIS FeatureServer, clips them to the
// field AOI, and writes:
//   - public/irrigation-districts.geojson  Clipped district polygons (per field)
//   - public/irrigation-summary.json       Per-field district composition (acres + %)
//
// Source: California DWR — Water Districts (i03_WaterDistricts)
// https://gis.water.ca.gov/arcgis/rest/services/Boundaries/i03_WaterDistricts/FeatureServer/0
// No API key required; the service is free public-agency data.
//
// Run: node scripts/build-districts.mjs   (or `npm run districts:build`)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import polygonClipping from 'polygon-clipping';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FIELDS_PATH = join(ROOT, 'public', 'fields.geojson');
const DISTRICTS_PATH = join(ROOT, 'public', 'irrigation-districts.geojson');
const SUMMARY_PATH = join(ROOT, 'public', 'irrigation-summary.json');

const DWR_QUERY_URL =
  'https://gis.water.ca.gov/arcgis/rest/services/Boundaries/i03_WaterDistricts/FeatureServer/0/query';

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
  // pad slightly so districts that just touch our boundary are included
  const padX = 0.005, padY = 0.005;
  return [minX - padX, minY - padY, maxX + padX, maxY + padY];
}

async function fetchDistrictsForBbox(bbox) {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: bbox.join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'OBJECTID,AGENCYNAME,SOURCE,AGENCYUNIQUEID,Date_Data_Applies_To',
    outSR: '4326',
    returnGeometry: 'true',
    f: 'geojson',
  });
  const url = `${DWR_QUERY_URL}?${params.toString()}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`DWR HTTP ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const json = JSON.parse(await r.text());
  if (!json || json.type !== 'FeatureCollection') {
    throw new Error('DWR response was not a GeoJSON FeatureCollection');
  }
  return json;
}

// Spherical excess area (m^2) for a GeoJSON-style ring of [lon,lat] degrees.
const EARTH_RADIUS_M = 6378137;
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
  let area = 0;
  for (const poly of polygons) {
    if (!poly.length) continue;
    area += ringAreaM2(poly[0]);
    for (let h = 1; h < poly.length; h++) area -= ringAreaM2(poly[h]);
  }
  return area / M2_PER_ACRE;
}

function geomToPolygonClipping(geom) {
  // Convert GeoJSON Polygon/MultiPolygon to polygon-clipping geom shape.
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  throw new Error(`Unsupported geometry type ${geom.type}`);
}

function geomToGeoJsonGeometry(geom) {
  if (geom.length === 1) {
    return { type: 'Polygon', coordinates: geom[0] };
  }
  return { type: 'MultiPolygon', coordinates: geom };
}

function bboxOfPolygonClippingGeom(geom) {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const poly of geom) for (const ring of poly) for (const [x, y] of ring) {
    if (x < xmin) xmin = x; if (x > xmax) xmax = x;
    if (y < ymin) ymin = y; if (y > ymax) ymax = y;
  }
  return [xmin, ymin, xmax, ymax];
}

// Heuristic: an "irrigation district" is the subset of public water agencies
// that primarily deliver surface water for agricultural irrigation. The DWR
// dataset bundles cities, mobile home parks, and CSDs in the same layer, so we
// flag the irrigation/agricultural ones for the UI to highlight.
function classifyAgency(name) {
  const lc = (name || '').toLowerCase();
  if (lc.includes('irrigation district')) return 'irrigation_district';
  if (lc.includes('water district') && !lc.includes('sanitary')) return 'water_district';
  if (lc.includes('reclamation district')) return 'reclamation_district';
  if (lc.includes('mutual water')) return 'mutual_water_company';
  if (lc.includes('community service') || lc.includes('csd')) return 'community_services';
  if (lc.includes('city of') || /\bcity\b/.test(lc) || lc.endsWith(' city')) return 'municipal';
  if (lc.includes('mobile home') || lc.includes('trailer')) return 'private_system';
  if (lc.includes('air force') || lc.includes('military')) return 'federal';
  if (lc.includes('sanitary') || lc.includes('sanitation')) return 'sanitary_district';
  return 'other';
}

function cleanName(name) {
  // DWR has names like "Atwater  City Of" with stray spacing; tidy without
  // changing the underlying authoritative name.
  return (name || '').replace(/\s+/g, ' ').trim();
}

async function main() {
  const fields = JSON.parse(readFileSync(FIELDS_PATH, 'utf8'));
  if (fields.type !== 'FeatureCollection') {
    throw new Error('fields.geojson is not a FeatureCollection');
  }
  console.log(`Loaded ${fields.features.length} field polygons`);

  const bbox = bboxOfFeatures(fields.features);
  console.log(`AOI bbox (WGS84): ${bbox.map(n => n.toFixed(5)).join(', ')}`);

  console.log('Querying California DWR Water Districts FeatureServer...');
  const districtsFc = await fetchDistrictsForBbox(bbox);
  if (!districtsFc.features.length) {
    throw new Error(
      'DWR returned zero district features for the field AOI. ' +
      'Refusing to write empty data — investigate before re-running.'
    );
  }
  console.log(`District features in AOI: ${districtsFc.features.length}`);

  // Deduplicate by AGENCYUNIQUEID + OBJECTID (DWR sometimes has multiple
  // polygons per agency); keep all geometry but index metadata once per unique
  // feature row.
  const districts = districtsFc.features.map((f, idx) => {
    const props = f.properties ?? {};
    const name = cleanName(props.AGENCYNAME);
    return {
      id: props.OBJECTID ?? idx,
      agencyName: name,
      agencyUniqueId: props.AGENCYUNIQUEID ?? null,
      source: props.SOURCE ?? null,
      dateApplies: props.Date_Data_Applies_To
        ? new Date(props.Date_Data_Applies_To).toISOString().slice(0, 10)
        : null,
      category: classifyAgency(name),
      geom: geomToPolygonClipping(f.geometry),
    };
  });

  for (const d of districts) {
    d.bbox = bboxOfPolygonClippingGeom(d.geom);
  }

  const summary = [];
  const clippedFeatures = [];
  let totalIntersections = 0;

  for (const field of fields.features) {
    const fieldId = field.properties.fieldId;
    const block = field.properties.block ?? field.properties.kmlName;
    if (fieldId == null) continue;

    const fieldGeom = field.geometry.type === 'Polygon'
      ? [field.geometry.coordinates]
      : field.geometry.coordinates;
    const fieldAcres = polyAreaAcres(fieldGeom);

    let fxmin = Infinity, fymin = Infinity, fxmax = -Infinity, fymax = -Infinity;
    for (const poly of fieldGeom) for (const ring of poly) for (const [x, y] of ring) {
      if (x < fxmin) fxmin = x; if (x > fxmax) fxmax = x;
      if (y < fymin) fymin = y; if (y > fymax) fymax = y;
    }

    // agencyUniqueId (or OBJECTID fallback) -> { acres, ... }
    const compositions = new Map();

    for (const d of districts) {
      const [pxmin, pymin, pxmax, pymax] = d.bbox;
      if (pxmax < fxmin || pxmin > fxmax || pymax < fymin || pymin > fymax) continue;

      let inter;
      try {
        inter = polygonClipping.intersection(fieldGeom, d.geom);
      } catch (e) {
        console.warn(`  ! intersection failed field=${fieldId} agency="${d.agencyName}": ${e.message}`);
        continue;
      }
      if (!inter || !inter.length) continue;

      const acres = polyAreaAcres(inter);
      if (acres < 0.001) continue;

      const key = d.agencyUniqueId != null ? `aid:${d.agencyUniqueId}` : `oid:${d.id}`;
      const existing = compositions.get(key);
      if (existing) {
        existing.acres += acres;
      } else {
        compositions.set(key, {
          key,
          agencyName: d.agencyName,
          agencyUniqueId: d.agencyUniqueId,
          source: d.source,
          dateApplies: d.dateApplies,
          category: d.category,
          acres,
        });
      }
      totalIntersections++;

      clippedFeatures.push({
        type: 'Feature',
        geometry: geomToGeoJsonGeometry(inter),
        properties: {
          fieldId,
          block,
          agencyName: d.agencyName,
          agencyUniqueId: d.agencyUniqueId,
          source: d.source,
          dateApplies: d.dateApplies,
          category: d.category,
          acres: Number(acres.toFixed(3)),
        },
      });
    }

    const totalDistrictAcres = Array.from(compositions.values()).reduce((s, c) => s + c.acres, 0);
    const components = Array.from(compositions.values())
      .map(c => ({
        agencyName: c.agencyName,
        agencyUniqueId: c.agencyUniqueId,
        source: c.source,
        dateApplies: c.dateApplies,
        category: c.category,
        acres: Number(c.acres.toFixed(3)),
        percent: fieldAcres > 0 ? Number(((c.acres / fieldAcres) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.acres - a.acres);

    summary.push({
      fieldId,
      block,
      ranch: field.properties.ranch,
      reportedAcres: field.properties.acres ?? null,
      polygonAcres: Number(fieldAcres.toFixed(2)),
      districtCoverageAcres: Number(totalDistrictAcres.toFixed(2)),
      coveragePct: fieldAcres > 0 ? Number(((totalDistrictAcres / fieldAcres) * 100).toFixed(1)) : 0,
      components,
    });
  }

  const generated = new Date().toISOString();
  const provenance = {
    source: 'California DWR — Water Districts (i03_WaterDistricts)',
    sourceUrl:
      'https://gis.water.ca.gov/arcgis/rest/services/Boundaries/i03_WaterDistricts/FeatureServer/0',
    retrievedAt: generated,
    method:
      'ArcGIS FeatureServer query with esriSpatialRelIntersects against the field AOI envelope; ' +
      'features returned in WGS84 (EPSG:4326) GeoJSON, then clipped to field polygons via polygon-clipping (Greiner-Hormann)',
    aoiBbox: bbox,
    caveat:
      'Boundaries shown are public-agency service-area boundaries published by the California Department of Water Resources. ' +
      'They do not represent actual delivery accounts, parcel-level service, or guaranteed surface-water availability. ' +
      'Confirm with the agency before relying on this overlay for operational decisions.',
  };

  const districtFc = {
    type: 'FeatureCollection',
    metadata: {
      ...provenance,
      polygonCount: clippedFeatures.length,
      districtCount: new Set(districts.map(d => d.agencyUniqueId ?? d.id)).size,
      fieldCount: summary.length,
    },
    features: clippedFeatures,
  };
  writeFileSync(DISTRICTS_PATH, JSON.stringify(districtFc));
  console.log(`Wrote ${DISTRICTS_PATH} (${clippedFeatures.length} clipped polygons across ${summary.length} fields)`);

  const summaryDoc = {
    metadata: {
      ...provenance,
      fieldCount: summary.length,
      districtCount: new Set(districts.map(d => d.agencyUniqueId ?? d.id)).size,
      districtsInAoi: districts.map(d => ({
        agencyName: d.agencyName,
        agencyUniqueId: d.agencyUniqueId,
        category: d.category,
        source: d.source,
      })),
    },
    fields: summary,
  };
  writeFileSync(SUMMARY_PATH, JSON.stringify(summaryDoc, null, 2));
  console.log(`Wrote ${SUMMARY_PATH} (${summary.length} field summaries)`);

  const empty = summary.filter(s => s.components.length === 0).map(s => s.fieldId);
  if (empty.length) {
    console.warn(`NOTE: ${empty.length} field(s) have no public district overlap: ${empty.join(', ')}`);
  }
  console.log(`Total field/district intersections kept: ${totalIntersections}`);
}

main().catch(err => {
  console.error('build-districts FAILED:', err);
  process.exit(1);
});
