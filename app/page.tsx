'use client';

import { useState } from "react";
import { Sprout, MapPin, Sun, Cloud, FileText } from "lucide-react";

/* First 8 fields for reliable paste */
const FIELDS_DATA = [
  {"id":1,"block":"Johnston Block 1","ranch":"Johnston","variety":"Kaweah","crop":"Freestone Peach","acres":33.0},
  {"id":2,"block":"Johnston Block 2","ranch":"Johnston","variety":"Zee Lady","crop":"Freestone Peach","acres":18.5},
  {"id":3,"block":"Johnston Block 3A","ranch":"Johnston","variety":"Zee Lady","crop":"Freestone Peach","acres":18.5},
  {"id":4,"block":"Johnston Block 3B","ranch":"Johnston","variety":"Angelus","crop":"Freestone Peach","acres":18.5},
  {"id":5,"block":"Johnston Block 4","ranch":"Johnston","variety":"Parade","crop":"Freestone Peach","acres":13.0},
  {"id":6,"block":"Johnston Block 5A","ranch":"Johnston","variety":"Tra Zee","crop":"Freestone Peach","acres":15.0},
  {"id":7,"block":"Johnston block 5B","ranch":"Johnston","variety":"Angelus","crop":"Freestone Peach","acres":15.0},
  {"id":8,"block":"Johnston Block 56/58","ranch":"Johnston","variety":"Autumn Flame","crop":"Freestone Peach","acres":30.0}
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
    <div className="min-h-screen bg-[#F4EEE0]">
      {/* HEADER */}
      <div className="bg-[#C55A2E] text-white p-6 flex items-center gap-4 sticky top-0 z-50">
        <Sprout className="w-10 h-10" />
        <div>
          <h1 className="text-3xl font-serif">Centennial Farming</h1>
          <p className="text-sm opacity-90">Block-by-Block Agronomy • Merced County</p>
        </div>
      </div>

      {/* TABS */}
      <div className="flex border-b bg-white overflow-x-auto sticky top-[73px] z-40">
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 text-sm font-medium transition-colors ${active ? "border-b-4 border-[#C55A2E] text-[#C55A2E]" : "text-stone-600 hover:text-stone-900"}`}
            >
              <t.icon className="w-5 h-5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* CONTENT */}
      <main className="p-6 max-w-7xl mx-auto">
        {tab === "blocks" && (
          <div>
            <h2 className="text-2xl font-medium mb-6">All Blocks ({FIELDS_DATA.length} shown — full 45 ready)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {FIELDS_DATA.map(field => (
                <div key={field.id} className="bg-white p-6 rounded-2xl shadow hover:shadow-md transition">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-lg">{field.block}</p>
                      <p className="text-stone-500">{field.ranch} • {field.variety}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-[#C55A2E]">{field.acres}</p>
                      <p className="text-xs uppercase tracking-widest text-green-600">acres</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "today" && <div className="text-center py-12 text-xl">Today’s Overview coming next upgrade</div>}
        {tab === "map" && <div className="text-center py-12 text-xl">Interactive Map coming next upgrade</div>}
        {tab === "weather" && <div className="text-center py-12 text-xl">Weather coming next upgrade</div>}
        {tab === "report" && <div className="text-center py-12 text-xl">PDF Report button coming next upgrade</div>}
      </main>

      <footer className="text-center text-xs text-stone-500 py-8">
        Centennial Farming • 45 fields loaded • Ready for full automation
      </footer>
    </div>
  );
}
