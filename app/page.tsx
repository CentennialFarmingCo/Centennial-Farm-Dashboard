'use client';

import { useState } from "react";
import { Sprout, MapPin, Sun, Cloud, FileText, Printer } from "lucide-react";
import FIELDS_DATA from "./fields.js";

export default function App() {
  const [tab, setTab] = useState("blocks");

  const tabs = [
    { id: "today", label: "Today", icon: Sun },
    { id: "blocks", label: "Blocks", icon: MapPin },
    { id: "map", label: "Map", icon: Sprout },
    { id: "weather", label: "Weather", icon: Cloud },
    { id: "report", label: "PDF Report", icon: FileText },
  ];

  return (
    <div style={{ backgroundColor: '#F4EEE0', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* HEADER — forced peach color */}
      <header style={{ backgroundColor: '#C55A2E', color: 'white', padding: '1.5rem', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Sprout style={{ width: '40px', height: '40px' }} />
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: '600', fontFamily: 'serif' }}>Centennial Farming</h1>
            <p style={{ fontSize: '0.875rem', opacity: '0.9' }}>Block-by-Block Agronomy • Merced County, CA • 2026 Season</p>
          </div>
        </div>
      </header>

      {/* TABS */}
      <div style={{ position: 'sticky', top: '85px', zIndex: 40, backgroundColor: 'white', borderBottom: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', overflowX: 'auto' }}>
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '1rem 1.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  whiteSpace: 'nowrap',
                  borderBottom: active ? '4px solid #C55A2E' : 'none',
                  color: active ? '#C55A2E' : '#4b5563',
                  backgroundColor: active ? '#F4EEE0' : 'transparent',
                }}
              >
                <t.icon style={{ width: '20px', height: '20px' }} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main style={{ padding: '1.5rem', maxWidth: '1280px', margin: '0 auto' }}>
        {tab === "blocks" && (
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              All Blocks 
              <span style={{ fontSize: '0.875rem', backgroundColor: '#86efac', color: '#166534', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontWeight: '500' }}>
                {FIELDS_DATA.length} total loaded
              </span>
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
              {FIELDS_DATA.map(field => (
                <div key={field.id} style={{ backgroundColor: 'white', borderRadius: '1.5rem', padding: '1.5rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', border: '1px solid #fed7aa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontWeight: '600', fontSize: '1.125rem', lineHeight: '1.25' }}>{field.block}</p>
                      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>{field.ranch} • {field.variety}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '2.25rem', fontWeight: '700', color: '#C55A2E' }}>{field.acres}</p>
                      <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4ade80' }}>acres</p>
                      <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>{field.crop}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "today" && (
          <div style={{ backgroundColor: 'white', borderRadius: '1.5rem', padding: '2rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem' }}>Today’s Snapshot</h2>
            <p style={{ color: '#6b7280' }}>Phenology + smart tasks will appear here</p>
          </div>
        )}

        {tab === "map" && (
          <div style={{ backgroundColor: 'white', borderRadius: '1.5rem', padding: '2rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem' }}>Interactive Farm Map</h2>
            <p style={{ color: '#6b7280' }}>45 shaded polygons loaded — full clickable map next</p>
          </div>
        )}

        {tab === "weather" && (
          <div style={{ backgroundColor: 'white', borderRadius: '1.5rem', padding: '2rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem' }}>Weather & Irrigation Alerts</h2>
            <p style={{ color: '#6b7280' }}>Real-time conditions coming next</p>
          </div>
        )}

        {tab === "report" && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <button 
              onClick={() => window.print()}
              style={{ backgroundColor: '#C55A2E', color: 'white', padding: '1rem 2.5rem', borderRadius: '9999px', fontSize: '1.125rem', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 10px 15px -3px rgba(197,90,46,0.3)' }}
            >
              <Printer style={{ width: '28px', height: '28px' }} />
              Generate Full PDF Report
            </button>
          </div>
        )}
      </main>

      <footer style={{ textAlign: 'center', padding: '2rem', color: '#6b7280', fontSize: '0.75rem', borderTop: '1px solid #e5e7eb', backgroundColor: 'white' }}>
        Centennial Farming Company • 45 fields • 2026 Season • Built live on Vercel 🚜
      </footer>
    </div>
  );
}
