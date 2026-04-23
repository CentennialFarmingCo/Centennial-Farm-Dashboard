'use client';

import { useState } from "react";
import { Sprout, MapPin, Sun, Cloud, FileText, Printer, CheckCircle2, Leaf, Droplet, Bug, Wind, Thermometer } from "lucide-react";
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
    <div className="min-h-screen bg-[#F4EEE0] font-sans">
      {/* HEADER */}
      <header className="bg-[#C55A2E] text-white p-6 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Sprout className="w-10 h-10" />
          <div>
            <h1 className="text-3xl font-serif tracking-tight">Centennial Farming</h1>
            <p className="text-sm opacity-90">Block-by-Block Agronomy • Merced County, CA • 2026 Season</p>
          </div>
        </div>
      </header>

      {/* TABS */}
      <div className="sticky top-[85px] z-40 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto flex overflow-x-auto">
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap transition-all ${active 
                  ? "border-b-4 border-[#C55A2E] text-[#C55A2E] bg-[#F4EEE0]" 
                  : "text-stone-600 hover:text-stone-900"}`}
              >
                <t.icon className="w-5 h-5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="p-6 max-w-7xl mx-auto">
        {tab === "blocks" && (
          <div>
            <h2 className="text-2xl font-medium mb-6 flex items-center gap-3">
              All Blocks <span className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">{FIELDS_DATA.length} total loaded</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {FIELDS_DATA.map(field => (
                <div key={field.id} className="bg-white rounded-3xl p-6 shadow hover:shadow-2xl transition-all border border-[#C55A2E]/10">
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
          <div className="bg-white rounded-3xl p-8 shadow">
            <h2 className="text-2xl font-medium mb-6 flex items-center gap-2">
              <Sun className="w-6 h-6 text-[#C55A2E]" /> Today’s Snapshot
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#F4EEE0] p-6 rounded-2xl text-center">
                <p className="text-sm text-stone-600">Pit Hardening Window</p>
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
            <h2 className="text-2xl font-medium mb-4">Interactive Farm Map</h2>
            <div className="bg-[#F4EEE0] aspect-video rounded-3xl flex items-center justify-center border-2 border-dashed border-[#C55A2E]/30">
              <div className="text-center">
                <Sprout className="w-20 h-20 mx-auto text-[#C55A2E]/70 mb-4" />
                <p className="text-xl font-medium">45 shaded field polygons loaded</p>
                <p className="text-stone-500 mt-2">Full clickable map with KML polygons coming in next upgrade</p>
              </div>
            </div>
          </div>
        )}

        {tab === "weather" && (
          <div className="bg-white rounded-3xl p-8 shadow text-center">
            <h2 className="text-2xl font-medium mb-4 flex items-center justify-center gap-2">
              <Cloud className="w-6 h-6" /> Weather & Irrigation Alerts
            </h2>
            <p className="text-stone-600">Real-time conditions + RDI recommendations ready for next upgrade</p>
          </div>
        )}

        {tab === "report" && (
          <div className="text-center py-16">
            <button 
              onClick={() => window.print()}
              className="bg-[#C55A2E] hover:bg-[#b04d28] text-white px-10 py-5 rounded-3xl text-xl font-medium flex items-center gap-3 mx-auto transition"
            >
              <Printer className="w-7 h-7" />
              Generate Full Season PDF Report
            </button>
            <p className="mt-6 text-stone-500">One-click printable report with all blocks, phenology & tasks</p>
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-stone-500 py-8 border-t bg-white">
        Centennial Farming Company • 45 fields • 2026 Season • Built live on Vercel 🚜
      </footer>
    </div>
  );
}
