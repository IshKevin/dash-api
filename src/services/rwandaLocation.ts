/**
 * Rwanda administrative locations (province → district → sector → cell →
 * village) from the `rwanda` npm package (knowbee/rwanda, pinned to 3.0.2).
 *
 * The package names provinces 'East' | 'Kigali' | 'North' | 'South' | 'West';
 * this app stores 'Eastern Province', 'Kigali City', … so we translate here.
 *
 * Package quirks handled here (3.0.x):
 *  - Sectors({province, district}) returns every sector of the PROVINCE, so we
 *    keep only those that have cells in the requested district.
 *  - Any lookup with an unknown province/district throws instead of returning
 *    undefined, so every call is guarded.
 */
import { Cells, Districts, Sectors, Villages } from 'rwanda';
import { canonicalDistrict, canonicalProvince } from './rwandaGeo';

type PkgProvince = 'East' | 'Kigali' | 'North' | 'South' | 'West';

const TO_PKG: Record<string, PkgProvince> = {
  'Kigali City': 'Kigali',
  'Eastern Province': 'East',
  'Northern Province': 'North',
  'Southern Province': 'South',
  'Western Province': 'West',
};

const safe = <T>(fn: () => T | undefined): T | undefined => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
const pick = (list: string[] | undefined, value: unknown) => list?.find((x) => norm(x) === norm(value));

function pkgArea(district: unknown): { province: PkgProvince; district: any; appProvince: string; appDistrict: string } | null {
  const d = canonicalDistrict(district);
  if (!d) return null;
  return { province: TO_PKG[d.province], district: d.name as any, appProvince: d.province, appDistrict: d.name };
}

export function listSectors(district: unknown): string[] {
  const a = pkgArea(district);
  if (!a) return [];
  const all = safe(() => Sectors({ province: a.province, district: a.district })) ?? [];
  return [...new Set(all)]
    .filter((s) => (safe(() => Cells({ province: a.province, district: a.district, sector: s } as any)) ?? []).length > 0)
    .sort();
}

export function listCells(district: unknown, sector: unknown): string[] {
  const a = pkgArea(district);
  if (!a || !sector) return [];
  return [...(safe(() => Cells({ province: a.province, district: a.district, sector: String(sector) } as any)) ?? [])].sort();
}

export function listVillages(district: unknown, sector: unknown, cell: unknown): string[] {
  const a = pkgArea(district);
  if (!a || !sector || !cell) return [];
  return [...(safe(() => Villages({ province: a.province, district: a.district, sector: String(sector), cell: String(cell) } as any)) ?? [])].sort();
}

export function listDistricts(province?: unknown): string[] {
  const p = province ? canonicalProvince(province) : null;
  if (province && !p) return [];
  return [...(safe(() => Districts(p ? { provinces: TO_PKG[p] } : undefined)) ?? [])].sort();
}

export interface RwandaLocation {
  province: string;
  district: string;
  sector?: string;
  cell?: string;
  village?: string;
}

/**
 * Check and canonicalise a location (spelling/case fixed from the official
 * list). Only the levels given are checked; each one must belong to the level
 * above. A district implies its province. Returns [location, error].
 */
export function normalizeLocation(input: any, opts: { require?: 'district' | 'sector' | 'cell' | 'village' } = {}): [RwandaLocation | null, string | null] {
  const levels = ['district', 'sector', 'cell', 'village'] as const;
  if (opts.require) {
    for (const l of levels) {
      if (!input?.[l] || !String(input[l]).trim()) return [null, `${l} is required`];
      if (l === opts.require) break;
    }
  }
  const a = pkgArea(input?.district);
  if (!a) return [null, 'district must be a valid Rwanda district'];
  if (input?.province && canonicalProvince(input.province) && canonicalProvince(input.province) !== a.appProvince) {
    return [null, `${a.appDistrict} is in ${a.appProvince}, not ${canonicalProvince(input.province)}`];
  }
  const out: RwandaLocation = { province: a.appProvince, district: a.appDistrict };
  if (!input?.sector) return [out, null];

  const sector = pick(listSectors(a.appDistrict), input.sector);
  if (!sector) return [null, `"${input.sector}" is not a sector of ${a.appDistrict}`];
  out.sector = sector;
  if (!input?.cell) return [out, null];

  const cell = pick(listCells(a.appDistrict, sector), input.cell);
  if (!cell) return [null, `"${input.cell}" is not a cell of ${sector} sector`];
  out.cell = cell;
  if (!input?.village) return [out, null];

  const village = pick(listVillages(a.appDistrict, sector, cell), input.village);
  if (!village) return [null, `"${input.village}" is not a village of ${cell} cell`];
  out.village = village;
  return [out, null];
}
