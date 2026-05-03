'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, Snowflake, Bug } from 'lucide-react';
import { FIELDS, formatAcres } from './stats';

type PestModel = {
  pest: string;
  biofix: string;
  windowEnd: string;
  cumulativeDDF: number;
  lowerF: number;
  upperF: number;
  method: string;
  sourceUrl: string;
};

type Block = {
  fieldId: number;
  block: string;
  ranch: string;
  crop: string;
  variety: string;
  acres: number;
  chillPortions: number;
  pestModelKey: 'peachTwigBorer' | 'navelOrangeworm' | null;
  pestModel: PestModel | null;
};

type DegreeDayEntry = {
  pest: string;
  lowerF: number;
  upperF: number;
  method: string;
  biofix: string;
  windowEnd: string;
  daysAccumulated: number;
  firstDate: string | null;
  lastDate: string | null;
  cumulativeDDF: number;
  sourceUrl: string;
};

type Station = {
  id: string;
  name: string | null;
  city?: string | null;
  county?: string | null;
  elevationFt?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

type PhenologyDoc = {
  metadata: {
    generatedAt: string;
    available: boolean;
    reason?: string;
    source?: {
      weather: string;
      weatherUrl: string;
      chillModel: string;
      chillModelUrl: string;
      degreeDayMethod: string;
      degreeDayMethodUrl: string;
    };
    station?: Station;
    chillSeason?: { start: string; end: string };
    degreeDayWindow?: { start: string; end: string };
    caveat?: string;
    configHint?: {
      requiredEnv?: string[];
      optionalEnv?: string[];
      stationId?: string;
      chillSeason?: { start: string; end: string };
      degreeDayWindow?: { start: string; end: string };
    };
  };
  chill: { portions: number; season: { start: string; end: string } } | null;
  degreeDays: Record<string, DegreeDayEntry> | null;
  blocks: Block[];
};

const card: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '24px',
  padding: '24px',
  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
};

const subCard: React.CSSProperties = {
  backgroundColor: '#F4EEE0',
  borderRadius: '14px',
  padding: '14px',
};

function formatDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function SeasonalModels() {
  const [doc, setDoc] = useState<PhenologyDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'peach' | 'almond'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('phenology-summary.json')
      .then(r => {
        if (!r.ok) throw new Error(`phenology-summary.json HTTP ${r.status}`);
        return r.json();
      })
      .then((json: PhenologyDoc) => {
        if (!cancelled) setDoc(json);
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const blocksByField = useMemo(() => {
    const m = new Map<number, Block>();
    for (const b of doc?.blocks ?? []) m.set(b.fieldId, b);
    return m;
  }, [doc]);

  const filteredFields = useMemo(() => {
    return FIELDS.filter(f => {
      if (filter === 'peach') return f.crop.includes('Peach');
      if (filter === 'almond') return f.crop === 'Almond';
      return true;
    });
  }, [filter]);

  if (loading) {
    return (
      <div style={card} data-testid="phenology-loading">
        <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '8px' }}>
          Seasonal Models
        </h2>
        <p style={{ color: '#666' }}>Loading chill portions and pest degree-days…</p>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div style={card} data-testid="phenology-error">
        <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '8px' }}>
          Seasonal Models unavailable
        </h2>
        <p style={{ color: '#a33' }}>{error ?? 'No data available.'}</p>
        <p style={{ color: '#666', fontSize: '13px', marginTop: '8px' }}>
          Run <code>npm run phenology:build</code> with a CIMIS_APP_KEY set to
          generate <code>public/phenology-summary.json</code>.
        </p>
      </div>
    );
  }

  if (!doc.metadata.available) {
    return <UnavailablePanel doc={doc} />;
  }

  const meta = doc.metadata;
  const chill = doc.chill!;
  const dd = doc.degreeDays!;
  const station = meta.station ?? { id: '?', name: null };

  const selected =
    selectedId != null
      ? FIELDS.find(f => f.id === selectedId) ?? null
      : null;
  const selectedBlock = selected ? blocksByField.get(selected.id) : null;

  return (
    <div style={{ display: 'grid', gap: '16px' }} data-testid="phenology-panel">
      <div style={card}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '16px',
          }}
        >
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '4px' }}>
              Seasonal Models
            </h2>
            <p style={{ color: '#666', fontSize: '13px' }}>
              CIMIS station {station.id}
              {station.name ? ` — ${station.name}` : ''}
              {station.city ? `, ${station.city}` : ''}
              {station.county ? `, ${station.county} County` : ''}
            </p>
            <p style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>
              Generated {formatDate(meta.generatedAt)}{' · '}
              All blocks share this station&apos;s record (single-station mode).
            </p>
          </div>
        </div>

        <div
          style={{
            marginTop: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
          }}
        >
          <Stat
            icon={<Snowflake style={{ width: 18, height: 18 }} aria-hidden />}
            label="Chill Portions (Dynamic Model)"
            value={chill.portions.toFixed(1)}
            sub={`${formatDate(chill.season.start)} → ${formatDate(chill.season.end)}`}
            color="#2E86AB"
          />
          <Stat
            icon={<Bug style={{ width: 18, height: 18 }} aria-hidden />}
            label="Peach twig borer DD°F"
            value={dd.peachTwigBorer.cumulativeDDF.toFixed(0)}
            sub={`since ${formatDate(dd.peachTwigBorer.biofix)}`}
            color="#C55A2E"
          />
          <Stat
            icon={<Bug style={{ width: 18, height: 18 }} aria-hidden />}
            label="Navel orangeworm DD°F"
            value={dd.navelOrangeworm.cumulativeDDF.toFixed(0)}
            sub={`since ${formatDate(dd.navelOrangeworm.biofix)}`}
            color="#B8860B"
          />
        </div>

        <div
          style={{
            marginTop: '16px',
            padding: '12px 14px',
            backgroundColor: '#FFF8E5',
            borderRadius: '12px',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
          }}
          data-testid="phenology-caveat"
        >
          <AlertTriangle
            style={{ width: 18, height: 18, color: '#7a5b1a', flexShrink: 0, marginTop: 2 }}
            aria-hidden
          />
          <p style={{ fontSize: '13px', color: '#7a5b1a', lineHeight: 1.4 }}>
            {meta.caveat ??
              'Estimates are decision-support only. Confirm with UC IPM and a local PCA before scheduling sprays or evaluating chill satisfaction.'}
          </p>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          Pest models
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '12px',
          }}
        >
          <PestModelCard entry={dd.peachTwigBorer} />
          <PestModelCard entry={dd.navelOrangeworm} />
        </div>
      </div>

      <div style={card}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '12px',
          }}
        >
          <h3 style={{ fontSize: '18px', fontWeight: 600 }}>
            Per-block totals ({filteredFields.length})
          </h3>
          <div role="tablist" aria-label="Crop filter" style={{ display: 'flex', gap: '6px' }}>
            {(['all', 'peach', 'almond'] as const).map(opt => (
              <button
                key={opt}
                type="button"
                role="tab"
                aria-selected={filter === opt}
                onClick={() => setFilter(opt)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '999px',
                  border: '1px solid #ddd',
                  backgroundColor: filter === opt ? '#C55A2E' : 'white',
                  color: filter === opt ? 'white' : '#444',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '12px',
          }}
          data-testid="phenology-block-grid"
        >
          {filteredFields.map(f => {
            const b = blocksByField.get(f.id);
            const isSelected = selectedId === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedId(isSelected ? null : f.id)}
                aria-pressed={isSelected}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: isSelected ? '2px solid #C55A2E' : '1px solid #eee',
                  backgroundColor: '#FAF6EC',
                  borderRadius: '14px',
                  padding: '14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: '8px',
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '14px' }}>{f.block}</p>
                    <p style={{ fontSize: '12px', color: '#666' }}>
                      {f.crop} · {f.variety}
                    </p>
                  </div>
                  <p style={{ fontSize: '11px', color: '#888' }}>
                    {formatAcres(f.acres)} ac
                  </p>
                </div>
                <div
                  style={{
                    marginTop: '10px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '6px',
                  }}
                >
                  <Mini
                    label="Chill portions"
                    value={b ? b.chillPortions.toFixed(1) : '—'}
                  />
                  <Mini
                    label={
                      b?.pestModelKey === 'peachTwigBorer'
                        ? 'PTB DD°F'
                        : b?.pestModelKey === 'navelOrangeworm'
                          ? 'NOW DD°F'
                          : 'Pest DD°F'
                    }
                    value={
                      b?.pestModel?.cumulativeDDF != null
                        ? b.pestModel.cumulativeDDF.toFixed(0)
                        : 'N/A'
                    }
                  />
                </div>
              </button>
            );
          })}
        </div>

        {selected && selectedBlock && (
          <div style={{ marginTop: '16px', ...subCard }} data-testid="phenology-block-detail">
            <p style={{ fontWeight: 600 }}>{selected.block}</p>
            <p style={{ fontSize: '13px', color: '#555' }}>
              {selected.ranch} · {selected.crop} · {selected.variety} ·{' '}
              {formatAcres(selected.acres)} ac
            </p>
            <div
              style={{
                marginTop: '10px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '8px',
              }}
            >
              <KV
                label="Chill portions (season-to-date)"
                value={selectedBlock.chillPortions.toFixed(1)}
              />
              {selectedBlock.pestModel ? (
                <>
                  <KV
                    label={`${selectedBlock.pestModel.pest} DD°F`}
                    value={selectedBlock.pestModel.cumulativeDDF.toFixed(0)}
                  />
                  <KV
                    label="Pest model thresholds"
                    value={`Lower ${selectedBlock.pestModel.lowerF}°F · Upper ${selectedBlock.pestModel.upperF}°F`}
                  />
                  <KV
                    label="Biofix → as of"
                    value={`${formatDate(selectedBlock.pestModel.biofix)} → ${formatDate(selectedBlock.pestModel.windowEnd)}`}
                  />
                </>
              ) : (
                <KV label="Pest model" value="N/A for this crop" />
              )}
            </div>
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
          Sources & methodology
        </h3>
        <ul
          style={{
            listStyle: 'disc',
            paddingLeft: '20px',
            margin: 0,
            color: '#444',
            fontSize: '13px',
            lineHeight: 1.5,
          }}
        >
          <li>
            Weather:{' '}
            <a href={meta.source?.weatherUrl} target="_blank" rel="noreferrer">
              {meta.source?.weather}
            </a>{' '}
            station #{station.id}
            {station.name ? ` (${station.name})` : ''}.
          </li>
          <li>
            Chill model:{' '}
            <a href={meta.source?.chillModelUrl} target="_blank" rel="noreferrer">
              {meta.source?.chillModel}
            </a>
            . Hourly air temperatures over{' '}
            {formatDate(chill.season.start)} → {formatDate(chill.season.end)}.
          </li>
          <li>
            Degree-day method:{' '}
            <a
              href={meta.source?.degreeDayMethodUrl}
              target="_blank"
              rel="noreferrer"
            >
              {meta.source?.degreeDayMethod}
            </a>
            .
          </li>
          <li>
            Per-pest thresholds and references documented in each pest card
            above; see UC IPM for biofix guidance.
          </li>
        </ul>
      </div>
    </div>
  );
}

function UnavailablePanel({ doc }: { doc: PhenologyDoc }) {
  const meta = doc.metadata;
  return (
    <div style={{ display: 'grid', gap: '16px' }} data-testid="phenology-unavailable">
      <div style={card}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <AlertTriangle
            style={{ width: 22, height: 22, color: '#7a5b1a', flexShrink: 0, marginTop: 4 }}
            aria-hidden
          />
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '6px' }}>
              Seasonal Models — data unavailable
            </h2>
            <p style={{ color: '#7a5b1a', fontSize: '14px', lineHeight: 1.5 }}>
              {meta.reason ??
                'Phenology data has not been generated. Run npm run phenology:build with a CIMIS_APP_KEY set.'}
            </p>
          </div>
        </div>

        <div
          style={{
            marginTop: '16px',
            backgroundColor: '#F4EEE0',
            borderRadius: '12px',
            padding: '14px',
            fontSize: '13px',
            color: '#444',
            lineHeight: 1.5,
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: '6px' }}>To enable:</p>
          <ol style={{ paddingLeft: '20px', margin: 0 }}>
            <li>
              Get a free CIMIS AppKey at{' '}
              <a
                href="https://et.water.ca.gov/Home/Register"
                target="_blank"
                rel="noreferrer"
              >
                et.water.ca.gov/Home/Register
              </a>
              .
            </li>
            <li>
              Set <code>CIMIS_APP_KEY</code> (and optionally{' '}
              <code>CIMIS_STATION</code>) as a build-time environment variable
              (Vercel project settings, GitHub Actions secret, or local{' '}
              <code>.env</code>).
            </li>
            <li>
              Run <code>npm run phenology:build</code> and commit the updated{' '}
              <code>public/phenology-summary.json</code>.
            </li>
          </ol>
          <p style={{ marginTop: '10px', color: '#666', fontSize: '12px' }}>
            No fabricated values are shown. The dashboard will display chill
            portions and pest degree-days only after a successful build.
          </p>
        </div>

        {meta.configHint && (
          <div
            style={{
              marginTop: '12px',
              fontSize: '12px',
              color: '#666',
            }}
          >
            <p>
              Default station:{' '}
              <strong>{meta.configHint.stationId ?? 'unset'}</strong>. Default
              chill window:{' '}
              <strong>
                {meta.configHint.chillSeason?.start} →{' '}
                {meta.configHint.chillSeason?.end}
              </strong>
              . Default DD window:{' '}
              <strong>
                {meta.configHint.degreeDayWindow?.start} →{' '}
                {meta.configHint.degreeDayWindow?.end}
              </strong>
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PestModelCard({ entry }: { entry: DegreeDayEntry }) {
  return (
    <div style={subCard}>
      <p style={{ fontWeight: 600, fontSize: '14px' }}>{entry.pest}</p>
      <p style={{ fontSize: '24px', fontWeight: 700, color: '#C55A2E', margin: '4px 0' }}>
        {entry.cumulativeDDF.toFixed(0)} <span style={{ fontSize: '13px', color: '#666' }}>DD°F</span>
      </p>
      <p style={{ fontSize: '12px', color: '#555' }}>
        {entry.method} · Lower {entry.lowerF}°F · Upper {entry.upperF}°F
      </p>
      <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
        Biofix {formatDate(entry.biofix)} → {formatDate(entry.windowEnd)} ·{' '}
        {entry.daysAccumulated} day{entry.daysAccumulated === 1 ? '' : 's'} accumulated
      </p>
      <p style={{ fontSize: '11px', marginTop: '6px' }}>
        <a
          href={entry.sourceUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            color: '#2E86AB',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          UC IPM source <ExternalLink style={{ width: 12, height: 12 }} aria-hidden />
        </a>
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div style={subCard}>
      <p
        style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          color: '#888',
          letterSpacing: '0.04em',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        {icon}
        {label}
      </p>
      <p style={{ fontSize: '28px', fontWeight: 700, color, lineHeight: 1.1 }}>
        {value}
      </p>
      {sub ? (
        <p style={{ fontSize: '12px', color: '#666' }}>{sub}</p>
      ) : null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '10px',
        padding: '8px 10px',
        border: '1px solid #eee',
      }}
    >
      <p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#888' }}>
        {label}
      </p>
      <p style={{ fontSize: '15px', fontWeight: 700, color: '#333' }}>{value}</p>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '10px',
        padding: '8px 10px',
        border: '1px solid #eee',
      }}
    >
      <p style={{ fontSize: '10px', textTransform: 'uppercase', color: '#888' }}>
        {label}
      </p>
      <p style={{ fontSize: '14px', fontWeight: 600, color: '#333' }}>{value}</p>
    </div>
  );
}
