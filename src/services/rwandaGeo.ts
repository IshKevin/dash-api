/**
 * Rwanda administrative reference data (NISR codes) used to normalise survey
 * spellings and to decode UPIs (Unique Parcel Identifiers).
 *
 * Province codes: 1 Kigali City, 2 Southern, 3 Western, 4 Northern, 5 Eastern.
 * District code = position within its province (NISR district code 11..57
 * without the province digit), which is how the UPI encodes it, e.g. UPI
 * "1/03/…" → Kigali City / Kicukiro.
 */

export interface ProvinceInfo { code: number; name: string; aliases: string[] }
export interface DistrictInfo { province_code: number; code: number; name: string; province: string }

export const RWANDA_PROVINCES: ProvinceInfo[] = [
  { code: 1, name: 'Kigali City', aliases: ['kigali', 'kigalicity', 'umujyiwakigali', 'cityofkigali', 'kigaliprovince'] },
  { code: 2, name: 'Southern Province', aliases: ['south', 'southern', 'southernprovince', 'amajyepfo', 'intaradyamajyepfo'] },
  { code: 3, name: 'Western Province', aliases: ['west', 'western', 'westernprovince', 'iburengerazuba', 'intarayiburengerazuba'] },
  { code: 4, name: 'Northern Province', aliases: ['north', 'northern', 'northernprovince', 'amajyaruguru', 'intarayamajyaruguru'] },
  { code: 5, name: 'Eastern Province', aliases: ['east', 'eastern', 'easternprovince', 'iburasirazuba', 'intarayiburasirazuba'] },
];

const D = (province_code: number, names: string[]): DistrictInfo[] =>
  names.map((name, i) => ({
    province_code,
    code: i + 1,
    name,
    province: RWANDA_PROVINCES.find((p) => p.code === province_code)!.name,
  }));

export const RWANDA_DISTRICTS: DistrictInfo[] = [
  ...D(1, ['Nyarugenge', 'Gasabo', 'Kicukiro']),
  ...D(2, ['Nyanza', 'Gisagara', 'Nyaruguru', 'Huye', 'Nyamagabe', 'Ruhango', 'Muhanga', 'Kamonyi']),
  ...D(3, ['Karongi', 'Rutsiro', 'Rubavu', 'Nyabihu', 'Ngororero', 'Rusizi', 'Nyamasheke']),
  ...D(4, ['Rulindo', 'Gakenke', 'Musanze', 'Burera', 'Gicumbi']),
  ...D(5, ['Rwamagana', 'Nyagatare', 'Gatsibo', 'Kayonza', 'Kirehe', 'Ngoma', 'Bugesera']),
];

const key = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

export function canonicalProvince(input: unknown): string | null {
  const k = key(input);
  if (!k) return null;
  const p = RWANDA_PROVINCES.find((x) => key(x.name) === k || x.aliases.includes(k) || x.aliases.includes(k.replace(/province$/, '')));
  return p?.name ?? null;
}

export function canonicalDistrict(input: unknown): DistrictInfo | null {
  const k = key(input).replace(/district$/, '');
  if (!k) return null;
  return RWANDA_DISTRICTS.find((d) => key(d.name) === k) ?? null;
}

// ── UPI ──────────────────────────────────────────────────────────────────────

export interface ParsedUpi {
  normalized: string;
  province_code: number;
  district_code: number;
  sector_code: number;
  cell_code: number;
  parcel_number: number;
  unit: number | null;
  province: string | null;
  district: string | null;
}

/**
 * Parse a Rwandan UPI: province/district/sector/cell/parcel, optionally with a
 * condominium unit suffix ("-1"). Accepts spaces and "\" or "-" separators.
 * Returns null if it doesn't have that shape.
 */
export function parseUpi(input: unknown): ParsedUpi | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/\s+/g, '').replace(/\\/g, '/');
  const m = s.match(/^(\d)\/(\d{1,2})\/(\d{1,2})\/(\d{1,2})\/(\d{1,7})(?:-(\d{1,4}))?$/);
  if (!m) return null;
  const [province_code, district_code, sector_code, cell_code, parcel_number] = m.slice(1, 6).map(Number);
  const unit = m[6] ? Number(m[6]) : null;
  if (province_code < 1 || province_code > 5 || district_code < 1 || sector_code < 1 || cell_code < 1 || parcel_number < 1) return null;

  const province = RWANDA_PROVINCES.find((p) => p.code === province_code)?.name ?? null;
  const district = RWANDA_DISTRICTS.find((d) => d.province_code === province_code && d.code === district_code)?.name ?? null;
  if (!district) return null; // district code doesn't exist in that province

  const pad = (n: number) => String(n).padStart(2, '0');
  const normalized = `${province_code}/${pad(district_code)}/${pad(sector_code)}/${pad(cell_code)}/${parcel_number}${unit ? `-${unit}` : ''}`;
  return { normalized, province_code, district_code, sector_code, cell_code, parcel_number, unit, province, district };
}

// ── Geometry ─────────────────────────────────────────────────────────────────

/** Geodesic area (m²) of a GeoJSON polygon ring [[lng,lat],…] on the WGS84 sphere. */
export function ringAreaSqm(ring: number[][]): number {
  const R = 6378137;
  const rad = (d: number) => (d * Math.PI) / 180;
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[(i + 1) % ring.length];
    area += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((area * R * R) / 2);
}

export function ringCentroid(ring: number[][]): { lat: number; lng: number } {
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return { lat, lng };
}
