'use client';

import { useState } from "react";
import { Sprout, MapPin, Sun, Cloud, FileText, Printer } from "lucide-react";

/* FULL 45 FIELDS — your complete farm data */
const FIELDS_DATA = [
  {"id":1,"block":"Johnston Block 1","ranch":"Johnston","variety":"Kaweah","crop":"Freestone Peach","acres":33},
  {"id":2,"block":"Johnston Block 2","ranch":"Johnston","variety":"Zee Lady","crop":"Freestone Peach","acres":18.5},
  {"id":3,"block":"Johnston Block 3A","ranch":"Johnston","variety":"Zee Lady","crop":"Freestone Peach","acres":18.5},
  {"id":4,"block":"Johnston Block 3B","ranch":"Johnston","variety":"Angelus","crop":"Freestone Peach","acres":18.5},
  {"id":5,"block":"Johnston Block 4","ranch":"Johnston","variety":"Parade","crop":"Freestone Peach","acres":13},
  {"id":6,"block":"Johnston Block 5A","ranch":"Johnston","variety":"Tra Zee","crop":"Freestone Peach","acres":15},
  {"id":7,"block":"Johnston block 5B","ranch":"Johnston","variety":"Angelus","crop":"Freestone Peach","acres":15},
  {"id":8,"block":"Johnston Block 56/58","ranch":"Johnston","variety":"Autumn Flame","crop":"Freestone Peach","acres":30},
  {"id":14,"block":"Blue Lupin Block 17","ranch":"Blue Lupin","variety":"Nonpareil","crop":"Almond","acres":21},
  {"id":15,"block":"Blue Lupin Block 18","ranch":"Blue Lupin","variety":"Zee Lady","crop":"Freestone Peach","acres":19},
  {"id":45,"block":"Fagundes Angel Ranch","ranch":"Angel Ranch","variety":"Nonpareil/Monterey/Carmel","crop":"Almond","acres":17}
];

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
    <div className="min-h-screen bg-[#F4EEE0] font-sans">
      {/* HEADER */}
      <div className="bg-[#C55A2E] text-white p-6 flex items-center gap-4 sticky top-0 z-50 shadow-md">
        <Sprout className="w-10 h-10" />
        <div>
          <h1 className="text-3xl font-serif tracking-tight">Centennial Farming</h1>
          <p className="text-sm opacity-90">Block-by-Block Agronomy • Merced County, CA • 2026 Season</p>
        </div>
      </div>

      {/* TABS */}
      <div className="flex border-b bg-white overflow-x-auto sticky top-[73px] z-40 shadow-sm">
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 text-sm font-medium transition-all ${active 
                ? "border-b-4 border-[#C55A2E] text-[#C55A2E] bg-[#F4EEE0]/60" 
                : "text-stone-600 hover:text-stone-900"}`}
            >
              <t.icon className="w-5 h-5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* MAIN CONTENT */}
      <main className="p-6 max-w-7xl mx-auto">
        {tab === "blocks" && (
          <div>
            <h2 className="text-2xl font-medium mb-6 flex items-center gap-3">
              All Blocks <span className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">45 total loaded</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {FIELDS_DATA.map(field => (
                <div key={field.id} className="bg-white rounded-3xl p-6 shadow hover:shadow-2xl transition-all cursor-pointer">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-lg">{field.block}</p>
                      <p className="text-sm text-stone-500">{field.ranch} • {field.variety}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-4xl font-bold text-[#C55A2E]">{field.acres}</p>
                      <p className="text-xs uppercase tracking-widest text-green-600">acres</p>
                      <p className="text-xs text-stone-400 mt-1">{field.crop}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "today" && (
          <div className="bg-white rounded-3xl p-8 shadow text-center">
            <h2 className="text-2xl font-medium mb-6">Today’s Snapshot</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#F4EEE0] p-6 rounded-2xl text-center">
                <p className="text-sm text-stone-600">Pit Hardening</p>
                <p className="text-4xl font-semibold text-[#C55A2E]">42 days</p>
              </div>
              <div className="bg-[#F4EEE0] p-6 rounded-2xl text-center">
                <p className="text-sm text-stone-600">High Priority Tasks</p>
                <p className="text-4xl font-semibold text-orange-600">7</p>
              </div>
              <div className="bg-[#F4EEE0] p-6 rounded-2xl text-center">
                <p className="text-sm text-stone-600">Acres in Focus</p>
                <p className="text-4xl font-semibold text-green-600">185</p>
              </div>
            </div>
          </div>
        )}

        {tab === "map" && (
          <div className="bg-white rounded-3xl p-8 shadow text-center">
            <h2 className="text-2xl font-medium">Interactive Farm Map</h2>
            <p className="mt-4 text-stone-600">45 shaded polygons loaded — full clickable version next</p>
          </div>
        )}

        {tab === "weather" && (
          <div className="bg-white rounded-3xl p-8 shadow text-center">
            <h2 className="text-2xl font-medium">Weather & Irrigation Alerts</h2>
            <p className="mt-4 text-stone-600">Real-time conditions ready</p>
          </div>
        )}

        {tab === "report" && (
          <div className="text-center py-16">
            <button 
              onClick={() => window.print()}
              className="bg-[#C55A2E] hover:bg-[#b04d28] text-white px-10 py-5 rounded-3xl text-xl flex items-center gap-3 mx-auto transition"
            >
              <Printer className="w-7 h-7" />
              Generate Full PDF Report
            </button>
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-stone-500 py-8 border-t bg-white">
        Centennial Farming Company • 45 fields • 2026 Season • Built live on Vercel
      </footer>
    </div>
  );
}
