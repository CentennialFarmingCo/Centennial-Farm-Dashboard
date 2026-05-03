'use client';

import { useMemo, useState } from "react";
import { FIELDS, formatAcres, type Field } from "./stats";

const RANCH_COLORS: Record<string, string> = {
  Johnston: '#C55A2E',
  'Blue Lupin': '#3B7A57',
  Fagundes: '#B8860B',
  Mello: '#6B4E9B',
  'Angel Ranch': '#2E86AB',
};

const CROP_BG: Record<string, string> = {
  'Freestone Peach': '#FDE6D3',
  'Cling Peach': '#FCD7B6',
  Almond: '#E8E0CB',
};

function ranchColor(ranch: string): string {
  return RANCH_COLORS[ranch] ?? '#C55A2E';
}

function cropBg(crop: string): string {
  return CROP_BG[crop] ?? '#F4EEE0';
}

export default function BlockExplorer() {
  const [crop, setCrop] = useState<string>('all');
  const [ranch, setRanch] = useState<string>('all');
  const [variety, setVariety] = useState<string>('all');
  const [query, setQuery] = useState<string>('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const crops = useMemo(
    () => Array.from(new Set(FIELDS.map(f => f.crop))).sort(),
    []
  );
  const ranches = useMemo(
    () => Array.from(new Set(FIELDS.map(f => f.ranch))).sort(),
    []
  );
  const varieties = useMemo(
    () => Array.from(new Set(FIELDS.map(f => f.variety))).sort(),
    []
  );

  const filtered: Field[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FIELDS.filter(f => {
      if (crop !== 'all' && f.crop !== crop) return false;
      if (ranch !== 'all' && f.ranch !== ranch) return false;
      if (variety !== 'all' && f.variety !== variety) return false;
      if (q && !`${f.block} ${f.ranch} ${f.variety} ${f.crop}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [crop, ranch, variety, query]);

  const filteredAcres = filtered.reduce((s, f) => s + f.acres, 0);
  const maxAcres = Math.max(...FIELDS.map(f => f.acres), 1);
  const selected = selectedId != null ? FIELDS.find(f => f.id === selectedId) ?? null : null;

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    fontSize: '14px',
  };

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div
        style={{
          backgroundColor: '#FFF7E6',
          border: '1px solid #f5d493',
          borderRadius: '12px',
          padding: '12px 16px',
          fontSize: '13px',
          color: '#7a5b1a',
        }}
        data-testid="map-note"
      >
        <strong>Note:</strong> True field boundary polygons are not yet loaded.
        This explorer lets you browse blocks proportionally by acreage. To enable
        a true geographic map, drop a KML or GeoJSON file in <code>app/</code> and we can wire it up.
      </div>

      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '24px',
          padding: '20px',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
          display: 'grid',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Search blocks…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            data-testid="block-search"
            aria-label="Search blocks"
            style={{ ...selectStyle, flex: '1 1 200px', minWidth: '180px' }}
          />
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: '12px', color: '#555' }}>
            Crop
            <select
              value={crop}
              onChange={e => setCrop(e.target.value)}
              data-testid="filter-crop"
              style={selectStyle}
            >
              <option value="all">All crops</option>
              {crops.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: '12px', color: '#555' }}>
            Ranch
            <select
              value={ranch}
              onChange={e => setRanch(e.target.value)}
              data-testid="filter-ranch"
              style={selectStyle}
            >
              <option value="all">All ranches</option>
              {ranches.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: '12px', color: '#555' }}>
            Variety
            <select
              value={variety}
              onChange={e => setVariety(e.target.value)}
              data-testid="filter-variety"
              style={selectStyle}
            >
              <option value="all">All varieties</option>
              {varieties.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => { setCrop('all'); setRanch('all'); setVariety('all'); setQuery(''); setSelectedId(null); }}
            data-testid="reset-filters"
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #C55A2E',
              backgroundColor: 'white',
              color: '#C55A2E',
              cursor: 'pointer',
              fontWeight: 500,
              alignSelf: 'flex-end',
            }}
          >
            Reset
          </button>
        </div>
        <div style={{ fontSize: '13px', color: '#555' }} aria-live="polite">
          Showing <strong>{filtered.length}</strong> of {FIELDS.length} blocks
          &middot; <strong>{formatAcres(filteredAcres)}</strong> acres
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 320px)',
          gap: '16px',
        }}
        className="cf-explorer-grid"
      >
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '24px',
            padding: '16px',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
            minHeight: '420px',
          }}
          data-testid="block-grid"
        >
          {filtered.length === 0 ? (
            <p style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
              No blocks match your filters.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                gap: '8px',
              }}
            >
              {filtered.map(f => {
                const ratio = f.acres / maxAcres;
                const minH = 70;
                const maxH = 160;
                const height = Math.round(minH + ratio * (maxH - minH));
                const isSelected = selectedId === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedId(isSelected ? null : f.id)}
                    aria-pressed={isSelected}
                    data-testid={`block-tile-${f.id}`}
                    title={`${f.block} — ${formatAcres(f.acres)} acres`}
                    style={{
                      height: `${height}px`,
                      backgroundColor: cropBg(f.crop),
                      borderRadius: '10px',
                      border: isSelected ? `3px solid ${ranchColor(f.ranch)}` : '1px solid rgba(0,0,0,0.06)',
                      borderLeft: `6px solid ${ranchColor(f.ranch)}`,
                      padding: '8px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transform: isSelected ? 'translateY(-2px)' : 'none',
                      transition: 'transform 120ms ease',
                      boxShadow: isSelected ? '0 8px 20px rgba(197,90,46,0.25)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#333', lineHeight: 1.2 }}>
                      {f.block.replace(/^.*?Block /, 'Blk ').replace(f.ranch + ' ', '')}
                    </span>
                    <span style={{ fontSize: '18px', fontWeight: 700, color: '#222' }}>
                      {formatAcres(f.acres)}
                      <span style={{ fontSize: '10px', fontWeight: 500, color: '#666' }}> ac</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside
          style={{
            backgroundColor: 'white',
            borderRadius: '24px',
            padding: '20px',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
            alignSelf: 'start',
          }}
          aria-label="Block details"
          data-testid="block-details"
        >
          {selected ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '4px',
                    backgroundColor: ranchColor(selected.ranch),
                  }}
                />
                <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>{selected.block}</h3>
              </div>
              <dl style={{ display: 'grid', gap: '8px', fontSize: '14px', margin: 0 }}>
                <div><dt style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase' }}>Ranch</dt><dd style={{ margin: 0 }}>{selected.ranch}</dd></div>
                <div><dt style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase' }}>Crop</dt><dd style={{ margin: 0 }}>{selected.crop}</dd></div>
                <div><dt style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase' }}>Variety</dt><dd style={{ margin: 0 }}>{selected.variety}</dd></div>
                <div>
                  <dt style={{ color: '#888', fontSize: '11px', textTransform: 'uppercase' }}>Acres</dt>
                  <dd style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#C55A2E' }}>
                    {formatAcres(selected.acres)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 10px' }}>Legend</h3>
              <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                Tile size shows relative acreage. Color stripe shows the ranch.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '6px', fontSize: '13px' }}>
                {Object.entries(RANCH_COLORS).map(([name, color]) => (
                  <li key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span aria-hidden="true" style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: color }} />
                    {name}
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: '12px', color: '#888', marginTop: '14px' }}>
                Click any tile for full block details.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
