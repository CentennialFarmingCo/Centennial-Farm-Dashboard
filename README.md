# Centennial Farming Dashboard

A simple, mobile-friendly dashboard for Centennial Farming Company. Built with
Next.js (static export) so it can be hosted free on Vercel with no server.

## What you'll see

- **Today** — live KPIs derived from the block list: total blocks, acres,
  ranches, crops, varieties; acres broken down by crop, ranch and variety;
  the largest blocks; and a data-quality panel that flags issues in
  `app/fields.js`.
- **Blocks** — a card list of every block.
- **Map** — an interactive Leaflet map of every field, drawn from real
  Google Earth boundaries (`public/Farming-Field-Map.kml`) overlaid on
  Esri World Imagery satellite tiles (toggle to OpenStreetMap streets
  if preferred). Click a polygon to open its details. Below the map, a
  *block explorer* with search, filters by crop / ranch / variety, and
  tile size proportional to acreage gives you another way to compare
  blocks. Filters apply to both the map and the tile grid.
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

## Field-boundary map

The Map tab renders the real field boundaries from a Google Earth KML
file. There are two static assets in `public/`:

- `public/Farming-Field-Map.kml` — the original Google Earth export.
- `public/fields.geojson` — the same data converted to GeoJSON, with
  each polygon's properties (block, ranch, variety, crop, acres) joined
  to `app/fields.js` by block name. The map fetches this file at
  runtime.

The map is rendered with [Leaflet](https://leafletjs.com/) on the
client (dynamically imported so it never runs during the static
export). Polygons are drawn from the KML exactly as exported — they
are not redrawn or simplified — and projected from `[lon, lat]`
GeoJSON coordinates onto Leaflet's `lat/lng` mercator layer (no
flipping). The basemap uses two free, no-API-key tile sources:

- **Satellite** (default): Esri World Imagery — Imagery © Esri,
  Maxar, Earthstar Geographics, USDA, USGS, AeroGRID, IGN, GIS User
  Community. Attribution is shown in the map's bottom-right corner.
- **Streets**: © OpenStreetMap contributors.

If tiles fail to load (e.g. offline), the polygons still render over
a dark background and remain interactive.

### Updating the map when boundaries change

1. Open `public/Farming-Field-Map.kml` in Google Earth, edit the
   placemarks, and export the file back to the same path. Each
   placemark's name should keep the format
   `Field N - {Ranch} Block X - {Variety} {Crop} - {Acres} acres` so
   the converter can match it to `app/fields.js`. (The converter falls
   back to matching by field number if the block name doesn't match,
   and surfaces unmatched placemarks on the dashboard.)
2. Regenerate the GeoJSON:

   ```bash
   npm run map:build
   ```

   This runs `scripts/kml-to-geojson.mjs`, which prints the polygon
   count and a list of any unmatched names.
3. Commit both files (`public/Farming-Field-Map.kml` and
   `public/fields.geojson`).

### Adding a new field

1. Add a row to `app/fields.js` with a unique `id` and a `block` value
   that matches the KML placemark's middle segment (e.g.
   `"Johnston Block 1"`).
2. Draw the polygon in Google Earth, name it using the format above,
   and re-export the KML.
3. Run `npm run map:build` and commit the result.

## Scripts

```bash
npm run dev        # local dev
npm run build      # static export build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run map:build  # regenerate public/fields.geojson from the KML
npm run map:validate # sanity-check public/fields.geojson
```
