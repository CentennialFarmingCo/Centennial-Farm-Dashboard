'use client';

import { useState, useId } from "react";
import { Sprout, MapPin, Sun, Cloud, FileText, Printer, AlertTriangle, Snowflake } from "lucide-react";
import {
  FIELDS,
  totalFields,
  totalAcres,
  formatAcres,
  ranches,
  crops,
  varieties,
  largestBlocks,
  dataWarnings,
} from "./stats";
import BlockExplorer from "./BlockExplorer";
import Weather from "./Weather";
import SeasonalModels from "./SeasonalModels";

export default function App() {
  const [tab, setTab] = useState("today");
  const tablistId = useId();

  const tabs = [
    { id: "today", label: "Today", icon: Sun },
    { id: "blocks", label: "Blocks", icon: MapPin },
    { id: "map", label: "Map", icon: Sprout },
    { id: "weather", label: "Weather", icon: Cloud },
    { id: "seasonal", label: "Seasonal Models", icon: Snowflake },
    { id: "report", label: "PDF Report", icon: FileText },
  ];

  const totalAcresLabel = formatAcres(totalAcres);
  const topVariety = varieties[0];
  const topRanch = ranches[0];
  const peachAcres = crops.filter(c => c.name.includes('Peach')).reduce((s, c) => s + c.acres, 0);
  const almondAcres = crops.find(c => c.name === 'Almond')?.acres ?? 0;

  return (
    <div
      style={{
        backgroundColor: '#F4EEE0',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ position: 'sticky', top: 0, zIndex: 50 }}>
        <header
          style={{
            backgroundColor: '#C55A2E',
            color: 'white',
            padding: '24px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Sprout style={{ width: '48px', height: '48px' }} aria-hidden="true" />
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 600, fontFamily: 'serif' }}>Centennial Farming</h1>
              <p style={{ fontSize: '14px', opacity: 0.9 }}>
                Block-by-Block Agronomy &bull; Merced County, CA &bull; 2026 Season
              </p>
            </div>
          </div>
        </header>

        <div
          role="tablist"
          aria-label="Dashboard sections"
          id={tablistId}
          style={{
            backgroundColor: 'white',
            borderBottom: '1px solid #ddd',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', overflowX: 'auto' }}>
            {tabs.map(t => {
              const active = tab === t.id;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`${tablistId}-tab-${t.id}`}
                  aria-selected={active}
                  aria-controls={`${tablistId}-panel-${t.id}`}
                  tabIndex={active ? 0 : -1}
                  data-testid={`tab-${t.id}`}
                  onClick={() => setTab(t.id)}
                  style={{
                    flex: 1,
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontWeight: 500,
                    border: 'none',
                    borderBottom: active ? '4px solid #C55A2E' : '4px solid transparent',
                    color: active ? '#C55A2E' : '#444',
                    backgroundColor: active ? '#F4EEE0' : 'transparent',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Icon style={{ width: '22px', height: '22px' }} aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto', width: '100%', flex: 1 }}>
        <section
          role="tabpanel"
          id={`${tablistId}-panel-today`}
          aria-labelledby={`${tablistId}-tab-today`}
          hidden={tab !== "today"}
        >
          {tab === "today" && (
            <div style={{ display: 'grid', gap: '16px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '12px',
                }}
                data-testid="kpi-grid"
              >
                <Kpi label="Total Blocks" value={String(totalFields)} accent="#C55A2E" />
                <Kpi label="Total Acres" value={totalAcresLabel} accent="#3B7A57" />
                <Kpi label="Ranches" value={String(ranches.length)} accent="#B8860B" />
                <Kpi label="Crops" value={String(crops.length)} accent="#6B4E9B" />
                <Kpi label="Varieties" value={String(varieties.length)} accent="#2E86AB" />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '16px',
                }}
              >
                <Panel title="Acres by Crop" testId="acres-by-crop">
                  <BarList items={crops.map(c => ({ name: c.name, value: c.acres, sub: `${c.blocks} blocks` }))} />
                </Panel>
                <Panel title="Acres by Ranch" testId="acres-by-ranch">
                  <BarList items={ranches.map(r => ({ name: r.name, value: r.acres, sub: `${r.blocks} blocks` }))} />
                </Panel>
                <Panel title="Top Varieties (by acres)" testId="top-varieties">
                  <BarList items={varieties.slice(0, 6).map(v => ({ name: v.name, value: v.acres, sub: `${v.blocks} blocks` }))} />
                </Panel>
                <Panel title="Largest Blocks" testId="largest-blocks">
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
                    {largestBlocks.map(b => (
                      <li
                        key={b.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          backgroundColor: '#F4EEE0',
                          borderRadius: '10px',
                        }}
                      >
                        <span>
                          <strong>{b.block}</strong>
                          <span style={{ color: '#666', fontSize: '12px', display: 'block' }}>
                            {b.crop} &middot; {b.variety}
                          </span>
                        </span>
                        <span style={{ fontWeight: 700, color: '#C55A2E' }}>{formatAcres(b.acres)} ac</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>

              <Panel title="Quick Summary" testId="quick-summary">
                <p style={{ lineHeight: 1.6, color: '#444' }}>
                  {totalFields} blocks across {ranches.length} ranches totalling
                  {' '}<strong>{totalAcresLabel} acres</strong>. The largest single block is
                  {' '}<strong>{largestBlocks[0].block}</strong> at {formatAcres(largestBlocks[0].acres)} acres.
                  {' '}Peach plantings cover {formatAcres(peachAcres)} acres
                  {' '}and almonds cover {formatAcres(almondAcres)} acres.
                  {topVariety ? <> Most-planted variety: <strong>{topVariety.name}</strong> ({formatAcres(topVariety.acres)} ac).</> : null}
                  {topRanch ? <> Largest ranch by acreage: <strong>{topRanch.name}</strong> ({formatAcres(topRanch.acres)} ac).</> : null}
                </p>
              </Panel>

              {dataWarnings.length > 0 && (
                <Panel title="Data Quality" testId="data-warnings">
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '6px' }}>
                    {dataWarnings.map(w => (
                      <li key={`${w.id}-${w.message}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#7a5b1a' }}>
                        <AlertTriangle style={{ width: '16px', height: '16px' }} aria-hidden="true" />
                        <span><strong>{w.block}:</strong> {w.message}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </div>
          )}
        </section>

        <section
          role="tabpanel"
          id={`${tablistId}-panel-blocks`}
          aria-labelledby={`${tablistId}-tab-blocks`}
          hidden={tab !== "blocks"}
        >
          {tab === "blocks" && (
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '24px' }}>
                All Blocks ({totalFields} total &middot; {totalAcresLabel} acres)
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                {FIELDS.map(field => (
                  <div
                    key={field.id}
                    style={{
                      backgroundColor: 'white',
                      borderRadius: '24px',
                      padding: '24px',
                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                      border: '1px solid #fed7aa',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: '18px' }}>{field.block}</p>
                        <p style={{ color: '#666', marginTop: '4px' }}>{field.ranch} &bull; {field.variety}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '36px', fontWeight: 700, color: '#C55A2E', lineHeight: 1 }}>{formatAcres(field.acres)}</p>
                        <p style={{ fontSize: '12px', textTransform: 'uppercase', color: '#4ade80' }}>acres</p>
                        <p style={{ fontSize: '13px', color: '#888', marginTop: '8px' }}>{field.crop}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section
          role="tabpanel"
          id={`${tablistId}-panel-map`}
          aria-labelledby={`${tablistId}-tab-map`}
          hidden={tab !== "map"}
        >
          {tab === "map" && <BlockExplorer />}
        </section>

        <section
          role="tabpanel"
          id={`${tablistId}-panel-weather`}
          aria-labelledby={`${tablistId}-tab-weather`}
          hidden={tab !== "weather"}
        >
          {tab === "weather" && <Weather />}
        </section>

        <section
          role="tabpanel"
          id={`${tablistId}-panel-seasonal`}
          aria-labelledby={`${tablistId}-tab-seasonal`}
          hidden={tab !== "seasonal"}
        >
          {tab === "seasonal" && <SeasonalModels />}
        </section>

        <section
          role="tabpanel"
          id={`${tablistId}-panel-report`}
          aria-labelledby={`${tablistId}-tab-report`}
          hidden={tab !== "report"}
        >
          {tab === "report" && (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <button
                type="button"
                onClick={() => window.print()}
                data-testid="print-report"
                style={{
                  backgroundColor: '#C55A2E',
                  color: 'white',
                  padding: '16px 40px',
                  borderRadius: '9999px',
                  fontSize: '18px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 10px 15px -3px rgba(197,90,46,0.4)',
                }}
              >
                <Printer style={{ width: '28px', height: '28px' }} aria-hidden="true" />
                Generate Full Season PDF Report
              </button>
              <p style={{ marginTop: '24px', color: '#666' }}>
                One-click printable report with all blocks, phenology &amp; tasks
              </p>
            </div>
          )}
        </section>
      </main>

      <footer
        style={{
          textAlign: 'center',
          padding: '32px',
          color: '#666',
          fontSize: '13px',
          borderTop: '1px solid #ddd',
          backgroundColor: 'white',
        }}
      >
        Centennial Farming Company &bull; {totalFields} fields &bull; {totalAcresLabel} acres &bull; 2026 Season
      </footer>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '20px',
        padding: '20px',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.08)',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: '12px', textTransform: 'uppercase', color: '#888', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ fontSize: '32px', fontWeight: 700, color: accent, lineHeight: 1.1 }}>{value}</p>
    </div>
  );
}

function Panel({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '24px',
        padding: '20px',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
      }}
      data-testid={testId}
    >
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', color: '#333' }}>{title}</h3>
      {children}
    </div>
  );
}

function BarList({ items }: { items: { name: string; value: number; sub?: string }[] }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '10px' }}>
      {items.map(item => {
        const pct = Math.round((item.value / max) * 100);
        return (
          <li key={item.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
              <span>
                <strong>{item.name}</strong>
                {item.sub ? <span style={{ color: '#888' }}> &middot; {item.sub}</span> : null}
              </span>
              <span style={{ fontWeight: 600, color: '#C55A2E' }}>{formatAcres(item.value)} ac</span>
            </div>
            <div style={{ backgroundColor: '#F4EEE0', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  backgroundColor: '#C55A2E',
                  borderRadius: '999px',
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
