/**
 * Connector to Rwanda's land registry (NLA / RLMUA Land Administration
 * Information System — LAIS) for looking up a parcel by UPI.
 *
 * There is no public LAIS API. Access has to be granted by the National Land
 * Authority (or arranged through Irembo / a data-sharing agreement). Until
 * then the connector is DISABLED and lookups return only what we can derive
 * locally from the UPI itself (province + district from its codes).
 *
 * Once access is granted, set:
 *   LAND_REGISTRY_API_URL   base URL, e.g. https://lais.example.gov.rw/api
 *   LAND_REGISTRY_API_KEY   bearer token / API key
 *   LAND_REGISTRY_TIMEOUT_MS (optional, default 8000)
 *
 * Expected contract (adjust `mapRegistryResponse` to the real one):
 *   GET {LAND_REGISTRY_API_URL}/parcels/{urlencoded UPI}
 *   → 200 { upi, area_sqm | area, land_use, tenure | right_type,
 *           owners: [{ name, national_id }], geometry: GeoJSON Polygon }
 *   → 404 when the UPI does not exist
 */
import axios from 'axios';
import logger from '../config/logger';

export interface RegistryParcel {
  upi: string;
  area_sqm: number | null;
  land_use: string | null;
  tenure: string | null;
  owners: { name: string; national_id?: string | null }[];
  geometry: { type: 'Polygon'; coordinates: number[][][] } | null;
}

export type RegistryLookup =
  | { status: 'disabled' }
  | { status: 'found'; parcel: RegistryParcel }
  | { status: 'not_found' }
  | { status: 'error'; message: string };

export const isRegistryEnabled = () => Boolean(process.env.LAND_REGISTRY_API_URL && process.env.LAND_REGISTRY_API_KEY);

export function mapRegistryResponse(body: any, upi: string): RegistryParcel {
  const geometry = body?.geometry?.type === 'Polygon' ? body.geometry : null;
  const area = Number(body?.area_sqm ?? body?.area);
  return {
    upi: String(body?.upi ?? upi),
    area_sqm: Number.isFinite(area) && area > 0 ? area : null,
    land_use: body?.land_use ?? body?.landUse ?? null,
    tenure: body?.tenure ?? body?.right_type ?? null,
    owners: Array.isArray(body?.owners)
      ? body.owners.map((o: any) => ({ name: String(o?.name ?? o?.full_name ?? ''), national_id: o?.national_id ?? null }))
      : [],
    geometry,
  };
}

export async function lookupParcel(upi: string): Promise<RegistryLookup> {
  if (!isRegistryEnabled()) return { status: 'disabled' };
  const base = process.env.LAND_REGISTRY_API_URL!.replace(/\/+$/, '');
  try {
    const res = await axios.get(`${base}/parcels/${encodeURIComponent(upi)}`, {
      headers: { Authorization: `Bearer ${process.env.LAND_REGISTRY_API_KEY}`, Accept: 'application/json' },
      timeout: parseInt(process.env.LAND_REGISTRY_TIMEOUT_MS || '8000', 10),
      validateStatus: (s) => s === 200 || s === 404,
    });
    if (res.status === 404) return { status: 'not_found' };
    return { status: 'found', parcel: mapRegistryResponse(res.data, upi) };
  } catch (error: any) {
    logger.warn(`Land registry lookup failed for ${upi}: ${error?.message}`);
    return { status: 'error', message: 'Land registry is unreachable right now' };
  }
}
