/**
 * Rwanda administrative boundaries and official division names, served from
 * files in src/data/rwanda (built by scripts/build-rwanda-geo.js — nothing is
 * fetched at runtime).
 *
 * Boundaries: geoBoundaries gbOpen RWA ADM1–ADM4, CC BY 4.0 (Rwanda Geo Portal /
 * Open Data Rwanda) — show the attribution wherever the shapes are displayed.
 * Names: the `rwanda` package (5 provinces, 30 districts, 416 sectors, 2,148
 * cells, 14,837 villages).
 */
import fs from 'fs';
import path from 'path';

export type AdminLevel = 'province' | 'district' | 'sector' | 'cell';
export const ADMIN_LEVELS: AdminLevel[] = ['province', 'district', 'sector', 'cell'];
export const BOUNDARY_ATTRIBUTION = 'Boundaries: geoBoundaries (CC BY 4.0) — Rwanda Geo Portal / Open Data Rwanda';

export interface AdminArea { province: string | null; district: string | null; sector: string | null; cell: string | null }
type Geometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: any };
interface Feature { type: 'Feature'; properties: Record<string, any>; geometry: Geometry }
interface Indexed { f: Feature; bbox: [number, number, number, number] }
export type Divisions = { name: string; districts: { name: string; sectors: { name: string; cells: { name: string; villages: string[] }[] }[] }[] }[];

// src/data in dev (ts-node) and dist/src/data in the image (copied by the Dockerfile).
const DATA_DIR = path.join(__dirname, '..', 'data', 'rwanda');
const cache = new Map<string, any>();
const readJson = (file: string) => {
  if (!cache.has(file)) cache.set(file, JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')));
  return cache.get(file);
};

const polygonsOf = (g: Geometry): number[][][][] => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
function bboxOf(g: Geometry): [number, number, number, number] {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polygonsOf(g)) for (const [x, y] of poly[0]) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}
function inRing(x: number, y: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const contains = (g: Geometry, x: number, y: number) =>
  polygonsOf(g).some((poly) => inRing(x, y, poly[0]) && !poly.slice(1).some((hole) => inRing(x, y, hole)));

const indexes = new Map<AdminLevel, Indexed[]>();
function indexed(level: AdminLevel): Indexed[] {
  if (!indexes.has(level)) {
    indexes.set(level, (readJson(`boundaries-${level}.json`).features as Feature[]).map((f) => ({ f, bbox: bboxOf(f.geometry) })));
  }
  return indexes.get(level)!;
}

/** GeoJSON FeatureCollection of one level, optionally only inside a district / sector. */
export function boundaries(level: AdminLevel, within: { district?: string; sector?: string } = {}) {
  const features = indexed(level)
    .map((i) => i.f)
    .filter((f) => (!within.district || f.properties.district === within.district) && (!within.sector || f.properties.sector === within.sector));
  return { type: 'FeatureCollection', attribution: BOUNDARY_ATTRIBUTION, features };
}

/** Which province / district / sector / cell a GPS point falls in (nulls outside Rwanda). */
export function locate(lat: number, lng: number): AdminArea {
  const find = (level: AdminLevel, filter?: (p: Record<string, any>) => boolean) =>
    indexed(level).find(({ f, bbox }) =>
      lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3] && (!filter || filter(f.properties)) && contains(f.geometry, lng, lat)
    )?.f.properties ?? null;
  const d = find('district');
  if (!d) return { province: null, district: null, sector: null, cell: null };
  const s = find('sector', (p) => p.district === d.district);
  const c = s ? find('cell', (p) => p.district === d.district && p.sector === s.sector) : null;
  return { province: d.province ?? null, district: d.district, sector: s?.sector ?? null, cell: c?.cell ?? null };
}

/** Official province → district → sector → cell → village names. */
export const divisions = (): Divisions => readJson('divisions.json');

const norm = (s: unknown) => String(s ?? '').normalize('NFD').toLowerCase().replace(/[^a-z]/g, '');
/** Compare a recorded name with an official one, ignoring case, accents and punctuation. */
export const sameArea = (a: unknown, b: unknown) => Boolean(a) && Boolean(b) && norm(a) === norm(b);
