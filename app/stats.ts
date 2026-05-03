import { FIELDS_DATA } from "./fields.js";

export type Field = {
  id: number;
  block: string;
  ranch: string;
  variety: string;
  crop: string;
  acres: number;
};

export const FIELDS: Field[] = FIELDS_DATA as Field[];

export function formatAcres(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(1);
}

export type GroupStat = { name: string; acres: number; blocks: number };

function groupBy(key: keyof Field): GroupStat[] {
  const map = new Map<string, GroupStat>();
  for (const f of FIELDS) {
    const k = String(f[key]);
    const cur = map.get(k) ?? { name: k, acres: 0, blocks: 0 };
    cur.acres += f.acres;
    cur.blocks += 1;
    map.set(k, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.acres - a.acres);
}

export const totalFields = FIELDS.length;
export const totalAcres = FIELDS.reduce((s, f) => s + f.acres, 0);
export const ranches = groupBy("ranch");
export const crops = groupBy("crop");
export const varieties = groupBy("variety");

export const largestBlocks = [...FIELDS]
  .sort((a, b) => b.acres - a.acres)
  .slice(0, 5);

export const smallestBlocks = [...FIELDS]
  .sort((a, b) => a.acres - b.acres)
  .slice(0, 3);

export type DataWarning = { id: number; block: string; message: string };

export const dataWarnings: DataWarning[] = (() => {
  const warnings: DataWarning[] = [];
  const seen = new Set<string>();
  for (const f of FIELDS) {
    if (f.acres <= 0) {
      warnings.push({ id: f.id, block: f.block, message: "Acres missing or zero" });
    }
    if (!f.variety || !f.crop) {
      warnings.push({ id: f.id, block: f.block, message: "Missing variety or crop" });
    }
    const key = `${f.ranch}|${f.block}`;
    if (seen.has(key)) {
      warnings.push({ id: f.id, block: f.block, message: "Possible duplicate block name" });
    }
    seen.add(key);
  }
  return warnings;
})();
