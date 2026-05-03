'use client';

import { useState, useId } from "react";
import { Sprout, MapPin, Sun, Cloud, FileText, Printer } from "lucide-react";
import { FIELDS_DATA } from "./fields.js";

export default function App() {
  const [tab, setTab] = useState("blocks");
  const tablistId = useId();

  const tabs = [
    { id: "today", label: "Today", icon: Sun },
    { id: "blocks", label: "Blocks", icon: MapPin },
    { id: "map", label: "Map", icon: Sprout },
    { id: "weather", label: "Weather", icon: Cloud },
    { id: "report", label: "PDF Report", icon: FileText },
  ];

  const totalFields = FIELDS_DATA.length;
  const totalAcres = FIELDS_DATA.reduce((sum, f) => sum + f.acres, 0);
  const totalAcresLabel = Number.isInteger(totalAcres)
    ? totalAcres.toString()
    : totalAcres.toFixed(1);

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
      {/* STICKY WRAPPER — header + tabs share one sticky container so they cannot overlap */}
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

      {/* MAIN CONTENT */}
      <main style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto', width: '100%', flex: 1 }}>
        <section
          role="tabpanel"
          id={`${tablistId}-panel-blocks`}
          aria-labelledby={`${tablistId}-tab-blocks`}
          hidden={tab !== "blocks"}
        >
          {tab === "blocks" && (
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '24px' }}>
                All Blocks ({totalFields} total)
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                {FIELDS_DATA.map(field => (
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
                        <p style={{ fontSize: '36px', fontWeight: 700, color: '#C55A2E', lineHeight: 1 }}>{field.acres}</p>
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
          id={`${tablistId}-panel-today`}
          aria-labelledby={`${tablistId}-tab-today`}
          hidden={tab !== "today"}
        >
          {tab === "today" && (
            <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '32px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '24px' }}>
                Today&rsquo;s Snapshot
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{ backgroundColor: '#F4EEE0', padding: '24px', borderRadius: '16px', textAlign: 'center' }}>
                  <p style={{ color: '#555' }}>Pit Hardening Window</p>
                  <p style={{ fontSize: '36px', fontWeight: 700, color: '#C55A2E' }}>42 days</p>
                </div>
                <div style={{ backgroundColor: '#F4EEE0', padding: '24px', borderRadius: '16px', textAlign: 'center' }}>
                  <p style={{ color: '#555' }}>High Priority Tasks</p>
                  <p style={{ fontSize: '36px', fontWeight: 700, color: '#f97316' }}>7</p>
                </div>
                <div style={{ backgroundColor: '#F4EEE0', padding: '24px', borderRadius: '16px', textAlign: 'center' }}>
                  <p style={{ color: '#555' }}>Total Acres</p>
                  <p style={{ fontSize: '36px', fontWeight: 700, color: '#4ade80' }}>{totalAcresLabel}</p>
                </div>
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
          {tab === "map" && (
            <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '40px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '16px' }}>Interactive Farm Map</h2>
              <p style={{ color: '#555', marginBottom: '8px' }}>{totalFields} shaded polygons from your KML</p>
              <p style={{ color: '#888' }}>Full clickable version with zoom coming next</p>
            </div>
          )}
        </section>

        <section
          role="tabpanel"
          id={`${tablistId}-panel-weather`}
          aria-labelledby={`${tablistId}-tab-weather`}
          hidden={tab !== "weather"}
        >
          {tab === "weather" && (
            <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '40px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '16px' }}>Weather &amp; Irrigation Alerts</h2>
              <p style={{ color: '#555' }}>Real-time conditions + RDI recommendations coming next</p>
            </div>
          )}
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
