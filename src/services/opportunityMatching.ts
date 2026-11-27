/**
 * Opportunity matching engine.
 *
 * Scores how well an opportunity fits a farmer (0–100) and explains why in
 * plain words, using only data already in the app:
 *   - where the farmer grows (district / distance between district centres),
 *   - how much they can supply (unsold harvest lots, else latest forecast,
 *     else ~10 kg per tree — the same rule of thumb the farms page uses),
 *   - the best grade they have recorded,
 *   - local farm-gate prices from the market price records,
 *   - the opportunity's deadline.
 *
 * Used both ways: "best opportunities for this farmer" and "best farmers for
 * this opportunity" (so a VBA knows whom to call for a buyer's order).
 */
import { ProduceGrade, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { canonicalDistrict, canonicalProvince } from './rwandaGeo';
import { districtCentre, haversineKm, roundKm, DISTRICT_CENTRES } from './proximity';

export const KG_PER_TREE = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
export const PRODUCE_TYPES = ['buyer_demand', 'export_contract', 'tender'];
/** Buyers this close are worth showing even if they posted for another district. */
export const NEARBY_KM = 60;
/** Best first. */
const GRADE_ORDER: ProduceGrade[] = ['export', 'grade_a', 'grade_b', 'processing', 'reject'];
const GRADE_LABEL: Record<string, string> = { export: 'export grade', grade_a: 'grade A', grade_b: 'grade B', processing: 'processing grade', reject: 'reject' };

export interface FarmerSupply {
  user_id: string;
  full_name?: string;
  phone?: string | null;
  district: string | null;
  province: string | null;
  trees: number;
  /** Harvested, not yet sold (recorded/verified lots). */
  ready_kg: number;
  /** Expected next harvest: latest forecasts, else trees × KG_PER_TREE. */
  expected_kg: number;
  best_grade: ProduceGrade | null;
  verified: boolean;
}

export interface OpportunityLike {
  type: string;
  district: string | null;
  province: string | null;
  quantity_kg: number | null;
  price_per_kg: number | null;
  min_grade: ProduceGrade | null;
  deadline: Date | null;
}

export interface MatchResult {
  score: number;
  level: 'excellent' | 'good' | 'fair' | 'low';
  reasons: string[];
  /** kg the farmer could offer (ready first, else expected); null for non-produce types. */
  supply_kg: number | null;
  /** Share of the requested quantity that supply covers (0–100+), when a quantity is given. */
  supply_pct: number | null;
  distance_km: number | null;
}

const kg = (n: number) => `${Math.round(n).toLocaleString('en-US')} kg`;
const pct = (n: number) => `${Math.round(Math.abs(n))}%`;

/** Pure scoring: no database access, so it is easy to test and reason about. */
export function scoreMatch(opp: OpportunityLike, f: FarmerSupply, localFarmGate: number | null, now = Date.now()): MatchResult {
  const reasons: string[] = [];
  let score = 0;

  // ── Location (30) ────────────────────────────────────────────────────────
  let distance: number | null = null;
  if (!opp.district && !opp.province) {
    score += 18; reasons.push('Open to growers in all of Rwanda');
  } else if (opp.district && f.district === opp.district) {
    score += 30; reasons.push(`In your district (${opp.district})`);
  } else if (opp.district) {
    const a = districtCentre(f.district); const b = districtCentre(opp.district);
    if (a && b) {
      distance = roundKm(haversineKm(a, b));
      score += Math.round(30 * Math.max(0, 1 - distance / 150));
      reasons.push(`About ${Math.round(distance)} km away, in ${opp.district}`);
    } else reasons.push(`In ${opp.district}`);
  } else if (opp.province && f.province === opp.province) {
    score += 22; reasons.push(`In your province (${opp.province})`);
  } else {
    reasons.push(`For growers in ${opp.province}`);
  }

  let supplyKg: number | null = null;
  let supplyPct: number | null = null;

  if (PRODUCE_TYPES.includes(opp.type)) {
    // ── Supply (25) ────────────────────────────────────────────────────────
    supplyKg = f.ready_kg > 0 ? f.ready_kg : f.expected_kg;
    const what = f.ready_kg > 0 ? 'harvested and unsold' : 'expected next harvest';
    if (!opp.quantity_kg) {
      score += 15;
      if (supplyKg > 0) reasons.push(`No minimum quantity; you have about ${kg(supplyKg)} (${what})`);
    } else if (supplyKg <= 0) {
      reasons.push('No harvest or trees on file yet — add your farm to be matched');
    } else {
      const ratio = supplyKg / opp.quantity_kg;
      supplyPct = Math.round(ratio * 100);
      if (ratio >= 1) { score += 25; reasons.push(`You can supply the full ${kg(opp.quantity_kg)} (${kg(supplyKg)} ${what})`); }
      else if (ratio >= 0.5) { score += 18; reasons.push(`You can supply about ${supplyPct}% of the ${kg(opp.quantity_kg)}`); }
      else if (ratio >= 0.1) { score += 10; reasons.push(`You cover ${supplyPct}% of the ${kg(opp.quantity_kg)} — team up with neighbours`); }
      else { score += 4; reasons.push(`They want ${kg(opp.quantity_kg)}; you have about ${kg(supplyKg)} — join a group sale`); }
    }

    // ── Price (20) ─────────────────────────────────────────────────────────
    if (!opp.price_per_kg) {
      score += 8; reasons.push('Price to be agreed with the buyer');
    } else if (!localFarmGate) {
      score += 10; reasons.push(`Offers ${Math.round(opp.price_per_kg)} RWF/kg`);
    } else {
      const diff = (opp.price_per_kg - localFarmGate) / localFarmGate;
      if (diff >= 0.1) { score += 20; reasons.push(`Pays ${pct(diff * 100)} more than the local farm-gate price (${Math.round(localFarmGate)} RWF/kg)`); }
      else if (diff >= 0) { score += 14; reasons.push(`Pays about the local farm-gate price or a little more`); }
      else if (diff >= -0.1) { score += 7; reasons.push(`Pays ${pct(diff * 100)} less than the local farm-gate price`); }
      else { score += 2; reasons.push(`Pays ${pct(diff * 100)} below the local farm-gate price (${Math.round(localFarmGate)} RWF/kg)`); }
    }

    // ── Grade (10) ─────────────────────────────────────────────────────────
    if (!opp.min_grade) score += 10;
    else if (!f.best_grade) { score += 5; reasons.push(`Needs ${GRADE_LABEL[opp.min_grade]} fruit — check your harvest meets it`); }
    else if (GRADE_ORDER.indexOf(f.best_grade) <= GRADE_ORDER.indexOf(opp.min_grade)) { score += 10; reasons.push(`Your recorded lots meet ${GRADE_LABEL[opp.min_grade]}`); }
    else { score += 2; reasons.push(`Needs ${GRADE_LABEL[opp.min_grade]}; your best recorded lots are ${GRADE_LABEL[f.best_grade]}`); }
  } else {
    // ── Relevance for non-produce opportunities (55) ───────────────────────
    let rel = 35;
    if ((opp.type === 'certification' || opp.type === 'training') && (!f.verified || f.best_grade !== 'export')) {
      rel += 15; reasons.push(f.best_grade !== 'export' ? 'Could help you reach export grade and better prices' : 'Helps you complete your verified profile');
    } else if ((opp.type === 'loan_credit' || opp.type === 'input_subsidy' || opp.type === 'grant_funding') && f.trees > 0) {
      rel += 15; reasons.push(`Useful for your ${f.trees.toLocaleString('en-US')} trees`);
    } else if (opp.type === 'job') rel -= 10;
    score += rel;
  }

  // ── Deadline (15) ────────────────────────────────────────────────────────
  if (!opp.deadline) score += 10;
  else {
    const days = Math.ceil((opp.deadline.getTime() - now) / DAY_MS);
    if (days >= 14) score += 15;
    else if (days >= 7) { score += 12; reasons.push(`Closes in ${days} days`); }
    else { score += 8; reasons.push(days <= 1 ? 'Closes today or tomorrow — act now' : `Closes in ${days} days — act soon`); }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = score >= 75 ? 'excellent' : score >= 55 ? 'good' : score >= 35 ? 'fair' : 'low';
  return { score, level, reasons, supply_kg: supplyKg !== null ? Math.round(supplyKg) : null, supply_pct: supplyPct, distance_km: distance };
}

/** Other districts whose centre is within `km` of this district's centre. */
export function nearbyDistricts(district: string | null, km = NEARBY_KM): string[] {
  const here = districtCentre(district);
  if (!here) return [];
  return Object.entries(DISTRICT_CENTRES)
    .filter(([name, c]) => name !== district && haversineKm(here, c) <= km)
    .map(([name]) => name);
}

/** Supply picture for many farmers at once (one query per table). */
export async function loadFarmerSupply(where: Prisma.UserWhereInput, take = 5000): Promise<FarmerSupply[]> {
  const users = await prisma.user.findMany({
    where: { role: 'farmer', status: 'active', ...where },
    select: {
      id: true, full_name: true, phone: true,
      farmer_profile: { select: { district: true, province: true, farm_district: true, farm_province: true, tree_count: true, verification_status: true } },
      farms: { where: { archived_at: null }, select: { id: true, tree_count: true } },
    },
    take,
  });
  if (!users.length) return [];
  const ids = users.map((u) => u.id);
  const farmIds = users.flatMap((u) => u.farms.map((f) => f.id));
  const year = new Date().getFullYear();

  const [lots, forecasts] = await Promise.all([
    prisma.harvestLot.findMany({
      where: { farmer_id: { in: ids }, status: { not: 'rejected' } },
      select: { farmer_id: true, quantity_kg: true, grade: true, status: true },
    }),
    farmIds.length
      ? prisma.harvestForecast.findMany({
        where: { farm_id: { in: farmIds }, forecast_year: { gte: year } },
        select: { farm_id: true, predicted_kg: true, created_at: true },
        orderBy: { created_at: 'desc' },
      })
      : Promise.resolve([]),
  ]);

  const latestForecast = new Map<string, number>();
  for (const f of forecasts) if (f.farm_id && !latestForecast.has(f.farm_id)) latestForecast.set(f.farm_id, f.predicted_kg);

  return users.map((u) => {
    const p = u.farmer_profile;
    const d = canonicalDistrict(p?.farm_district || p?.district);
    const myLots = lots.filter((l) => l.farmer_id === u.id);
    const ready = myLots.filter((l) => l.status === 'recorded' || l.status === 'verified').reduce((s, l) => s + l.quantity_kg, 0);
    const best = myLots.map((l) => l.grade).sort((a, b) => GRADE_ORDER.indexOf(a) - GRADE_ORDER.indexOf(b))[0] ?? null;
    const trees = u.farms.length ? u.farms.reduce((s, f) => s + (f.tree_count || 0), 0) : p?.tree_count || 0;
    const forecastKg = u.farms.reduce((s, f) => s + (latestForecast.get(f.id) ?? 0), 0);
    return {
      user_id: u.id,
      full_name: u.full_name,
      phone: u.phone,
      district: d?.name ?? null,
      province: d?.province ?? canonicalProvince(p?.farm_province || p?.province) ?? null,
      trees,
      ready_kg: Math.round(ready),
      expected_kg: Math.round(forecastKg > 0 ? forecastKg : trees * KG_PER_TREE),
      best_grade: best,
      verified: p?.verification_status === 'verified',
    };
  });
}

/** Average farm-gate price per district over the last 60 days, plus the national average. */
export async function farmGatePrices(): Promise<{ byDistrict: Map<string, number>; national: number | null }> {
  const rows = await prisma.marketPrice.groupBy({
    by: ['district'],
    where: { commodity: 'avocado', price_type: 'farm_gate', price_date: { gte: new Date(Date.now() - 60 * DAY_MS) } },
    _avg: { price_per_kg: true },
  });
  const byDistrict = new Map<string, number>();
  for (const r of rows) {
    const name = canonicalDistrict(r.district)?.name;
    if (name && r._avg.price_per_kg != null) byDistrict.set(name, r._avg.price_per_kg);
  }
  const values = [...byDistrict.values()];
  return { byDistrict, national: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
}
