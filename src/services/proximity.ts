/**
 * Distance helpers for "what is near my farm".
 *
 * Facilities carry exact GPS. Agents and shops only have an administrative
 * district, so for those we fall back to the district's main town and flag the
 * distance as approximate.
 */
import { canonicalDistrict } from './rwandaGeo';

export interface LatLng { lat: number; lng: number }

/** Approximate location of each district's main town (WGS84). */
export const DISTRICT_CENTRES: Record<string, LatLng> = {
  // Kigali City
  Nyarugenge: { lat: -1.9500, lng: 30.0590 },
  Gasabo: { lat: -1.8960, lng: 30.1120 },
  Kicukiro: { lat: -1.9800, lng: 30.1030 },
  // Southern
  Nyanza: { lat: -2.3520, lng: 29.7400 },
  Gisagara: { lat: -2.6080, lng: 29.8330 },
  Nyaruguru: { lat: -2.6440, lng: 29.5580 },
  Huye: { lat: -2.5960, lng: 29.7390 },
  Nyamagabe: { lat: -2.4700, lng: 29.5650 },
  Ruhango: { lat: -2.2240, lng: 29.7800 },
  Muhanga: { lat: -2.0840, lng: 29.7560 },
  Kamonyi: { lat: -2.0050, lng: 29.9000 },
  // Western
  Karongi: { lat: -2.0600, lng: 29.3500 },
  Rutsiro: { lat: -1.9330, lng: 29.3330 },
  Rubavu: { lat: -1.6800, lng: 29.2900 },
  Nyabihu: { lat: -1.6500, lng: 29.5100 },
  Ngororero: { lat: -1.8650, lng: 29.6200 },
  Rusizi: { lat: -2.4850, lng: 28.9070 },
  Nyamasheke: { lat: -2.3300, lng: 29.1200 },
  // Northern
  Rulindo: { lat: -1.7300, lng: 29.9900 },
  Gakenke: { lat: -1.6900, lng: 29.7800 },
  Musanze: { lat: -1.4990, lng: 29.6350 },
  Burera: { lat: -1.4700, lng: 29.8300 },
  Gicumbi: { lat: -1.5800, lng: 30.0650 },
  // Eastern
  Rwamagana: { lat: -1.9490, lng: 30.4350 },
  Nyagatare: { lat: -1.2950, lng: 30.3270 },
  Gatsibo: { lat: -1.5800, lng: 30.4200 },
  Kayonza: { lat: -1.9000, lng: 30.5100 },
  Kirehe: { lat: -2.2650, lng: 30.6500 },
  Ngoma: { lat: -2.1600, lng: 30.5400 },
  Bugesera: { lat: -2.2100, lng: 30.1500 },
};

/** Generous bounding box around Rwanda, to reject swapped or garbage coordinates. */
export function isInRwanda(p: LatLng): boolean {
  return p.lat >= -2.9 && p.lat <= -1.0 && p.lng >= 28.8 && p.lng <= 30.95;
}

export function districtCentre(district: unknown): LatLng | null {
  const d = canonicalDistrict(district);
  return d ? DISTRICT_CENTRES[d.name] ?? null : null;
}

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const roundKm = (km: number) => Math.round(km * 10) / 10;

/** Parse a lat/lng pair from strings; null if missing, invalid or outside Rwanda. */
export function parseLatLng(lat: unknown, lng: unknown): LatLng | null {
  if (lat === undefined || lng === undefined || lat === '' || lng === '' || lat === null || lng === null) return null;
  const p = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
  return isInRwanda(p) ? p : null;
}
