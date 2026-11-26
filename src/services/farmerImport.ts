/**
 * Bulk farmer import: turns parsed spreadsheet rows (field survey or ASR member
 * register) into farmer accounts, profiles and farms.
 *
 *  - `prepareRows`   — runs at preview time: merges duplicate member-register rows,
 *                      resolves phone numbers shared by different people, and
 *                      matches rows to farmers already in the database.
 *  - `commitBatch`   — imports the rows. Small batches run inside the request;
 *                      large ones run in the background and checkpoint `progress`
 *                      every few rows so a restarted server resumes where it stopped
 *                      (`resumeInterruptedImports`, called at startup).
 *
 * Accounts are created with a random, never-shared password and
 * `credentials_claimed = false`: each farmer activates their own account with a
 * one-time SMS code (POST /api/auth/verify-phone/send-code → /verify-phone).
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { generateQRToken } from '../utils/accessKey';
import { locate, sameArea } from './rwandaBoundaries';
import { ParsedRow, farmerNameOf, farmerPhoneOf, farmAreaHectares, nameKey, NON_SURVEY_FIELDS } from './surveyParser';

export type Match = { type: 'national_id' | 'phone'; farmer_id: string; farmer_name: string } | null;
export type StoredRow = ParsedRow & {
  match: Match;
  /** Skipped on commit, with the reason (e.g. merged into an earlier row) */
  skip?: string | null;
  /** The phone belongs to someone else — create the account without it */
  drop_phone?: boolean;
};
export type ImportKind = 'survey' | 'register';

export interface ImportResult {
  options: { create_accounts: boolean; update_profiles: boolean };
  created_farmers: number;
  linked_farmers: number;
  skipped_no_account: number;
  accounts_without_phone: number;
  created_farms: number;
  updated_farms: number;
  upis_saved: number;
  upi_conflicts: number;
  surveys: number;
  skipped_invalid: number;
  skipped_duplicates: number;
  failed: { row_number: number; sheet?: string; error: string }[];
  /** First accounts created (capped), for display */
  new_accounts: { row_number: number; farmer_id: string; name: string; phone: string | null }[];
}

const CHECKPOINT_EVERY = 25;
const MAX_LISTED = 2000;
/** Batches up to this size are imported inside the request; bigger ones in the background. */
export const SYNC_COMMIT_MAX_ROWS = 300;

const sharesAName = (a: string, b: string) => {
  const A = new Set(nameKey(a).split(' ').filter((x) => x.length > 1));
  return nameKey(b).split(' ').some((t) => t.length > 1 && A.has(t));
};
const rowLabel = (r: { row_number: number; sheet?: string }) => (r.sheet ? `${r.sheet} row ${r.row_number}` : `row ${r.row_number}`);

/** Fill gaps in `target` from `source` (member register rows listed on two sheets). */
function mergeInto(target: ParsedRow, source: ParsedRow) {
  for (const [k, v] of Object.entries(source.data)) {
    const cur = (target.data as any)[k];
    if (cur === undefined || cur === null || cur === '' || (Array.isArray(cur) && cur.length === 0)) (target.data as any)[k] = v;
  }
}

// ── Preview ──────────────────────────────────────────────────────────────────

export async function prepareRows(parsed: ParsedRow[], kind: ImportKind): Promise<StoredRow[]> {
  const rows: StoredRow[] = parsed.map((r) => ({ ...r, match: null, skip: null }));

  // 0. GPS against the official boundaries: fill a missing district / sector /
  //    cell, and flag rows whose point is somewhere else than the address given.
  for (const row of rows) {
    const d = row.data;
    if (d.latitude === undefined || d.longitude === undefined) continue;
    const at = locate(d.latitude, d.longitude);
    if (!at.district) continue;
    if (!d.district) {
      Object.assign(d, { province: at.province, district: at.district });
      if (at.sector && !d.sector) d.sector = at.sector;
      if (at.cell && !d.cell) d.cell = at.cell;
      row.errors = row.errors.filter((e) => e !== 'Missing district');
      row.warnings.push(`District taken from the GPS point: ${at.sector ? `${at.sector}, ` : ''}${at.district}`);
    } else if (!sameArea(d.district, at.district)) {
      row.warnings.push(`GPS point is in ${at.sector ? `${at.sector} sector, ` : ''}${at.district} district, but the farm is recorded in ${d.district} — check the location`);
    } else if (d.sector && at.sector && !sameArea(d.sector, at.sector)) {
      row.warnings.push(`GPS point is in ${at.sector} sector, but the farm is recorded in ${d.sector} sector`);
    } else {
      if (!d.sector && at.sector) d.sector = at.sector;
      if (!d.cell && at.cell && (!d.sector || sameArea(d.sector, at.sector))) d.cell = at.cell;
    }
  }

  // 1. Same national ID more than once in the file. In the member register it is
  //    the same member listed again (e.g. on a later month's sheet): merge. In a
  //    field survey it is one farmer with several farms: keep every row, they
  //    link to one account on commit.
  const firstByNid = new Map<string, StoredRow>();
  for (const row of rows) {
    const nid = row.data.national_id;
    if (!nid || row.errors.length) continue;
    const first = firstByNid.get(nid);
    if (!first) { firstByNid.set(nid, row); continue; }
    if (kind === 'register') {
      mergeInto(first, row);
      row.skip = `Same member as ${rowLabel(first)} — merged into it`;
    } else {
      row.warnings.push(`Same national ID as ${rowLabel(first)} (${farmerNameOf(first.data)}) — imported as the same farmer`);
    }
  }

  // 2. A phone number given for two different people (an enumerator's or a farm
  //    manager's number typed for several farmers). Only the first person keeps
  //    it — activation codes go to that number, so it must identify one farmer.
  const ownerOfPhone = new Map<string, { id: string; name: string; label: string }>();
  for (const row of rows) {
    if (row.skip || row.errors.length) continue;
    const phone = farmerPhoneOf(row.data);
    if (!phone) continue;
    const name = farmerNameOf(row.data);
    const id = row.data.national_id || nameKey(name);
    const owner = ownerOfPhone.get(phone);
    if (!owner) { ownerOfPhone.set(phone, { id, name, label: rowLabel(row) }); continue; }
    const samePerson = owner.id === id || (!row.data.national_id && sharesAName(owner.name, name));
    if (!samePerson) {
      row.drop_phone = true;
      row.warnings.push(`Phone ${phone} is also given for ${owner.name} (${owner.label}). It stays with them; add this farmer's own number so they can activate.`);
    }
  }

  // 3. Match farmers already in the system: national ID first, then phone + name.
  const nids = [...firstByNid.keys()];
  const phones = [...ownerOfPhone.keys()];
  const [profiles, users] = await Promise.all([
    nids.length
      ? prisma.farmerProfile.findMany({ where: { id_number: { in: nids } }, select: { id_number: true, user: { select: { id: true, full_name: true } } } })
      : [],
    phones.length
      ? prisma.user.findMany({
          where: { phone: { in: phones } },
          select: { id: true, full_name: true, phone: true, role: true, farmer_profile: { select: { id_number: true } } },
        })
      : [],
  ]);
  const byNid = new Map(profiles.map((p) => [p.id_number!, p.user]));
  const byPhone = new Map(users.map((u) => [u.phone!, u]));

  for (const r of rows) {
    if (r.skip) continue;
    const nidUser = r.data.national_id ? byNid.get(r.data.national_id) : undefined;
    const phone = r.drop_phone ? undefined : farmerPhoneOf(r.data);
    const phoneUser = phone ? byPhone.get(phone) : undefined;
    if (nidUser) {
      r.match = { type: 'national_id', farmer_id: nidUser.id, farmer_name: nidUser.full_name };
    } else if (phoneUser) {
      const name = farmerNameOf(r.data);
      const otherNid = phoneUser.farmer_profile?.id_number && r.data.national_id && phoneUser.farmer_profile.id_number !== r.data.national_id;
      if (phoneUser.role === 'farmer' && !otherNid && (!name || sharesAName(phoneUser.full_name, name))) {
        r.match = { type: 'phone', farmer_id: phoneUser.id, farmer_name: phoneUser.full_name };
      } else {
        r.drop_phone = true;
        r.warnings.push(`Phone ${phone} already belongs to ${phoneUser.full_name} in the system — this farmer will be created without a phone`);
      }
    }
    if (!r.drop_phone && !farmerPhoneOf(r.data) && !r.data.national_id) {
      r.warnings.push('No valid phone or national ID — the farmer cannot activate until an agent adds their phone number');
    } else if (!farmerPhoneOf(r.data)) {
      r.warnings.push('No valid phone number — the farmer cannot activate until an agent adds one');
    }
  }
  return rows;
}

export function summarizeRow(r: StoredRow) {
  return {
    row_number: r.row_number,
    sheet: r.sheet ?? null,
    farmer_name: farmerNameOf(r.data) || null,
    national_id: r.data.national_id ?? null,
    phone: r.drop_phone ? null : farmerPhoneOf(r.data) ?? null,
    district: r.data.district ?? null,
    sector: r.data.sector ?? null,
    trees: r.data.physical_tree_count ?? null,
    upi: r.data.upi ?? null,
    has_location: r.data.latitude !== undefined,
    match: r.match,
    skip: r.skip ?? null,
    errors: r.errors,
    warnings: r.warnings,
  };
}

export function previewCounts(rows: StoredRow[]) {
  const importable = rows.filter((r) => !r.errors.length && !r.skip);
  return {
    total_rows: rows.length,
    valid_rows: rows.filter((r) => !r.errors.length).length,
    error_rows: rows.filter((r) => r.errors.length).length,
    duplicate_rows: rows.filter((r) => r.skip && !r.errors.length).length,
    warning_rows: rows.filter((r) => r.warnings.length).length,
    matched_existing: importable.filter((r) => r.match).length,
    // People, not rows: a farmer listed on several rows is one new account.
    new_farmers: new Set(importable.filter((r) => !r.match).map((r) => r.data.national_id || (!r.drop_phone && farmerPhoneOf(r.data)) || `row:${r.sheet ?? ''}:${r.row_number}`)).size,
    with_location: importable.filter((r) => r.data.latitude !== undefined).length,
    with_upi: importable.filter((r) => r.data.upi).length,
    without_phone: importable.filter((r) => r.drop_phone || !farmerPhoneOf(r.data)).length,
  };
}

// ── Commit ───────────────────────────────────────────────────────────────────

const DATE_FIELDS = ['interview_date', 'date_of_birth', 'planting_date'] as const;
function reviveDates(data: Record<string, any>) {
  for (const f of DATE_FIELDS) if (typeof data[f] === 'string') data[f] = new Date(data[f]);
  return data;
}

const blank = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const sameText = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

export const emptyResult = (options: ImportResult['options']): ImportResult => ({
  options,
  created_farmers: 0, linked_farmers: 0, skipped_no_account: 0, accounts_without_phone: 0,
  created_farms: 0, updated_farms: 0, upis_saved: 0, upi_conflicts: 0,
  surveys: 0, skipped_invalid: 0, skipped_duplicates: 0, failed: [], new_accounts: [],
});

async function importRow(
  tx: Prisma.TransactionClient,
  row: StoredRow,
  ctx: { batchId: string; fileName: string; kind: ImportKind; passwordHash: string; result: ImportResult }
) {
  const { result } = ctx;
  const d = reviveDates({ ...row.data });
  const name = farmerNameOf(d);
  const phone = row.drop_phone ? null : farmerPhoneOf(d) ?? null;
  const farmLoc = { province: d.province ?? null, district: d.district ?? null, sector: d.sector ?? null, cell: d.cell ?? null, village: d.village ?? null };
  const homeLoc = {
    province: d.home_province ?? farmLoc.province, district: d.home_district ?? farmLoc.district, sector: d.home_sector ?? farmLoc.sector,
    cell: d.home_cell ?? farmLoc.cell, village: d.home_village ?? farmLoc.village,
  };

  // 1. Farmer account — re-check by ID / phone: an earlier row in this import may have created them.
  let farmerId: string | null = row.match?.farmer_id ?? null;
  if (!farmerId && d.national_id) {
    farmerId = (await tx.farmerProfile.findFirst({ where: { id_number: d.national_id }, select: { user_id: true } }))?.user_id ?? null;
  }
  let phoneTaken = false;
  if (!farmerId && phone) {
    const owner = await tx.user.findFirst({ where: { phone }, select: { id: true, role: true, full_name: true, farmer_profile: { select: { id_number: true } } } });
    if (owner) {
      const otherNid = owner.farmer_profile?.id_number && d.national_id && owner.farmer_profile.id_number !== d.national_id;
      if (owner.role === 'farmer' && !otherNid && sharesAName(owner.full_name, name)) farmerId = owner.id;
      else phoneTaken = true;
    }
  }

  if (farmerId) {
    result.linked_farmers++;
  } else if (result.options.create_accounts) {
    const user = await tx.user.create({
      data: {
        email: `farmer-${crypto.randomBytes(6).toString('hex')}@survey-import.local`,
        password: ctx.passwordHash,
        full_name: name,
        phone: phoneTaken ? null : phone,
        role: 'farmer',
        status: 'active',
        credentials_claimed: false,
        qr_code_token: generateQRToken(),
        profile: { ...homeLoc, source: ctx.kind === 'register' ? 'member_register_import' : 'survey_import', batch_id: ctx.batchId } as Prisma.InputJsonValue,
      },
    });
    farmerId = user.id;
    result.created_farmers++;
    if (phoneTaken || !phone) result.accounts_without_phone++;
    if (result.new_accounts.length < MAX_LISTED) {
      result.new_accounts.push({ row_number: row.row_number, farmer_id: user.id, name, phone: phoneTaken ? null : phone });
    }
  } else {
    result.skipped_no_account++;
  }

  // 2. Farmer profile — only fill gaps, never overwrite what the farmer/agent entered.
  if (farmerId) {
    const area = farmAreaHectares(d.farm_area);
    const gender = d.sex === 'male' ? 'Male' : d.sex === 'female' ? 'Female' : undefined;
    const profileData: Record<string, any> = {
      age: d.farmer_age, id_number: d.national_id, gender,
      province: homeLoc.province, district: homeLoc.district, sector: homeLoc.sector, cell: homeLoc.cell, village: homeLoc.village,
      farm_province: farmLoc.province, farm_district: farmLoc.district, farm_sector: farmLoc.sector, farm_cell: farmLoc.cell, farm_village: farmLoc.village,
      farm_size: area?.hectares, tree_count: d.physical_tree_count || undefined, avocado_type: d.varieties?.join(', '),
      planted: d.planting_date ? String((d.planting_date as Date).getUTCFullYear()) : undefined,
      upi_number: d.upi, assistance: d.assistance?.length ? d.assistance : undefined,
    };
    Object.keys(profileData).forEach((k) => (profileData[k] === undefined || profileData[k] === null) && delete profileData[k]);
    const existing = await tx.farmerProfile.findUnique({ where: { user_id: farmerId } });
    if (!existing) {
      await tx.farmerProfile.create({ data: { user_id: farmerId, ...profileData } as any });
    } else if (result.options.update_profiles) {
      const fill: Record<string, any> = {};
      for (const [k, v] of Object.entries(profileData)) {
        const cur = (existing as any)[k];
        if (blank(cur) || (k === 'tree_count' && cur === 0)) fill[k] = v;
      }
      if (Object.keys(fill).length) await tx.farmerProfile.update({ where: { user_id: farmerId }, data: fill });
    }
  }

  // 3. Farm — reuse the farmer's farm on the same parcel (UPI) or in the same
  //    village; a farmer with farms in two places gets two farms.
  let farmId: string | null = null;
  if (farmerId) {
    const area = farmAreaHectares(d.farm_area);
    const treeCount = d.physical_tree_count ?? 0;
    let upi: string | null = d.upi ?? null;
    if (upi) {
      const clash = await tx.farm.findFirst({ where: { upi, archived_at: null, farmer_id: { not: farmerId } }, select: { id: true } });
      if (clash) { result.upi_conflicts++; upi = null; }
    }
    const farms = await tx.farm.findMany({ where: { farmer_id: farmerId, archived_at: null }, orderBy: { created_at: 'asc' } });
    const villageOf = (f: { location: unknown }) => (f.location as any)?.village;
    const farm =
      (upi && farms.find((f) => f.upi === upi)) ||
      farms.find((f) => (!upi || !f.upi) && (!d.village || !villageOf(f) || sameText(villageOf(f), d.village)));
    const notes = [
      `Imported from ${ctx.kind === 'register' ? 'the ASR member register' : 'the field survey'} (${ctx.fileName}, ${rowLabel(row)})`,
      d.extra_upis?.length ? `Other UPIs listed: ${d.extra_upis.join(', ')}` : null,
    ].filter(Boolean).join('. ');

    if (farm) {
      farmId = farm.id;
      const fill: Prisma.FarmUpdateInput = {};
      if (farm.latitude === null && d.latitude !== undefined) { fill.latitude = d.latitude; fill.longitude = d.longitude; }
      if (!farm.tree_count && treeCount) fill.tree_count = treeCount;
      if (!farm.farm_size && area) fill.farm_size = area.hectares;
      if ((!farm.varieties || farm.varieties.length === 0) && d.varieties?.length) fill.varieties = d.varieties;
      if (!farm.upi && upi) { fill.upi = upi; fill.land_source = farm.land_source ?? 'manual'; result.upis_saved++; }
      const loc = (farm.location as any) || {};
      const missingLoc = Object.entries(farmLoc).filter(([k, v]) => v && blank(loc[k]));
      if (missingLoc.length) fill.location = { ...loc, ...Object.fromEntries(missingLoc) };
      if (Object.keys(fill).length) { await tx.farm.update({ where: { id: farm.id }, data: fill }); result.updated_farms++; }
    } else {
      const created = await tx.farm.create({
        data: {
          farmName: `${name.split(' ')[0] || 'Farmer'}'s avocado farm${d.village ? ` (${d.village})` : ''}`,
          farmerName: name,
          farmer_id: farmerId,
          location: { ...farmLoc, coordinates: d.latitude !== undefined ? { lat: d.latitude, lng: d.longitude } : null },
          farm_size: area?.hectares ?? 0,
          tree_count: treeCount,
          varieties: d.varieties ?? [],
          planting_date: d.planting_date ?? d.interview_date ?? new Date(),
          status: d.ever_harvested ? 'producing' : treeCount ? 'growing' : 'preparing',
          latitude: d.latitude ?? null,
          longitude: d.longitude ?? null,
          upi,
          land_source: upi ? 'manual' : null,
          notes,
        },
      });
      farmId = created.id;
      result.created_farms++;
      if (upi) result.upis_saved++;
    }
  }

  // 4. Field survey record (survey files only; kept even without an account).
  if (ctx.kind === 'survey') {
    const { survey_province, survey_district, ...rest } = d;
    for (const f of NON_SURVEY_FIELDS) delete (rest as any)[f];
    await tx.farmSurvey.create({
      data: {
        ...(rest as any),
        survey_province: survey_province ?? null,
        survey_district: survey_district ?? null,
        seedling_sources: d.seedling_sources ?? [],
        varieties: d.varieties ?? [],
        fertilizer_types: d.fertilizer_types ?? [],
        pesticide_types: d.pesticide_types ?? [],
        input_access: d.input_access ?? [],
        selling_channels: d.selling_channels ?? [],
        production_info_access: d.production_info_access ?? [],
        market_info_access: d.market_info_access ?? [],
        credit_access: d.credit_access ?? [],
        raw: { ...row.raw, ...(row.sheet ? { _sheet: row.sheet } : {}) } as Prisma.InputJsonValue,
        batch_id: ctx.batchId,
        row_number: row.row_number,
        farmer_id: farmerId,
        farm_id: farmId,
      },
    });
    result.surveys++;
  }
}

const running = new Set<string>();
export const isCommitRunning = (batchId: string) => running.has(batchId);

/**
 * Import every row of a batch whose status is already 'committing', starting
 * at `progress`. Safe to call again after a crash: rows before the last
 * checkpoint are skipped, and rows after it re-match the accounts they created.
 */
export async function commitBatch(batchId: string): Promise<ImportResult | null> {
  if (running.has(batchId)) return null;
  running.add(batchId);
  try {
    const batch = await prisma.surveyImportBatch.findUnique({ where: { id: batchId } });
    if (!batch || batch.status !== 'committing') return null;
    const rows = batch.rows as unknown as StoredRow[];
    const kind = (batch.kind === 'register' ? 'register' : 'survey') as ImportKind;
    const result: ImportResult = { ...emptyResult({ create_accounts: true, update_profiles: true }), ...((batch.result as any) ?? {}) };
    // One unguessable hash for the whole batch: nobody knows the password, the
    // farmer sets their own when activating.
    const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
    const ctx = { batchId, fileName: batch.file_name, kind, passwordHash, result };

    // Rows already stored before a restart (resume only): one query, not one per row.
    const done = new Set<string>();
    if (kind === 'survey' && batch.progress > 0) {
      const existing = await prisma.farmSurvey.findMany({ where: { batch_id: batchId }, select: { row_number: true, raw: true } });
      existing.forEach((e) => done.add(`${(e.raw as any)?._sheet ?? ''}#${e.row_number}`));
    }

    const checkpoint = (progress: number, status?: 'committed' | 'failed') =>
      prisma.surveyImportBatch.update({
        where: { id: batchId },
        data: { progress, result: result as unknown as Prisma.InputJsonValue, ...(status ? { status } : {}) },
      });

    for (let i = batch.progress; i < rows.length; i++) {
      const row = rows[i];
      if (row.errors.length) result.skipped_invalid++;
      else if (row.skip) result.skipped_duplicates++;
      else {
        if (!done.has(`${row.sheet ?? ''}#${row.row_number}`)) {
          try {
            await prisma.$transaction((tx) => importRow(tx, row, ctx), { timeout: 20000 });
          } catch (error: any) {
            logger.error(`Import ${batchId} ${rowLabel(row)} failed: ${error?.message}`);
            if (result.failed.length < MAX_LISTED) {
              result.failed.push({ row_number: row.row_number, sheet: row.sheet, error: error?.message?.split('\n').pop() || 'Unknown error' });
            }
          }
        }
      }
      if ((i + 1) % CHECKPOINT_EVERY === 0) await checkpoint(i + 1);
    }

    const imported = result.created_farmers + result.linked_farmers + result.surveys;
    await checkpoint(rows.length, imported === 0 && result.failed.length ? 'failed' : 'committed');
    logger.info(`Import ${batchId} finished: ${result.created_farmers} new farmers, ${result.linked_farmers} linked, ${result.failed.length} failed`);
    return result;
  } catch (error: any) {
    logger.error(`Import ${batchId} stopped: ${error?.message}`);
    throw error;
  } finally {
    running.delete(batchId);
  }
}

/** At startup: continue imports that were running when the server stopped. */
export async function resumeInterruptedImports() {
  const stuck = await prisma.surveyImportBatch.findMany({ where: { status: 'committing' }, select: { id: true, progress: true, total_rows: true } });
  for (const b of stuck) {
    logger.warn(`Resuming farmer import ${b.id} at row ${b.progress}/${b.total_rows}`);
    commitBatch(b.id).catch(() => undefined);
  }
}
