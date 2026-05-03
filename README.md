# Centennial Farming Dashboard

A simple, mobile-friendly dashboard for Centennial Farming Company. Built with
Next.js (static export) so it can be hosted free on Vercel with no server.

## What you'll see

- **Today** — live KPIs derived from the block list: total blocks, acres,
  ranches, crops, varieties; acres broken down by crop, ranch and variety;
  the largest blocks; and a data-quality panel that flags issues in
  `app/fields.js`.
- **Blocks** — a card list of every block.
- **Map** — an interactive *block explorer* with search, filters by crop /
  ranch / variety, and a tile size proportional to acreage. Click any tile to
  see full details.
- **Weather** — current conditions and a 5-day forecast for your farm,
  fetched live in the browser from [Open-Meteo](https://open-meteo.com/)
  (free, no API key).
- **PDF Report** — uses the browser's Print dialog.

## Running locally

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

## Deploying to Vercel

This is a Next.js static export (`output: 'export'` in `next.config.js`). On
Vercel, just import the repo — no special settings needed. The build produces
a fully static site in `out/`.

## Configuring your farm location (weather)

The weather panel pulls live data from Open-Meteo for a single point. The
default location is a generic Merced County / Central Valley point. To point
it at your specific farm, set these **public** environment variables in
Vercel (Project → Settings → Environment Variables):

| Variable | Example | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_FARM_LAT` | `37.302` | Latitude in decimal degrees. |
| `NEXT_PUBLIC_FARM_LON` | `-120.482` | Longitude in decimal degrees (negative for the Western Hemisphere). |
| `NEXT_PUBLIC_FARM_LOCATION_NAME` | `Centennial Farms HQ` | Label shown above the temperature. |

These must start with `NEXT_PUBLIC_` so they're available in the browser.
After changing them, redeploy the project. You can find your coordinates by
right-clicking your farm in Google Maps.

> No API keys are needed — Open-Meteo is free for non-commercial and
> low-volume use. If you ever need a different provider, swap the fetch URL
> in `app/Weather.tsx`.

## Editing the block list

All field data lives in `app/fields.js`. Each entry has:

```js
{ id, block, ranch, variety, crop, acres }
```

Edit that file and the Today, Blocks, and Map tabs will update automatically.

## Adding real field-boundary polygons (later)

The Map tab today is a *block explorer*, not a true geographic map — tile
size is proportional to acreage, but the layout is not the real shape of
each field on the ground. To show real farm boundaries, you'll need polygon
data in KML or GeoJSON form.

When that data is ready:

1. Drop the file in `app/` (e.g. `app/boundaries.geojson`).
2. Match each polygon's `name`/`id` property to a `block` value from
   `app/fields.js`.
3. We can then swap the explorer for a real map (e.g. Leaflet) and shade
   each polygon by ranch, crop, or any KPI.

Until then the explorer gives you searchable, filterable, click-to-inspect
access to every block.

## Scripts

```bash
npm run dev        # local dev
npm run build      # static export build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```
