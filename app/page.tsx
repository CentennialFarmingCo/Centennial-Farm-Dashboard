'use client';

import { useState } from "react";

/* ULTRA SHORT TEST — only 2 fields */
const FIELDS_DATA = [
  {"id":1,"block":"Johnston Block 1","ranch":"Johnston","variety":"Kaweah","crop":"Freestone Peach","acres":33.0,"center":[-120.775215,37.40931],"polygon":[[-120.777364,37.410404],[-120.777459,37.407256],[-120.773089,37.407224],[-120.772961,37.410206],[-120.773051,37.410366],[-120.777364,37.410404]]},
  {"id":2,"block":"Johnston Block 2","ranch":"Johnston","variety":"Zee Lady","crop":"Freestone Peach","acres":18.5,"center":[-120.775338,37.405775],"polygon":[[-120.77746,37.407164],[-120.777516,37.405189],[-120.777171,37.405128],[-120.775596,37.405097],[-120.77514,37.405084],[-120.774115,37.405052],[-120.774088,37.4054],[-120.773958,37.405536],[-120.773126,37.405554],[-120.773083,37.407152],[-120.77746,37.407164]]}
];

export default function App() {
  return (
    <div className="min-h-screen bg-[#F4EEE0] p-8 font-sans">
      <h1 className="text-4xl font-serif text-stone-900 mb-2">Centennial Farming Dashboard</h1>
      <p className="text-green-600 font-medium text-2xl">✅ BUILD SUCCESSFUL!</p>
      <p className="mt-6">Fields loaded: {FIELDS_DATA.length}</p>
      <p className="text-stone-600">Vercel is finally happy. Reply “Built” and I’ll give you the full 45-field version with map + tabs in the next step.</p>
    </div>
  );
}
