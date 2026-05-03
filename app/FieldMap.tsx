'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSON, LatLngBounds, Layer, PathOptions, TileLayer as LeafletTileLayer, Path, Polygon } from "leaflet";
import { formatAcres } from "./stats";
import {
  HYDROLOGIC_GROUP_COLORS,
  HYDROLOGIC_GROUP_DESC,
  soilColor,
  type SoilFeature,
  type SoilFeatureCollection,
} from "./soils";

type FieldFeature = {
  type: 'Feature';
  properties: {
    kmlName: string;
    fieldNumber: number | null;
    block: string | null;
    ranch: string | null;
    variety: string | null;
    crop: string | null;
    acres: number | null;
    fieldId: number | null;
    matched: boolean;
  };
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
};

type FieldsCollection = {
  type: 'FeatureCollection';
  metadata?: {
    source?: string;
    generated?: string;
    polygonCount?: number;
    matchedCount?: number;
  };
  features: FieldFeature[];
};

type Props = {
  filteredIds: Set<number>;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  ranchColor: (ranch: string) => string;
  cropBg: (crop: string) => string;
};

type Basemap = 'satellite' | 'streets';

export default function FieldMap({
  filteredIds,
  selectedId,
  onSelect,
  ranchColor,
  cropBg,
}: Props) {
  const [data, setData] = useState<FieldsCollection | null>(null);
  const [soils, setSoils] = useState<SoilFeatureCollection | null>(null);
  const [soilError, setSoilError] = useState<string | null>(null);
  const [showSoils, setShowSoils] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<Basemap>('satellite');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LeafletGeoJSON | null>(null);
  const soilLayerRef = useRef<LeafletGeoJSON | null>(null);
  const tileRef = useRef<{ satellite: LeafletTileLayer; streets: LeafletTileLayer } | null>(null);
  const boundsRef = useRef<LatLngBounds | null>(null);
  const idToLayerRef = useRef<globalThis.Map<number, Layer>>(new globalThis.Map());

  // Load Leaflet CSS once on the client. Loading via JS keeps the static export
  // self-contained without a hard build-time CSS import in layout.tsx.
  useEffect(() => {
    const id = 'leaflet-css';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('fields.geojson')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: FieldsCollection) => { if (!cancelled) setData(json); })
      .catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, []);

  // Lazily fetch the soils overlay only when the user first toggles it on,
  // so the static landing experience stays slim.
  useEffect(() => {
    if (!showSoils || soils || soilError) return;
    let cancelled = false;
    fetch('soils.geojson')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: SoilFeatureCollection) => { if (!cancelled) setSoils(json); })
      .catch(e => { if (!cancelled) setSoilError(String(e)); });
    return () => { cancelled = true; };
  }, [showSoils, soils, soilError]);

  const styleFor = useMemo(() => {
    return (feature: FieldFeature): PathOptions => {
      const id = feature.properties.fieldId;
      const inFilter = id != null && filteredIds.has(id);
      const isSelected = id != null && selectedId === id;
      const ranch = feature.properties.ranch ?? '';
      const crop = feature.properties.crop ?? '';
      const stroke = isSelected ? '#ffffff' : ranchColor(ranch);
      const fill = inFilter ? cropBg(crop) : '#888888';
      return {
        color: stroke,
        weight: isSelected ? 3 : 1.5,
        opacity: 1,
        fillColor: fill,
        fillOpacity: isSelected ? 0.75 : inFilter ? 0.55 : 0.2,
      };
    };
  }, [filteredIds, selectedId, ranchColor, cropBg]);

  // Initialize the map once data is available.
  useEffect(() => {
    if (!data || !containerRef.current || mapRef.current) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        worldCopyJump: false,
      });
      mapRef.current = map;

      const satellite = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 19,
          attribution:
            'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics, USDA, USGS, AeroGRID, IGN, GIS User Community',
        },
      );
      const streets = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png',
        {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      );
      tileRef.current = { satellite, streets };
      satellite.addTo(map);

      const layer = L.geoJSON(data as GeoJSON.GeoJsonObject, {
        style: (feat) => styleFor(feat as unknown as FieldFeature),
        onEachFeature: (feat, lyr) => {
          const f = feat as unknown as FieldFeature;
          const id = f.properties.fieldId;
          if (id != null) idToLayerRef.current.set(id, lyr);
          const acres = f.properties.acres;
          const labelBlock = f.properties.block ?? f.properties.kmlName;
          const tooltip = `${labelBlock}${acres != null ? ` — ${formatAcres(acres)} ac` : ''}`;
          lyr.bindTooltip(tooltip, { sticky: true, direction: 'top', opacity: 0.9 });
          lyr.on({
            click: () => {
              if (id != null) onSelect(id);
            },
            mouseover: (e) => {
              const target = e.target as Path;
              target.setStyle({ weight: 3, fillOpacity: 0.7 });
              target.bringToFront();
            },
            mouseout: (e) => {
              const target = e.target as Path;
              target.setStyle(styleFor(f));
            },
          });
        },
      }).addTo(map);
      layerRef.current = layer;

      const bounds = layer.getBounds();
      boundsRef.current = bounds;
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [24, 24] });
      } else {
        map.setView([37.41, -120.77], 14);
      }

      cleanup = () => {
        map.remove();
        mapRef.current = null;
        layerRef.current = null;
        soilLayerRef.current = null;
        tileRef.current = null;
        idToLayerRef.current.clear();
      };
    })().catch(e => {
      if (!cancelled) setError(`Map init failed: ${e}`);
    });

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
    // We deliberately only initialize on data load; styleFor changes are
    // handled by a separate effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Re-style polygons whenever filter or selection changes.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.eachLayer((lyr) => {
      const f = (lyr as unknown as { feature: FieldFeature }).feature;
      if (!f) return;
      (lyr as Path).setStyle(styleFor(f));
    });
  }, [styleFor]);

  // Pan/zoom to selected polygon when selection changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedId == null) return;
    const lyr = idToLayerRef.current.get(selectedId) as Polygon | undefined;
    if (!lyr) return;
    const b = lyr.getBounds();
    if (b.isValid()) {
      map.flyToBounds(b, { padding: [40, 40], duration: 0.5, maxZoom: 17 });
    }
    lyr.bringToFront();
  }, [selectedId]);

  // Switch basemap when toggle changes.
  useEffect(() => {
    const map = mapRef.current;
    const tiles = tileRef.current;
    if (!map || !tiles) return;
    if (basemap === 'satellite') {
      if (map.hasLayer(tiles.streets)) map.removeLayer(tiles.streets);
      if (!map.hasLayer(tiles.satellite)) tiles.satellite.addTo(map);
    } else {
      if (map.hasLayer(tiles.satellite)) map.removeLayer(tiles.satellite);
      if (!map.hasLayer(tiles.streets)) tiles.streets.addTo(map);
    }
  }, [basemap]);

  // Add or remove the soil overlay layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;

    if (!showSoils || !soils) {
      if (soilLayerRef.current) {
        map.removeLayer(soilLayerRef.current);
        soilLayerRef.current = null;
      }
      return;
    }
    if (soilLayerRef.current) return; // already present

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !mapRef.current) return;
      const layer = L.geoJSON(soils as unknown as GeoJSON.GeoJsonObject, {
        style: (feat) => {
          const f = feat as unknown as SoilFeature;
          return {
            color: '#222',
            weight: 0.5,
            opacity: 0.6,
            fillColor: soilColor(f.properties.hydrologicGroup),
            fillOpacity: 0.55,
          } as PathOptions;
        },
        onEachFeature: (feat, lyr) => {
          const f = feat as unknown as SoilFeature;
          const p = f.properties;
          const lines = [
            `<strong>${p.musym ?? '—'} · ${p.muname ?? 'Unnamed map unit'}</strong>`,
            p.dominantComponent ? `Dominant: ${p.dominantComponent}` : null,
            p.drainageClass ? `Drainage: ${p.drainageClass}` : null,
            p.hydrologicGroup ? `Hydrologic group: ${p.hydrologicGroup}` : null,
            `${formatAcres(p.acres)} ac in this field`,
          ].filter(Boolean).join('<br/>');
          lyr.bindTooltip(lines, { sticky: true, direction: 'top', opacity: 0.95 });
        },
      });
      // Insert below the field outlines so the field stroke remains readable.
      layer.addTo(mapRef.current!);
      if (layerRef.current) layerRef.current.bringToFront();
      soilLayerRef.current = layer;
    })().catch(e => {
      if (!cancelled) setSoilError(`Soil overlay failed: ${e}`);
    });

    return () => { cancelled = true; };
  }, [showSoils, soils]);

  const selectedFeature = useMemo(() => {
    if (!data || selectedId == null) return null;
    return data.features.find(f => f.properties.fieldId === selectedId) ?? null;
  }, [data, selectedId]);

  function resetView() {
    const map = mapRef.current;
    const bounds = boundsRef.current;
    if (map && bounds && bounds.isValid()) {
      map.flyToBounds(bounds, { padding: [24, 24], duration: 0.4 });
    }
  }

  if (error) {
    return (
      <div style={{ padding: '24px', backgroundColor: '#fff', borderRadius: '12px', color: '#a33' }}>
        Could not load field map: {error}
      </div>
    );
  }

  const totalPolys = data?.metadata?.polygonCount ?? data?.features.length ?? 0;
  const matchedCount = data?.metadata?.matchedCount ?? data?.features.filter(f => f.properties.matched).length ?? 0;

  return (
    <div style={{ display: 'grid', gap: '8px' }} data-testid="field-map">
      <div
        style={{
          position: 'relative',
          backgroundColor: '#1a1a1a',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid #d0c8b0',
          boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.05)',
        }}
      >
        <div
          ref={containerRef}
          role="application"
          aria-label={`Satellite map of ${totalPolys} field boundaries`}
          style={{ width: '100%', height: '560px' }}
        />
        {!data && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              backgroundColor: 'rgba(0,0,0,0.4)',
            }}
          >
            Loading field boundaries…
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            zIndex: 500,
            display: 'flex',
            gap: '4px',
            backgroundColor: 'rgba(255,255,255,0.92)',
            padding: '4px',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        >
          <BasemapBtn active={basemap === 'satellite'} onClick={() => setBasemap('satellite')} label="Satellite" />
          <BasemapBtn active={basemap === 'streets'} onClick={() => setBasemap('streets')} label="Streets" />
          <button
            type="button"
            onClick={resetView}
            title="Fit to all fields"
            aria-label="Fit to all fields"
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #ccc',
              backgroundColor: 'white',
              fontWeight: 500,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Fit
          </button>
          <BasemapBtn
            active={showSoils}
            onClick={() => setShowSoils(v => !v)}
            label={showSoils ? 'Soils ✓' : 'Soils'}
            ariaLabel={showSoils ? 'Hide USDA soil overlay' : 'Show USDA soil overlay'}
          />
        </div>
        {showSoils && (
          <SoilLegend loading={!soils && !soilError} error={soilError} meta={soils?.metadata} />
        )}
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            zIndex: 500,
            backgroundColor: 'rgba(255,255,255,0.9)',
            borderRadius: '6px',
            padding: '4px 8px',
            fontSize: '11px',
            color: '#333',
          }}
        >
          {totalPolys} fields · {matchedCount} matched · drag to pan · scroll to zoom
        </div>
      </div>
      {selectedFeature && (
        <div
          role="status"
          style={{
            backgroundColor: 'white',
            border: '1px solid #e5dec7',
            borderRadius: '10px',
            padding: '8px 12px',
            fontSize: '13px',
            color: '#333',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span>
            Selected: <strong>{selectedFeature.properties.block ?? selectedFeature.properties.kmlName}</strong>
            {selectedFeature.properties.acres != null && (
              <> · {formatAcres(selectedFeature.properties.acres)} ac</>
            )}
            {selectedFeature.properties.crop && <> · {selectedFeature.properties.crop}</>}
          </span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #C55A2E',
              backgroundColor: 'white',
              color: '#C55A2E',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Clear
          </button>
        </div>
      )}
      {matchedCount < totalPolys && (
        <div
          role="note"
          style={{
            backgroundColor: '#FFF7E6',
            border: '1px solid #f5d493',
            borderRadius: '10px',
            padding: '8px 12px',
            fontSize: '12px',
            color: '#7a5b1a',
          }}
        >
          {totalPolys - matchedCount} placemark(s) could not be matched to <code>app/fields.js</code> by block name.
          They are displayed using the KML name only.
        </div>
      )}
    </div>
  );
}

function BasemapBtn({
  active,
  onClick,
  label,
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      style={{
        padding: '6px 10px',
        borderRadius: '6px',
        border: active ? '1px solid #C55A2E' : '1px solid #ccc',
        backgroundColor: active ? '#C55A2E' : 'white',
        color: active ? 'white' : '#333',
        fontWeight: active ? 600 : 500,
        fontSize: '12px',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function SoilLegend({
  loading,
  error,
  meta,
}: {
  loading: boolean;
  error: string | null;
  meta: SoilFeatureCollection['metadata'];
}) {
  return (
    <div
      role="region"
      aria-label="USDA SSURGO soil overlay legend"
      style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        zIndex: 500,
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: '8px',
        padding: '8px 10px',
        fontSize: '11px',
        color: '#333',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        maxWidth: '220px',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '12px' }}>
        Soil — USDA SSURGO
      </div>
      {loading && <div style={{ color: '#666' }}>Loading soil data…</div>}
      {error && <div style={{ color: '#a33' }}>Could not load soils: {error}</div>}
      {!loading && !error && (
        <>
          <div style={{ color: '#555', marginBottom: '6px' }}>
            Colored by hydrologic group (runoff potential).
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '3px' }}>
            {Object.entries(HYDROLOGIC_GROUP_COLORS).map(([group, color]) => (
              <li key={group} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '3px',
                    backgroundColor: color,
                    border: '1px solid rgba(0,0,0,0.2)',
                  }}
                />
                <span><strong>{group}</strong> · {HYDROLOGIC_GROUP_DESC[group]}</span>
              </li>
            ))}
          </ul>
          <div style={{ color: '#777', marginTop: '6px', fontSize: '10px', lineHeight: 1.3 }}>
            Source:{' '}
            <a
              href="https://websoilsurvey.nrcs.usda.gov/"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#3F4F2C' }}
            >
              USDA NRCS Web Soil Survey (SSURGO)
            </a>
            {meta?.retrievedAt && (
              <> · retrieved {meta.retrievedAt.slice(0, 10)}</>
            )}
            <br />
            Survey lines are approximate; not a substitute for field sampling.
          </div>
        </>
      )}
    </div>
  );
}
