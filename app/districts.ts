// Shared types and helpers for irrigation/water district data.
//
// public/irrigation-districts.geojson and public/irrigation-summary.json are
// produced by scripts/build-districts.mjs from the California DWR Water
// Districts FeatureServer. Both are static, fetched at runtime by the map.

export type DistrictCategory =
  | 'irrigation_district'
  | 'water_district'
  | 'reclamation_district'
  | 'mutual_water_company'
  | 'community_services'
  | 'municipal'
  | 'sanitary_district'
  | 'private_system'
  | 'federal'
  | 'other';

export type DistrictFeature = {
  type: 'Feature';
  properties: {
    fieldId: number;
    block: string | null;
    agencyName: string;
    agencyUniqueId: number | null;
    source: string | null;
    dateApplies: string | null;
    category: DistrictCategory;
    acres: number;
  };
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
};

export type DistrictFeatureCollection = {
  type: 'FeatureCollection';
  metadata?: {
    source?: string;
    sourceUrl?: string;
    retrievedAt?: string;
    method?: string;
    caveat?: string;
    polygonCount?: number;
    districtCount?: number;
    fieldCount?: number;
  };
  features: DistrictFeature[];
};

export type DistrictComponent = {
  agencyName: string;
  agencyUniqueId: number | null;
  source: string | null;
  dateApplies: string | null;
  category: DistrictCategory;
  acres: number;
  percent: number;
};

export type FieldDistrictSummary = {
  fieldId: number;
  block: string;
  ranch: string;
  reportedAcres: number | null;
  polygonAcres: number;
  districtCoverageAcres: number;
  coveragePct: number;
  components: DistrictComponent[];
};

export type DistrictSummaryDoc = {
  metadata?: DistrictFeatureCollection['metadata'] & {
    districtsInAoi?: Array<{
      agencyName: string;
      agencyUniqueId: number | null;
      category: DistrictCategory;
      source: string | null;
    }>;
  };
  fields: FieldDistrictSummary[];
};

// Color palette by district category. Surface-water irrigation districts are
// the most relevant for ag operations and get the strongest hue; municipal /
// sanitary / private systems are softer so they don't visually compete.
export const DISTRICT_CATEGORY_COLORS: Record<DistrictCategory, string> = {
  irrigation_district: '#1F78B4',     // strong blue — primary ag surface water
  water_district: '#33A02C',          // green — non-ID water districts
  reclamation_district: '#6A3D9A',    // purple — drainage/reclamation
  mutual_water_company: '#FF7F00',    // orange — private mutual cos
  community_services: '#B15928',      // brown — CSDs
  municipal: '#A6CEE3',               // light blue — cities
  sanitary_district: '#FB9A99',       // pink — sanitary
  private_system: '#CAB2D6',          // lavender — small private
  federal: '#FDBF6F',                 // sand — federal facilities
  other: '#999999',
};

export const DISTRICT_CATEGORY_LABELS: Record<DistrictCategory, string> = {
  irrigation_district: 'Irrigation district',
  water_district: 'Water district',
  reclamation_district: 'Reclamation district',
  mutual_water_company: 'Mutual water company',
  community_services: 'Community services district',
  municipal: 'Municipal water',
  sanitary_district: 'Sanitary district',
  private_system: 'Private water system',
  federal: 'Federal facility',
  other: 'Other',
};

export const DISTRICT_COLOR_UNKNOWN = '#999999';

export function districtColor(category: DistrictCategory | null | undefined): string {
  if (!category) return DISTRICT_COLOR_UNKNOWN;
  return DISTRICT_CATEGORY_COLORS[category] ?? DISTRICT_COLOR_UNKNOWN;
}

// Categories that represent surface-water irrigation service. We highlight
// these in the per-block details card because they're the operationally
// meaningful ones for orchard irrigation.
export const IRRIGATION_RELEVANT: ReadonlySet<DistrictCategory> = new Set([
  'irrigation_district',
  'water_district',
  'reclamation_district',
  'mutual_water_company',
]);
