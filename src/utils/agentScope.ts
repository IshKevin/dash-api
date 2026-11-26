/**
 * VBA (agent) territory scoping.
 *
 * An admin assigns each VBA one or more areas (AgentProfile.territory, a JSON
 * array of {province?, district?, sector?, cell?, village?}). A VBA only sees
 * and serves farmers whose farm is inside one of those areas. A VBA with no
 * area assigned sees no farmers until an admin assigns one.
 *
 * A farmer is inside an area when every level the area names matches the
 * farmer's farm address on their profile (falling back to their home address
 * when the farm address is empty), or the location of any of their farms.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from '../types/auth';
import { canonicalDistrict, canonicalProvince } from '../services/rwandaGeo';
import { normalizeLocation } from '../services/rwandaLocation';

export interface TerritoryArea {
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
}

const LEVELS = ['province', 'district', 'sector', 'cell', 'village'] as const;

/** Validate + canonicalise one area. Province alone is allowed (whole province). */
export function normalizeArea(raw: any): [TerritoryArea | null, string | null] {
  // Older records store plain names: "Gasabo" (district) or "Eastern Province" / "Kigali" (province).
  if (typeof raw === 'string') {
    const d = canonicalDistrict(raw);
    if (d) return [{ province: d.province, district: d.name }, null];
    const p = canonicalProvince(raw);
    return p ? [{ province: p }, null] : [null, `"${raw}" is not a Rwanda province or district`];
  }
  if (!raw || typeof raw !== 'object') return [null, 'each area must be an object'];
  if (!raw.district) {
    const p = canonicalProvince(raw.province);
    if (!p) return [null, 'each area needs a valid province or district'];
    if (raw.sector || raw.cell || raw.village) return [null, 'choose a district before a sector, cell or village'];
    return [{ province: p }, null];
  }
  const [loc, err] = normalizeLocation(raw);
  if (err) return [null, err];
  const area: TerritoryArea = {};
  for (const l of LEVELS) if (loc![l]) area[l] = loc![l];
  return [area, null];
}

export function parseTerritory(value: unknown): TerritoryArea[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((a) => normalizeArea(a)[0])
    .filter((a): a is TerritoryArea => a !== null);
}

const ci = (v: string) => ({ equals: v, mode: 'insensitive' as const });

/** Prisma filter on User (farmer) for one area. */
function areaWhere(area: TerritoryArea): Prisma.UserWhereInput {
  const named = LEVELS.filter((l) => area[l]);
  const farmProfile: Prisma.FarmerProfileWhereInput = {};
  const homeProfile: Prisma.FarmerProfileWhereInput = { farm_district: null };
  const farmJson: Prisma.FarmWhereInput[] = [];
  for (const l of named) {
    (farmProfile as any)[`farm_${l}`] = ci(area[l]!);
    (homeProfile as any)[l] = ci(area[l]!);
    farmJson.push({ location: { path: [l], equals: area[l]! } });
  }
  return {
    OR: [
      { farmer_profile: { is: farmProfile } },
      { farmer_profile: { is: homeProfile } },
      { farms: { some: { archived_at: null, AND: farmJson } } },
    ],
  };
}

const NOBODY: Prisma.UserWhereInput = { id: { in: [] } };

/** Areas assigned to an agent (empty if none). */
export async function getTerritory(agentId: string): Promise<TerritoryArea[]> {
  const p = await prisma.agentProfile.findUnique({ where: { user_id: agentId }, select: { territory: true } });
  return parseTerritory(p?.territory);
}

/**
 * Extra filter on farmer Users for the caller, or `null` when the caller is
 * not limited (admins). Cached on the request.
 */
export async function farmerScope(req: AuthenticatedRequest): Promise<Prisma.UserWhereInput | null> {
  if (req.user?.role !== 'agent') return null;
  const cache = req as any;
  if (cache.__farmerScope !== undefined) return cache.__farmerScope;
  const areas = await getTerritory(req.user.id);
  const scope = areas.length ? { OR: areas.map(areaWhere) } : NOBODY;
  cache.__farmerScope = scope;
  return scope;
}

/** May the caller act on this farmer? Admins: yes. Agents: only inside their territory. */
export async function canServeFarmer(req: AuthenticatedRequest, farmerId: string): Promise<boolean> {
  const scope = await farmerScope(req);
  if (!scope) return true;
  const hit = await prisma.user.findFirst({ where: { AND: [{ id: farmerId, role: 'farmer' }, scope] }, select: { id: true } });
  return Boolean(hit);
}

/** Message shown to a VBA who tries to reach a farmer outside their area. */
export const OUTSIDE_TERRITORY = 'This farmer is outside the area assigned to you. Ask an admin to extend your area.';

/**
 * Record-level check for anything owned by a farmer (farm, lot, case…):
 * farmers → only their own; VBAs → only farmers in their territory; admins → all.
 */
export async function canAccessFarmer(req: AuthenticatedRequest, farmerId: string): Promise<boolean> {
  const role = req.user?.role;
  if (role === 'admin') return true;
  if (role === 'farmer') return req.user!.id === farmerId;
  if (role === 'agent') return canServeFarmer(req, farmerId);
  return false;
}
