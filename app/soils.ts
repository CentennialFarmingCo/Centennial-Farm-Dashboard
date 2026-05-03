// Shared types and helpers for SSURGO soil data.
//
// public/soils.geojson and public/soil-summary.json are produced by
// scripts/build-soils.mjs. Both are static, fetched at runtime by the map.

export type SoilFeature = {
  type: 'Feature';
  properties: {
    fieldId: number;
    block: string | null;
    mukey: string;
    musym: string | null;
    muname: string | null;
    areasymbol: string | null;
    dominantComponent: string | null;
    drainageClass: string | null;
    hydrologicGroup: string | null;
    taxOrder: string | null;
    acres: number;
  };
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
};

export type SoilFeatureCollection = {
  type: 'FeatureCollection';
  metadata?: {
    source?: string;
    sourceUrl?: string;
    retrievedAt?: string;
    method?: string;
    caveat?: string;
    polygonCount?: number;
    mapUnitCount?: number;
    fieldCount?: number;
  };
  features: SoilFeature[];
};

export type SoilComponent = {
  mukey: string;
  musym: string | null;
  muname: string | null;
  dominantComponent: string | null;
  drainageClass: string | null;
  hydrologicGroup: string | null;
  taxOrder: string | null;
  acres: number;
  percent: number;
};

export type FieldSoilSummary = {
  fieldId: number;
  block: string;
  ranch: string;
  reportedAcres: number | null;
  polygonAcres: number;
  soilCoverageAcres: number;
  coveragePct: number;
  components: SoilComponent[];
};

export type SoilSummaryDoc = {
  metadata?: SoilFeatureCollection['metadata'];
  fields: FieldSoilSummary[];
};

// Color palette for the soil overlay, keyed by USDA hydrologic group.
// A=well drained / low runoff, B, C, D=high runoff. A/D, B/D, C/D are dual
// groups (drained/undrained). Colors are colorblind-aware ColorBrewer-style
// from sandy (yellow) to clayey (purple).
export const HYDROLOGIC_GROUP_COLORS: Record<string, string> = {
  A: '#FEE08B',
  'A/D': '#FDAE61',
  B: '#ABDDA4',
  'B/D': '#66C2A5',
  C: '#3288BD',
  'C/D': '#5E4FA2',
  D: '#9E0142',
};
export const HYDROLOGIC_GROUP_DESC: Record<string, string> = {
  A: 'Sandy / low runoff',
  'A/D': 'Sandy when drained',
  B: 'Loamy / moderate',
  'B/D': 'Loamy when drained',
  C: 'Fine-loam / slow',
  'C/D': 'Fine when drained',
  D: 'Clayey / high runoff',
};
export const SOIL_COLOR_UNKNOWN = '#888888';

export function soilColor(hydrologicGroup: string | null): string {
  if (!hydrologicGroup) return SOIL_COLOR_UNKNOWN;
  return HYDROLOGIC_GROUP_COLORS[hydrologicGroup] ?? SOIL_COLOR_UNKNOWN;
}
