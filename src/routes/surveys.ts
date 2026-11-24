import { Router, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { validateIdParam } from '../middleware/validation';
import { sendSuccess, sendCreated, sendError, sendNotFound, sendPaginatedResponse } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { generateQRToken } from '../utils/accessKey';
import logger from '../config/logger';
import {
  mapHeaders,
  parseRow,
  ParsedRow,
  farmerNameOf,
  farmerPhoneOf,
  farmAreaHectares,
} from '../services/surveyParser';

const router = Router();

const MAX_ROWS = 5000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(new Error('Upload an Excel (.xlsx/.xls) or CSV file'));
  },
});

type Match = { type: 'national_id' | 'phone'; farmer_id: string; farmer_name: string } | null;
type StoredRow = ParsedRow & { match: Match };

/** Hydrate dates that were serialised to strings when the batch was stored as JSON. */
const DATE_FIELDS = ['interview_date', 'date_of_birth', 'planting_date'] as const;
function reviveDates(data: Record<string, any>) {
  for (const f of DATE_FIELDS) if (typeof data[f] === 'string') data[f] = new Date(data[f]);
  return data;
}

// ── Import: preview ──────────────────────────────────────────────────────────

/**
 * @route POST /api/surveys/import/preview
 * @desc  Upload the survey spreadsheet. Parses + validates every row, matches
 *        existing farmers (national ID, then phone) and stores a preview batch.
 *        Nothing is written to farmer/farm tables yet.
 * @access Admin, Agent
 */
router.post(
  '/import/preview',
  authenticate,
  authorize('admin', 'agent'),
  upload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) return sendError(res, 'No file uploaded (field name: "file")', 400);

    let sheetRows: unknown[][];
    let sheetName: string;
    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      sheetName = (req.body?.sheet && wb.SheetNames.includes(req.body.sheet)) ? req.body.sheet : wb.SheetNames[0];
      sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });
    } catch {
      return sendError(res, 'Could not read the file — is it a valid Excel/CSV file?', 400);
    }
    if (sheetRows.length < 2) return sendError(res, 'The sheet has no data rows', 400);

    // The header row is the first row containing a recognisable column.
    const headerIdx = sheetRows.slice(0, 10).findIndex((r) => mapHeaders(r as unknown[]).columns.some((c) => c.field));
    if (headerIdx === -1) return sendError(res, 'Could not find the header row (expected columns like District, owner of the farm, national_id)', 400);

    const { columns, unknown, missingCore } = mapHeaders(sheetRows[headerIdx] as unknown[]);
    const dataRows = sheetRows.slice(headerIdx + 1).filter((r) => (r as unknown[]).some((c) => c !== null && String(c).trim() !== ''));
    if (dataRows.length === 0) return sendError(res, 'The sheet has no data rows', 400);
    if (dataRows.length > MAX_ROWS) return sendError(res, `Too many rows (${dataRows.length}). Split the file into parts of at most ${MAX_ROWS}.`, 400);

    const parsed = dataRows.map((r, i) => parseRow(r as unknown[], columns, headerIdx + i + 2));

    // Duplicates inside the file.
    const firstByNid = new Map<string, number>();
    for (const row of parsed) {
      const nid = row.data.national_id;
      if (!nid || !/^\d{16}$/.test(nid)) continue;
      const prev = firstByNid.get(nid);
      if (prev) row.errors.push(`Duplicate national_id — same as row ${prev}`);
      else firstByNid.set(nid, row.row_number);
    }

    // Match existing farmers in bulk.
    const nids = [...firstByNid.keys()];
    const phones = [...new Set(parsed.map((r) => farmerPhoneOf(r.data)).filter(Boolean) as string[])];
    const [profiles, users] = await Promise.all([
      nids.length
        ? prisma.farmerProfile.findMany({ where: { id_number: { in: nids } }, select: { id_number: true, user: { select: { id: true, full_name: true } } } })
        : [],
      phones.length
        ? prisma.user.findMany({ where: { role: 'farmer', phone: { in: phones } }, select: { id: true, full_name: true, phone: true } })
        : [],
    ]);
    const byNid = new Map(profiles.map((p) => [p.id_number!, p.user]));
    const byPhone = new Map(users.map((u) => [u.phone!, u]));

    const rows: StoredRow[] = parsed.map((r) => {
      const nidUser = r.data.national_id ? byNid.get(r.data.national_id) : undefined;
      const phone = farmerPhoneOf(r.data);
      const phoneUser = phone ? byPhone.get(phone) : undefined;
      let match: Match = null;
      if (nidUser) match = { type: 'national_id', farmer_id: nidUser.id, farmer_name: nidUser.full_name };
      else if (phoneUser) {
        match = { type: 'phone', farmer_id: phoneUser.id, farmer_name: phoneUser.full_name };
        const name = farmerNameOf(r.data).toLowerCase();
        if (name && !phoneUser.full_name.toLowerCase().includes(name.split(' ')[0])) {
          r.warnings.push(`Phone matches existing farmer "${phoneUser.full_name}" but the name differs — check before importing`);
        }
      }
      if (!farmerPhoneOf(r.data) && !r.data.national_id) {
        r.warnings.push('No valid phone or national ID — the farmer can only be found by name later');
      }
      return { ...r, match };
    });

    const errorRows = rows.filter((r) => r.errors.length).length;
    const batch = await prisma.surveyImportBatch.create({
      data: {
        file_name: req.file.originalname,
        total_rows: rows.length,
        valid_rows: rows.length - errorRows,
        error_rows: errorRows,
        rows: rows as unknown as Prisma.InputJsonValue,
        created_by: req.user!.id,
      },
    });

    return sendCreated(
      res,
      {
        batch_id: batch.id,
        file_name: batch.file_name,
        sheet: sheetName,
        total_rows: rows.length,
        valid_rows: rows.length - errorRows,
        error_rows: errorRows,
        warning_rows: rows.filter((r) => r.warnings.length).length,
        matched_existing: rows.filter((r) => r.match && !r.errors.length).length,
        new_farmers: rows.filter((r) => !r.match && !r.errors.length).length,
        with_location: rows.filter((r) => r.data.latitude !== undefined).length,
        columns: {
          recognized: columns.filter((c) => c.field).map((c) => ({ header: c.header, field: c.field })),
          unrecognized: unknown,
          missing_core: missingCore,
        },
        rows: rows.slice(0, 200).map(summarizeRow),
      },
      'Preview ready — review the issues, then commit the import'
    );
  })
);

function summarizeRow(r: StoredRow) {
  return {
    row_number: r.row_number,
    farmer_name: farmerNameOf(r.data) || null,
    national_id: r.data.national_id ?? null,
    phone: farmerPhoneOf(r.data) ?? null,
    district: r.data.district ?? null,
    sector: r.data.sector ?? null,
    trees: r.data.physical_tree_count ?? null,
    has_location: r.data.latitude !== undefined,
    match: r.match,
    errors: r.errors,
    warnings: r.warnings,
  };
}

/**
 * @route GET /api/surveys/import/batches
 * @access Admin, Agent
 */
router.get(
  '/import/batches',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const batches = await prisma.surveyImportBatch.findMany({
      orderBy: { created_at: 'desc' },
      take: 50,
      select: {
        id: true, file_name: true, status: true, total_rows: true, valid_rows: true, error_rows: true,
        result: true, created_at: true, committed_at: true, creator: { select: { full_name: true } },
      },
    });
    return sendSuccess(res, batches, 'Import batches retrieved');
  })
);

/**
 * @route GET /api/surveys/import/batches/:id
 * @desc  Batch detail with rows (filter=errors|warnings|all, paginated)
 * @access Admin, Agent
 */
router.get(
  '/import/batches/:id',
  authenticate,
  authorize('admin', 'agent'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const batch = await prisma.surveyImportBatch.findUnique({ where: { id: req.params.id } });
    if (!batch) return sendNotFound(res, 'Import batch not found');
    const filter = String(req.query.filter || 'all');
    let rows = (batch.rows as unknown as StoredRow[]);
    if (filter === 'errors') rows = rows.filter((r) => r.errors.length);
    if (filter === 'warnings') rows = rows.filter((r) => r.warnings.length);
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
    const { rows: _all, ...meta } = batch;
    return sendSuccess(res, {
      ...meta,
      filter,
      total_filtered: rows.length,
      page,
      rows: rows.slice((page - 1) * limit, page * limit).map(summarizeRow),
    }, 'Import batch retrieved');
  })
);

// ── Import: commit ───────────────────────────────────────────────────────────

/**
 * @route POST /api/surveys/import/batches/:id/commit
 * @desc  Import every valid row: link or create the farmer account (claimable
 *        later via POST /api/auth/verify-phone), create/update FarmerProfile and
 *        Farm (with GPS location), and store the full survey record.
 *        Body: { create_accounts?: boolean = true, update_profiles?: boolean = true }
 * @access Admin
 */
router.post(
  '/import/batches/:id/commit',
  authenticate,
  authorize('admin'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const createAccounts = req.body?.create_accounts !== false;
    const updateProfiles = req.body?.update_profiles !== false;

    // Claim the batch atomically so a double-click can't import twice.
    const claimed = await prisma.surveyImportBatch.updateMany({
      where: { id: req.params.id, status: 'previewed' },
      data: { status: 'committed', committed_at: new Date() },
    });
    if (claimed.count === 0) {
      const exists = await prisma.surveyImportBatch.findUnique({ where: { id: req.params.id }, select: { status: true } });
      if (!exists) return sendNotFound(res, 'Import batch not found');
      return sendError(res, `This batch was already ${exists.status}`, 409);
    }
    const batch = (await prisma.surveyImportBatch.findUnique({ where: { id: req.params.id } }))!;
    const rows = batch.rows as unknown as StoredRow[];

    const result = {
      created_farmers: 0,
      linked_farmers: 0,
      skipped_no_account: 0,
      created_farms: 0,
      updated_farms: 0,
      surveys: 0,
      skipped_invalid: 0,
      failed: [] as { row_number: number; error: string }[],
      new_accounts: [] as { row_number: number; farmer_id: string; name: string; phone: string | null }[],
    };

    for (const row of rows) {
      if (row.errors.length) {
        result.skipped_invalid++;
        continue;
      }
      const d = reviveDates({ ...row.data });
      try {
        await prisma.$transaction(async (tx) => {
          // 1. Farmer account
          let farmerId: string | null = row.match?.farmer_id ?? null;
          // Re-check by national ID in case an earlier row in this commit created them.
          if (!farmerId && d.national_id) {
            const p = await tx.farmerProfile.findFirst({ where: { id_number: d.national_id }, select: { user_id: true } });
            farmerId = p?.user_id ?? null;
          }
          const phone = farmerPhoneOf(d) ?? null;
          const name = farmerNameOf(d);
          const location = { province: d.province ?? null, district: d.district ?? null, sector: d.sector ?? null, cell: d.cell ?? null, village: d.village ?? null };
          const area = farmAreaHectares(d.farm_area);
          const gender = d.sex === 'male' ? 'Male' : d.sex === 'female' ? 'Female' : undefined;
          const treeCount = d.physical_tree_count ?? 0;

          if (farmerId) {
            result.linked_farmers++;
          } else if (createAccounts) {
            const placeholderEmail = `farmer-${crypto.randomBytes(6).toString('hex')}@survey-import.local`;
            const user = await tx.user.create({
              data: {
                email: placeholderEmail,
                // Random, never shared: the farmer sets real credentials via /api/auth/verify-phone.
                password: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 8),
                full_name: name,
                phone,
                role: 'farmer',
                status: 'active',
                credentials_claimed: false,
                qr_code_token: generateQRToken(),
                profile: { ...location, source: 'survey_import', batch_id: batch.id } as Prisma.InputJsonValue,
              },
            });
            farmerId = user.id;
            result.created_farmers++;
            result.new_accounts.push({ row_number: row.row_number, farmer_id: user.id, name, phone });
          } else {
            result.skipped_no_account++;
          }

          // 2. Farmer profile
          if (farmerId) {
            const existing = await tx.farmerProfile.findUnique({ where: { user_id: farmerId } });
            const profileData: Record<string, any> = {
              age: d.farmer_age, id_number: d.national_id, gender,
              province: d.province, district: d.district, sector: d.sector, cell: d.cell, village: d.village,
              farm_province: d.province, farm_district: d.district, farm_sector: d.sector, farm_cell: d.cell, farm_village: d.village,
              farm_size: area?.hectares, tree_count: treeCount || undefined, avocado_type: d.varieties?.join(', '),
              planted: d.planting_date ? String((d.planting_date as Date).getUTCFullYear()) : undefined,
            };
            Object.keys(profileData).forEach((k) => profileData[k] === undefined && delete profileData[k]);
            if (!existing) {
              await tx.farmerProfile.create({ data: { user_id: farmerId, ...profileData } as any });
            } else if (updateProfiles) {
              // Only fill gaps — never overwrite what the farmer/agent already entered.
              const fill: Record<string, any> = {};
              for (const [k, v] of Object.entries(profileData)) {
                const cur = (existing as any)[k];
                if (cur === null || cur === undefined || cur === '' || (k === 'tree_count' && cur === 0)) fill[k] = v;
              }
              if (Object.keys(fill).length) await tx.farmerProfile.update({ where: { user_id: farmerId }, data: fill });
            }
          }

          // 3. Farm
          let farmId: string | null = null;
          if (farmerId) {
            const farm = await tx.farm.findFirst({ where: { farmer_id: farmerId, archived_at: null }, orderBy: { created_at: 'asc' } });
            if (farm) {
              farmId = farm.id;
              const fill: Prisma.FarmUpdateInput = {};
              if (farm.latitude === null && d.latitude !== undefined) { fill.latitude = d.latitude; fill.longitude = d.longitude; }
              if (!farm.tree_count && treeCount) fill.tree_count = treeCount;
              if ((!farm.varieties || farm.varieties.length === 0) && d.varieties?.length) fill.varieties = d.varieties;
              if (Object.keys(fill).length) { await tx.farm.update({ where: { id: farm.id }, data: fill }); result.updated_farms++; }
            } else {
              const created = await tx.farm.create({
                data: {
                  farmName: `${name.split(' ')[0] || 'Farmer'}'s avocado farm${d.village ? ` (${d.village})` : ''}`,
                  farmerName: name,
                  farmer_id: farmerId,
                  location: { ...location, coordinates: d.latitude !== undefined ? { lat: d.latitude, lng: d.longitude } : null },
                  farm_size: area?.hectares ?? 0,
                  tree_count: treeCount,
                  varieties: d.varieties ?? [],
                  planting_date: d.planting_date ?? d.interview_date ?? new Date(),
                  status: d.ever_harvested ? 'producing' : 'growing',
                  latitude: d.latitude ?? null,
                  longitude: d.longitude ?? null,
                  notes: `Imported from field survey (${batch.file_name}, row ${row.row_number})`,
                },
              });
              farmId = created.id;
              result.created_farms++;
            }
          }

          // 4. Survey record (always kept, even without an account)
          const { survey_province, survey_district, ...rest } = d;
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
              raw: row.raw as Prisma.InputJsonValue,
              batch_id: batch.id,
              row_number: row.row_number,
              farmer_id: farmerId,
              farm_id: farmId,
            },
          });
          result.surveys++;
        }, { timeout: 20000 });
      } catch (error: any) {
        logger.error(`Survey import row ${row.row_number} failed: ${error?.message}`);
        result.failed.push({ row_number: row.row_number, error: error?.message?.split('\n').pop() || 'Unknown error' });
      }
    }

    await prisma.surveyImportBatch.update({
      where: { id: batch.id },
      data: { result: result as unknown as Prisma.InputJsonValue, status: result.surveys === 0 && result.failed.length ? 'failed' : 'committed' },
    });
    return sendSuccess(res, result, `Imported ${result.surveys} survey records`);
  })
);

// ── Template ─────────────────────────────────────────────────────────────────

export const TEMPLATE_HEADERS = [
  'Province', 'District', 'Enumerator', 'Contact', 'Date of Interview', 'consent(y/n)', 'province', 'district', 'sector', 'cell', 'village',
  'Respondent', 'Respondent_contact', 'owneship(y/n)', 'role of respondent', 'owner of the farm', 'Farmer contact', 'sex', 'disability(y/n)',
  'position of the respondent', 'date_birth', 'Farmer age', 'national_id', 'land owner', 'Farm arrangement (Zoning)', 'Tree arrangement in a farmer',
  'farm_area', 'source of seedling', 'source_seed1', 'source_seed2', 'source_seed3', 'source_seed4', 'source_seed5', 'source_seed6',
  'avocado varieties', 'avocado variety1', 'avocado variety2', 'ever harvested(y/n)', 'number of avokado per tree', 'avocado fruits per tree per year',
  'total_tons', 'Price per avacado  at farm', 'use of fertiliser(y/n)', 'Type of fertiliser used', 'Type of fertiliser used (Yes) ', 'Type of fertiliser used (No)',
  'Use of pesticides(y/n)', 'pesticide type', 'access of inputs', 'other inputs', 'ways of selling', 'other ways of s', 'selling site (Collection site)',
  'main market aoutlet', 'access to production information', 'other access to p', 'access to market information', 'other access to m', 'use of credits(y/n)',
  'access to credit', 'access to credit1', 'access to credit2', 'access to credit3', 'access to credit4', 'access to credit5', 'access to credit6',
  'other way to access to c', 'effectiveness of aggr_model', 'challenges', 'physical count', 'Hass', 'Fuerte', 'date of planting', 'lat', 'long',
];

/**
 * @route GET /api/surveys/template
 * @desc  Download an empty survey template (.xlsx) with the expected columns.
 *        national_id is pre-formatted as text so Excel doesn't truncate it.
 * @access Admin, Agent
 */
router.get(
  '/template',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
    ws['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Survey');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="farmer-survey-template.xlsx"');
    res.send(buf);
  })
);

// ── Query ────────────────────────────────────────────────────────────────────

function surveyWhere(q: Record<string, string>): Prisma.FarmSurveyWhereInput {
  const where: Prisma.FarmSurveyWhereInput = {};
  if (q.province) where.province = q.province;
  if (q.district) where.district = q.district;
  if (q.sector) where.sector = q.sector;
  if (q.sex) where.sex = q.sex;
  if (q.batch_id) where.batch_id = q.batch_id;
  if (q.has_location === 'true') where.latitude = { not: null };
  if (q.has_location === 'false') where.latitude = null;
  if (q.linked === 'true') where.farmer_id = { not: null };
  if (q.search) {
    const s = q.search.trim();
    where.OR = [
      { owner_name: { contains: s, mode: 'insensitive' } },
      { respondent_name: { contains: s, mode: 'insensitive' } },
      { national_id: { contains: s } },
      { farmer_contact: { contains: s } },
      { village: { contains: s, mode: 'insensitive' } },
    ];
  }
  return where;
}

/**
 * @route GET /api/surveys
 * @desc  List survey records (filters: province, district, sector, sex, batch_id, has_location, linked, search)
 * @access Admin, Agent
 */
router.get(
  '/',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = req.query as Record<string, string>;
    const where = surveyWhere(q);
    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
    const [items, total] = await Promise.all([
      prisma.farmSurvey.findMany({
        where,
        orderBy: [{ interview_date: 'desc' }, { created_at: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, owner_name: true, respondent_name: true, sex: true, farmer_age: true, national_id: true, farmer_contact: true,
          province: true, district: true, sector: true, cell: true, village: true, interview_date: true, enumerator_name: true,
          physical_tree_count: true, hass_trees: true, fuerte_trees: true, farm_area: true, latitude: true, longitude: true,
          ever_harvested: true, uses_fertilizer: true, uses_credit: true, farmer_id: true, farm_id: true,
        },
      }),
      prisma.farmSurvey.count({ where }),
    ]);
    return sendPaginatedResponse(res, items, total, page, limit, 'Surveys retrieved');
  })
);

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

function topCounts(lists: (string[] | string | null)[], limit = 8) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const v of lists) {
    const items = Array.isArray(v) ? v : v ? String(v).split(/[,;\n]+/) : [];
    for (const raw of items) {
      const label = raw.trim();
      if (!label) continue;
      const k = label.toLowerCase();
      const cur = counts.get(k) ?? { label, count: 0 };
      cur.count++;
      counts.set(k, cur);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/**
 * @route GET /api/surveys/analytics
 * @desc  Aggregated indicators for the (filtered) surveys: demographics, adoption
 *        rates, production, varieties, market and credit access, top challenges.
 * @access Admin, Agent
 */
router.get(
  '/analytics',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const where = surveyWhere(req.query as Record<string, string>);
    const rows = await prisma.farmSurvey.findMany({
      where,
      select: {
        district: true, province: true, sex: true, farmer_age: true, has_disability: true, respondent_is_owner: true,
        uses_fertilizer: true, uses_pesticides: true, uses_credit: true, ever_harvested: true,
        physical_tree_count: true, hass_trees: true, fuerte_trees: true, total_tons: true, price_per_avocado: true, farm_area: true,
        latitude: true, farmer_id: true, seedling_sources: true, selling_channels: true, market_info_access: true,
        production_info_access: true, credit_access: true, fertilizer_types: true, main_market_outlet: true, challenges: true,
        aggregation_effectiveness: true, varieties: true,
      },
    });
    const n = rows.length;
    const rate = (key: keyof (typeof rows)[number]) => {
      const answered = rows.filter((r) => r[key] !== null && r[key] !== undefined);
      return { yes: answered.filter((r) => r[key] === true).length, answered: answered.length, pct: pct(answered.filter((r) => r[key] === true).length, answered.length) };
    };
    const sum = (key: 'physical_tree_count' | 'hass_trees' | 'fuerte_trees' | 'total_tons') => rows.reduce((s, r) => s + (r[key] ?? 0), 0);
    const avg = (key: 'price_per_avocado' | 'farm_area' | 'farmer_age') => {
      const vals = rows.map((r) => r[key]).filter((v): v is number => typeof v === 'number');
      return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
    };

    const byDistrict = new Map<string, { district: string; province: string | null; surveys: number; trees: number; tons: number; with_location: number }>();
    for (const r of rows) {
      const k = r.district ?? 'Unknown';
      const cur = byDistrict.get(k) ?? { district: k, province: r.province, surveys: 0, trees: 0, tons: 0, with_location: 0 };
      cur.surveys++;
      cur.trees += r.physical_tree_count ?? 0;
      cur.tons += r.total_tons ?? 0;
      if (r.latitude !== null) cur.with_location++;
      byDistrict.set(k, cur);
    }

    const ageGroups = [
      { label: 'Under 30', min: 0, max: 29 },
      { label: '30–44', min: 30, max: 44 },
      { label: '45–59', min: 45, max: 59 },
      { label: '60+', min: 60, max: 200 },
    ].map((g) => ({ label: g.label, count: rows.filter((r) => r.farmer_age !== null && r.farmer_age >= g.min && r.farmer_age <= g.max).length }));

    return sendSuccess(res, {
      totals: {
        surveys: n,
        linked_farmers: rows.filter((r) => r.farmer_id).length,
        with_location: rows.filter((r) => r.latitude !== null).length,
        trees: sum('physical_tree_count'),
        hass_trees: sum('hass_trees'),
        fuerte_trees: sum('fuerte_trees'),
        total_tons: Math.round(sum('total_tons') * 100) / 100,
        avg_price_per_avocado: avg('price_per_avocado'),
        avg_farm_area: avg('farm_area'),
        avg_age: avg('farmer_age'),
      },
      sex: {
        male: rows.filter((r) => r.sex === 'male').length,
        female: rows.filter((r) => r.sex === 'female').length,
        unknown: rows.filter((r) => !r.sex).length,
      },
      age_groups: ageGroups,
      rates: {
        uses_fertilizer: rate('uses_fertilizer'),
        uses_pesticides: rate('uses_pesticides'),
        uses_credit: rate('uses_credit'),
        ever_harvested: rate('ever_harvested'),
        has_disability: rate('has_disability'),
        respondent_is_owner: rate('respondent_is_owner'),
      },
      by_district: [...byDistrict.values()].sort((a, b) => b.surveys - a.surveys),
      top: {
        seedling_sources: topCounts(rows.map((r) => r.seedling_sources)),
        selling_channels: topCounts(rows.map((r) => r.selling_channels)),
        main_market_outlet: topCounts(rows.map((r) => r.main_market_outlet)),
        market_info_access: topCounts(rows.map((r) => r.market_info_access)),
        production_info_access: topCounts(rows.map((r) => r.production_info_access)),
        credit_access: topCounts(rows.map((r) => r.credit_access)),
        fertilizer_types: topCounts(rows.map((r) => r.fertilizer_types)),
        challenges: topCounts(rows.map((r) => r.challenges), 10),
        aggregation_effectiveness: topCounts(rows.map((r) => r.aggregation_effectiveness)),
        varieties: topCounts(rows.map((r) => r.varieties)),
      },
    }, 'Survey analytics');
  })
);

/**
 * @route GET /api/surveys/export
 * @desc  Download the filtered surveys as .xlsx (same filters as the list)
 * @access Admin, Agent
 */
router.get(
  '/export',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rows = await prisma.farmSurvey.findMany({ where: surveyWhere(req.query as Record<string, string>), orderBy: [{ district: 'asc' }, { owner_name: 'asc' }], take: 20000 });
    const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
    const yn = (b: boolean | null) => (b === null ? '' : b ? 'y' : 'n');
    const list = (a: string[]) => a.join(', ');
    const data = rows.map((r) => ({
      'Interview date': fmtDate(r.interview_date), Enumerator: r.enumerator_name ?? '', Province: r.province ?? '', District: r.district ?? '',
      Sector: r.sector ?? '', Cell: r.cell ?? '', Village: r.village ?? '', 'Farm owner': r.owner_name ?? '', Respondent: r.respondent_name ?? '',
      'Farmer contact': r.farmer_contact ?? '', Sex: r.sex ?? '', Age: r.farmer_age ?? '', 'National ID': r.national_id ?? '',
      'Disability (y/n)': yn(r.has_disability), 'Farm area': r.farm_area ?? '', 'Trees (physical count)': r.physical_tree_count ?? '',
      Hass: r.hass_trees ?? '', Fuerte: r.fuerte_trees ?? '', Varieties: list(r.varieties), 'Planting date': fmtDate(r.planting_date),
      'Ever harvested': yn(r.ever_harvested), 'Total tons': r.total_tons ?? '', 'Price per avocado (RWF)': r.price_per_avocado ?? '',
      'Uses fertiliser': yn(r.uses_fertilizer), 'Fertiliser types': list(r.fertilizer_types), 'Uses pesticides': yn(r.uses_pesticides),
      'Selling channels': list(r.selling_channels), 'Main market outlet': r.main_market_outlet ?? '', 'Uses credit': yn(r.uses_credit),
      'Credit access': list(r.credit_access), Challenges: r.challenges ?? '', Latitude: r.latitude ?? '', Longitude: r.longitude ?? '',
      'Linked to farmer account': r.farmer_id ? 'yes' : 'no',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Surveys');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="farmer-surveys-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buf);
  })
);

/**
 * @route GET /api/surveys/:id
 * @desc  Full survey record including every original spreadsheet column (raw)
 * @access Admin, Agent
 */
router.get(
  '/:id',
  authenticate,
  authorize('admin', 'agent'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const survey = await prisma.farmSurvey.findUnique({
      where: { id: req.params.id },
      include: {
        farmer: { select: { id: true, full_name: true, phone: true, credentials_claimed: true } },
        farm: { select: { id: true, farmName: true, upi: true } },
        batch: { select: { id: true, file_name: true, created_at: true } },
      },
    });
    if (!survey) return sendNotFound(res, 'Survey not found');
    return sendSuccess(res, survey, 'Survey retrieved');
  })
);

/**
 * @route DELETE /api/surveys/:id
 * @desc  Delete a survey record (does not delete the linked farmer or farm)
 * @access Admin
 */
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const s = await prisma.farmSurvey.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!s) return sendNotFound(res, 'Survey not found');
    await prisma.farmSurvey.delete({ where: { id: s.id } });
    return sendSuccess(res, null, 'Survey deleted');
  })
);

export default router;
