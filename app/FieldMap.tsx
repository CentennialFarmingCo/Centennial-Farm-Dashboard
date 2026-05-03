'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { formatAcres } from "./stats";

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

const VIEW_W = 800;
const VIEW_H = 560;
const PAD = 24;

export default function FieldMap({
  filteredIds,
  selectedId,
  onSelect,
  ranchColor,
  cropBg,
}: Props) {
  const [data, setData] = useState<FieldsCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Use basePath-aware URL: relative to current page so it works under any deploy path.
    fetch('fields.geojson')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: FieldsCollection) => { if (!cancelled) setData(json); })
      .catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, []);

  const projected = useMemo(() => {
    if (!data) return null;
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const f of data.features) {
      for (const ring of f.geometry.coordinates) {
        for (const [lon, lat] of ring) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
    // Equirectangular projection with mid-lat scaling — accurate enough at sub-km extents.
    const midLat = (minLat + maxLat) / 2;
    const lonScale = Math.cos((midLat * Math.PI) / 180);
    const projLon = (lon: number) => (lon - minLon) * lonScale;
    const projLat = (lat: number) => (maxLat - lat); // flip Y so north is up
    const wx = (maxLon - minLon) * lonScale;
    const hy = (maxLat - minLat);
    const scale = Math.min(
      (VIEW_W - PAD * 2) / wx,
      (VIEW_H - PAD * 2) / hy,
    );
    const offsetX = (VIEW_W - wx * scale) / 2;
    const offsetY = (VIEW_H - hy * scale) / 2;
    const toXY = (lon: number, lat: number) => [
      projLon(lon) * scale + offsetX,
      projLat(lat) * scale + offsetY,
    ] as const;

    const polys = data.features.map(f => {
      const id = f.properties.fieldId;
      const ring = f.geometry.coordinates[0] ?? [];
      const path = ring
        .map(([lon, lat], i) => {
          const [x, y] = toXY(lon, lat);
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ') + ' Z';
      // Centroid for label placement.
      let cx = 0, cy = 0;
      for (const [lon, lat] of ring.slice(0, -1)) { // last point repeats first
        const [x, y] = toXY(lon, lat);
        cx += x; cy += y;
      }
      const n = Math.max(ring.length - 1, 1);
      cx /= n; cy /= n;
      return {
        id,
        path,
        cx,
        cy,
        props: f.properties,
      };
    });
    return { polys, bounds: { minLon, maxLon, minLat, maxLat } };
  }, [data]);

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const py = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setView(v => {
      const newScale = Math.max(1, Math.min(20, v.scale * factor));
      // Zoom toward cursor: keep the world-point under the cursor stable.
      const wx = (px - v.tx) / v.scale;
      const wy = (py - v.ty) / v.scale;
      return { scale: newScale, tx: px - wx * newScale, ty: py - wy * newScale };
    });
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const k = VIEW_W / rect.width;
    const dx = (e.clientX - dragRef.current.x) * k;
    const dy = (e.clientY - dragRef.current.y) * k;
    setView(v => ({ ...v, tx: dragRef.current!.tx + dx, ty: dragRef.current!.ty + dy }));
  }
  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    dragRef.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }

  function resetView() {
    setView({ scale: 1, tx: 0, ty: 0 });
  }

  if (error) {
    return (
      <div style={{ padding: '24px', backgroundColor: '#fff', borderRadius: '12px', color: '#a33' }}>
        Could not load <code>fields.geojson</code>: {error}
      </div>
    );
  }

  if (!projected) {
    return (
      <div style={{ padding: '24px', backgroundColor: '#fff', borderRadius: '12px', color: '#666' }}>
        Loading field boundaries…
      </div>
    );
  }

  const matchedCount = data?.metadata?.matchedCount ?? projected.polys.filter(p => p.props.matched).length;
  const totalPolys = data?.metadata?.polygonCount ?? projected.polys.length;

  return (
    <div style={{ display: 'grid', gap: '8px' }} data-testid="field-map">
      <div
        style={{
          position: 'relative',
          backgroundColor: '#F4EEE0',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid #e9dfc7',
          boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.05)',
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          width="100%"
          style={{ display: 'block', cursor: dragRef.current ? 'grabbing' : 'grab', touchAction: 'none' }}
          role="img"
          aria-label={`Map of ${totalPolys} field boundaries from Google Earth KML`}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
            {projected.polys.map(p => {
              const id = p.id;
              const inFilter = id != null && filteredIds.has(id);
              const isSelected = id != null && selectedId === id;
              const isHover = id != null && hoverId === id;
              const ranch = p.props.ranch ?? '';
              const crop = p.props.crop ?? '';
              const stroke = ranchColor(ranch);
              const fill = inFilter ? cropBg(crop) : '#dcd2bd';
              const opacity = inFilter ? 1 : 0.45;
              return (
                <path
                  key={p.props.kmlName}
                  d={p.path}
                  fill={fill}
                  fillOpacity={isSelected ? 0.95 : isHover ? 0.85 : opacity}
                  stroke={isSelected ? '#222' : stroke}
                  strokeWidth={(isSelected ? 2.5 : 1.2) / view.scale}
                  style={{ cursor: 'pointer', transition: 'fill-opacity 120ms' }}
                  onClick={(e) => { e.stopPropagation(); onSelect(id); }}
                  onMouseEnter={() => setHoverId(id)}
                  onMouseLeave={() => setHoverId(prev => (prev === id ? null : prev))}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(id);
                    }
                  }}
                  aria-label={`${p.props.block ?? p.props.kmlName}${p.props.acres != null ? `, ${formatAcres(p.props.acres)} acres` : ''}`}
                >
                  <title>
                    {p.props.block ?? p.props.kmlName}
                    {p.props.acres != null ? ` — ${formatAcres(p.props.acres)} ac` : ''}
                  </title>
                </path>
              );
            })}
            {/* Field-number labels (only when zoomed in enough to be readable). */}
            {view.scale >= 1.6 && projected.polys.map(p => (
              p.props.fieldNumber != null ? (
                <text
                  key={`lbl-${p.props.kmlName}`}
                  x={p.cx}
                  y={p.cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={10 / view.scale}
                  fontWeight={600}
                  fill="#222"
                  style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: 'rgba(255,255,255,0.85)', strokeWidth: 2 / view.scale }}
                >
                  {p.props.fieldNumber}
                </text>
              ) : null
            ))}
          </g>
        </svg>
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            display: 'flex',
            gap: '4px',
          }}
        >
          <MapBtn onClick={() => setView(v => ({ ...v, scale: Math.min(20, v.scale * 1.4) }))} label="+" title="Zoom in" />
          <MapBtn onClick={() => setView(v => ({ ...v, scale: Math.max(1, v.scale / 1.4) }))} label="−" title="Zoom out" />
          <MapBtn onClick={resetView} label="Reset" title="Reset view" />
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            backgroundColor: 'rgba(255,255,255,0.85)',
            borderRadius: '6px',
            padding: '4px 8px',
            fontSize: '11px',
            color: '#555',
          }}
        >
          {totalPolys} polygons · {matchedCount} matched to block list · scroll to zoom · drag to pan
        </div>
      </div>
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

function MapBtn({ onClick, label, title }: { onClick: () => void; label: string; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: label.length > 1 ? 'auto' : '32px',
        height: '32px',
        padding: label.length > 1 ? '0 10px' : 0,
        borderRadius: '6px',
        border: '1px solid #ccc',
        backgroundColor: 'white',
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      {label}
    </button>
  );
}
