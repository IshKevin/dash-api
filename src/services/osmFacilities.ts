/**
 * Facility discovery from OpenStreetMap (Overpass API).
 *
 * OpenStreetMap is open data (ODbL): imported places must keep the attribution
 * "© OpenStreetMap contributors". Overpass is a shared public service — one
 * query per search, results cached for 10 minutes, and a descriptive
 * User-Agent (no personal data is sent).
 *
 * Coverage in Rwanda is good for markets, banks, government offices and
 * airfields; collection centres, cold rooms and packhouses are rarely mapped,
 * so those stay manual entries.
 */
import axios from 'axios';
import { FacilityType } from '@prisma/client';
import { boundaries, locate } from './rwandaBoundaries';
import logger from '../config/logger';

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';
const OVERPASS_URL = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter';

/** OSM tags → our facility types. */
export const OSM_TYPE_QUERIES: Record<string, { type: FacilityType; filters: string[] }> = {
  market: { type: 'market', filters: ['["amenity"="marketplace"]'] },
  sacco_bank: { type: 'sacco_bank', filters: ['["amenity"="bank"]', '["amenity"="microfinance"]', '["office"="financial"]'] },
  airport: { type: 'airport', filters: ['["aeroway"="aerodrome"]'] },
  input_supplier: { type: 'input_supplier', filters: ['["shop"="agrarian"]', '["shop"="farm"]', '["shop"="garden_centre"]'] },
  government_office: { type: 'government_office', filters: ['["office"="government"]', '["amenity"="townhall"]'] },
  nursery: { type: 'nursery', filters: ['["landuse"="plant_nursery"]'] },
  cold_storage: { type: 'cold_storage', filters: ['["industrial"="cold_storage"]', '["building"="cold_storage"]'] },
};
export const OSM_SEARCHABLE_TYPES = Object.keys(OSM_TYPE_QUERIES);

export interface OsmCandidate {
  external_id: string;
  name: string;
  type: FacilityType;
  latitude: number;
  longitude: number;
  province: string | null;
  district: string | null;
  sector: string | null;
  contact_phone: string | null;
  opening_hours: string | null;
  description: string | null;
}

const cache = new Map<string, { at: number; items: OsmCandidate[] }>();
const CACHE_MS = 10 * 60 * 1000;

function bboxOfDistrict(district: string): [number, number, number, number] | null {
  const f = boundaries('district', { district }).features[0] as any;
  if (!f) return null;
  const pts: number[][] = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).flatMap((p: number[][][]) => p[0]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...ys), Math.min(...xs), Math.max(...ys), Math.max(...xs)]; // south, west, north, east
}

/** Search OpenStreetMap for facilities of the given types, in one district or all of Rwanda. */
export async function searchOsmFacilities(types: string[], district?: string): Promise<OsmCandidate[]> {
  const wanted = types.filter((t) => OSM_TYPE_QUERIES[t]);
  if (!wanted.length) return [];
  const key = `${district ?? 'RW'}|${[...wanted].sort().join(',')}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;

  let scope: string;
  let header = '[out:json][timeout:60];';
  if (district) {
    const bb = bboxOfDistrict(district);
    if (!bb) throw new Error(`Unknown district ${district}`);
    scope = `(${bb.join(',')})`;
  } else {
    header += 'area["ISO3166-1"="RW"][admin_level=2]->.rw;';
    scope = '(area.rw)';
  }
  const parts = wanted.flatMap((t) => OSM_TYPE_QUERIES[t].filters.map((f) => `nwr${f}${scope};`));
  const query = `${header}(${parts.join('')});out center tags;`;

  const res = await axios.post(OVERPASS_URL, new URLSearchParams({ data: query }).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'avocado-dashboard/2.1 (facility directory import)' },
    timeout: 90000,
  });

  const typeOf = (tags: Record<string, string>): FacilityType | null => {
    for (const t of wanted) {
      for (const f of OSM_TYPE_QUERIES[t].filters) {
        const [, k, v] = f.match(/\["(.+?)"="(.+?)"\]/) || [];
        if (k && tags[k] === v) return OSM_TYPE_QUERIES[t].type;
      }
    }
    return null;
  };

  const items: OsmCandidate[] = [];
  for (const el of res.data?.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const tags: Record<string, string> = el.tags ?? {};
    const type = typeOf(tags);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !type) continue;
    const at = locate(lat, lng);
    if (!at.district || (district && at.district !== district)) continue; // bbox overshoots the district
    const name = tags.name || tags['name:en'] || tags['name:rw'] || tags.operator || tags.brand;
    if (!name) continue; // unnamed points are not useful in a directory
    items.push({
      external_id: `osm:${el.type}/${el.id}`,
      name: String(name).slice(0, 150),
      type,
      latitude: lat,
      longitude: lng,
      province: at.province,
      district: at.district,
      sector: at.sector,
      contact_phone: tags.phone || tags['contact:phone'] || null,
      opening_hours: tags.opening_hours || null,
      description: [tags.operator && `Operator: ${tags.operator}`, `Source: ${OSM_ATTRIBUTION}`].filter(Boolean).join('. '),
    });
  }
  // The same place is often mapped twice (a point and a building outline): keep one.
  const near = (a: OsmCandidate, b: OsmCandidate) => Math.abs(a.latitude - b.latitude) < 0.0005 && Math.abs(a.longitude - b.longitude) < 0.0005;
  const unique = items.filter((it, i) => !items.slice(0, i).some((o) => o.type === it.type && o.name.toLowerCase() === it.name.toLowerCase() && near(o, it)));
  unique.sort((a, b) => (a.district ?? '').localeCompare(b.district ?? '') || a.name.localeCompare(b.name));
  cache.set(key, { at: Date.now(), items: unique });
  logger.info(`OSM facility search ${key}: ${unique.length} results`);
  return unique;
}
