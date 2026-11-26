import { Router, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { validateIdParam } from '../middleware/validation';
import { sendSuccess, sendCreated, sendError, sendNotFound, sendPaginatedResponse } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { surveyScope } from '../utils/agentScope';
import logger from '../config/logger';
import { mapHeaders, parseRow, ParsedRow } from '../services/surveyParser';
import {
  StoredRow, ImportKind, prepareRows, previewCounts, summarizeRow, emptyResult, commitBatch, isCommitRunning, SYNC_COMMIT_MAX_ROWS,
} from '../services/farmerImport';

const router = Router();

const MAX_ROWS = 25000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(new Error('Upload an Excel (.xlsx/.xls) or CSV file'));
  },
});

/** A sheet's header row: the first of its top 15 rows with at least 3 known columns. */
function findHeader(rows: unknown[][]) {
  return rows.slice(0, 15).findIndex((r) => mapHeaders(r as unknown[]).columns.filter((c) => c.field).length >= 3);
}

/** Do a header-less sheet's first rows parse as data under `header` (a known district in most rows)? */
function looksLikeDataFor(header: unknown[], rows: unknown[][]) {
  const sample = rows.slice(0, 20);
  if (!sample.length || Math.abs(sample[0].length - header.length) > 3) return false;
  const { columns } = mapHeaders(header);
  const ok = sample.filter((r) => parseRow(r, columns, 0).data.district).length;
  return ok >= Math.ceil(sample.length * 0.6);
}

// ── Import: preview ──────────────────────────────────────────────────────────

/**
 * @route POST /api/surveys/import/preview
 * @desc  Upload a farmer spreadsheet — the field survey (one sheet per district
 *        is fine) or the ASR member register (firstname, lastname, telephone,
 *        idnumber, farm_*, upi-number …). Every sheet with a recognisable header
 *        is read (or only `sheet` when given). Rows are validated, duplicates
 *        merged, and farmers already in the system matched (national ID, then
 *        phone + name). Nothing is written to farmer/farm tables yet.
 * @access Admin, Agent
 */
router.post(
  '/import/preview',
  authenticate,
  authorize('admin', 'agent'),
  upload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) return sendError(res, 'No file uploaded (field name: "file")', 400);

    let wb: ReturnType<typeof XLSX.read>;
    try {
      wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    } catch {
      return sendError(res, 'Could not read the file — is it a valid Excel/CSV file?', 400);
    }
    const only = typeof req.body?.sheet === 'string' && wb.SheetNames.includes(req.body.sheet) ? req.body.sheet : null;
    const sheetNames = only ? [only] : wb.SheetNames;
    const multi = sheetNames.length > 1;

    const parsed: ParsedRow[] = [];
    const sheets: { name: string; rows: number; skipped_reason?: string; note?: string }[] = [];
    const recognized = new Map<string, string>();
    const unrecognized = new Set<string>();
    const missing = new Set<string>();
    const fields = new Set<string>();

    // Header of the last sheet that had one: district workbooks often have
    // sheets pasted without their header row, in the same column layout.
    let lastHeader: unknown[] | null = null;
    for (const name of sheetNames) {
      const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false }) as unknown[][];
      let headerIdx = findHeader(sheetRows);
      let header = headerIdx >= 0 ? sheetRows[headerIdx] : null;
      if (!header && lastHeader && looksLikeDataFor(lastHeader, sheetRows)) {
        header = lastHeader;
        headerIdx = -1; // data starts on the first row
      }
      if (!header) {
        sheets.push({ name, rows: 0, skipped_reason: 'No recognisable header row (e.g. District, owner of the farm / firstname, national_id)' });
        continue;
      }
      lastHeader = header;
      const { columns, unknown, missingCore } = mapHeaders(header);
      columns.forEach((c) => { if (c.field) { recognized.set(c.header, c.field); fields.add(c.field); } });
      unknown.forEach((u) => unrecognized.add(u));
      missingCore.forEach((m) => missing.add(m));
      let count = 0;
      sheetRows.slice(headerIdx + 1).forEach((r, i) => {
        if (!r.some((c) => c !== null && String(c).trim() !== '')) return;
        const row = parseRow(r, columns, headerIdx + i + 2);
        if (multi) row.sheet = name;
        parsed.push(row);
        count++;
      });
      sheets.push({ name, rows: count, ...(header !== sheetRows[headerIdx] ? { note: 'No header row — read with the previous sheet\'s columns' } : {}) });
    }

    if (!sheets.some((sh) => sh.rows > 0)) {
      return sendError(res, 'No data rows found. Expected a header row with columns like District, owner of the farm / firstname, national_id, telephone.', 400);
    }
    if (parsed.length > MAX_ROWS) return sendError(res, `Too many rows (${parsed.length}). Split the file into parts of at most ${MAX_ROWS}.`, 400);

    // A field survey has interview columns; the member register does not.
    const kind: ImportKind = fields.has('enumerator_name') || fields.has('interview_date') || fields.has('consent') ? 'survey' : 'register';
    const rows = await prepareRows(parsed, kind);
    const counts = previewCounts(rows);

    const batch = await prisma.surveyImportBatch.create({
      data: {
        file_name: req.file.originalname,
        kind,
        sheets: sheets as unknown as Prisma.InputJsonValue,
        total_rows: counts.total_rows,
        valid_rows: counts.valid_rows,
        error_rows: counts.error_rows,
        rows: rows as unknown as Prisma.InputJsonValue,
        created_by: req.user!.id,
      },
      select: { id: true, file_name: true },
    });

    return sendCreated(
      res,
      {
        batch_id: batch.id,
        file_name: batch.file_name,
        kind,
        sheet: sheetNames.length === 1 ? sheetNames[0] : null,
        sheets,
        ...counts,
        columns: {
          recognized: [...recognized].map(([header, field]) => ({ header, field })),
          unrecognized: [...unrecognized],
          missing_core: [...missing].filter((m) => !fields.has(m)),
        },
        rows: rows.slice(0, 200).map(summarizeRow),
      },
      'Preview ready — review the issues, then commit the import'
    );
  })
);

/**
 * @route GET /api/surveys/import/batches
 * @access Admin, Agent
 */
router.get(
  '/import/batches',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const batches = await prisma.surveyImportBatch.findMany({
      // A batch holds every row of the uploaded file: VBAs only see their own uploads.
      where: req.user!.role === 'agent' ? { created_by: req.user!.id } : {},
      orderBy: { created_at: 'desc' },
      take: 50,
      select: {
        id: true, file_name: true, kind: true, status: true, total_rows: true, valid_rows: true, error_rows: true, progress: true,
        result: true, created_at: true, committed_at: true, creator: { select: { full_name: true } },
      },
    });
    // The account list can be long; the table only needs the counters.
    return sendSuccess(res, batches.map((b) => ({ ...b, result: b.result ? { ...(b.result as any), new_accounts: undefined } : null })), 'Import batches retrieved');
  })
);

/**
 * @route GET /api/surveys/import/batches/:id
 * @desc  Batch detail: counters, commit progress/result and rows
 *        (filter=errors|warnings|duplicates|all, paginated)
 * @access Admin, Agent
 */
router.get(
  '/import/batches/:id',
  authenticate,
  authorize('admin', 'agent'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const batch = await prisma.surveyImportBatch.findUnique({ where: { id: req.params.id } });
    if (!batch || (req.user!.role === 'agent' && batch.created_by !== req.user!.id)) return sendNotFound(res, 'Import batch not found');
    const filter = String(req.query.filter || 'all');
    const all = batch.rows as unknown as StoredRow[];
    let rows = all;
    if (filter === 'errors') rows = rows.filter((r) => r.errors.length);
    if (filter === 'warnings') rows = rows.filter((r) => r.warnings.length);
    if (filter === 'duplicates') rows = rows.filter((r) => r.skip);
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
    const { rows: _all, ...meta } = batch;
    return sendSuccess(res, {
      ...meta,
      batch_id: batch.id,
      ...previewCounts(all),
      running: isCommitRunning(batch.id),
      filter,
      total_filtered: rows.length,
      page,
      rows: rows.slice((page - 1) * limit, page * limit).map(summarizeRow),
    }, 'Import batch retrieved');
  })
);

/**
 * @route GET /api/surveys/import/batches/:id/status
 * @desc  Commit progress only (cheap to poll): { status, progress, total_rows, result }
 * @access Admin, Agent
 */
router.get(
  '/import/batches/:id/status',
  authenticate,
  authorize('admin', 'agent'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = await prisma.surveyImportBatch.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, progress: true, total_rows: true, result: true, committed_at: true, created_by: true },
    });
    if (!b || (req.user!.role === 'agent' && b.created_by !== req.user!.id)) return sendNotFound(res, 'Import batch not found');
    const result = b.result ? { ...(b.result as any), new_accounts: undefined } : null;
    return sendSuccess(res, { ...b, result, running: isCommitRunning(b.id) }, 'Import status');
  })
);

// ── Import: commit ───────────────────────────────────────────────────────────

/**
 * @route POST /api/surveys/import/batches/:id/commit
 * @desc  Import every valid row: link or create the farmer account (activated
 *        later by the farmer with an SMS code), create/update FarmerProfile and
 *        Farm (GPS point, UPI), and — for field surveys — store the survey record.
 *        Small files finish in the request (200 + result). Bigger ones run in
 *        the background (202): poll GET /import/batches/:id for `progress`.
 *        An interrupted ('failed' part-way) batch can be committed again to resume.
 *        Body: { create_accounts?: boolean = true, update_profiles?: boolean = true }
 * @access Admin
 */
router.post(
  '/import/batches/:id/commit',
  authenticate,
  authorize('admin'),
  validateIdParam,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const options = { create_accounts: req.body?.create_accounts !== false, update_profiles: req.body?.update_profiles !== false };

    // Claim the batch atomically so a double-click can't import twice.
    const claimed = await prisma.surveyImportBatch.updateMany({
      where: { id: req.params.id, status: 'previewed' },
      data: { status: 'committing', committed_at: new Date(), result: emptyResult(options) as unknown as Prisma.InputJsonValue },
    });
    if (claimed.count === 0) {
      const exists = await prisma.surveyImportBatch.findUnique({ where: { id: req.params.id }, select: { status: true, progress: true, total_rows: true } });
      if (!exists) return sendNotFound(res, 'Import batch not found');
      // Resume a batch that stopped part-way.
      const resumable = exists.status === 'failed' && exists.progress < exists.total_rows;
      const resumed = resumable && (await prisma.surveyImportBatch.updateMany({ where: { id: req.params.id, status: 'failed' }, data: { status: 'committing' } })).count > 0;
      if (!resumed) {
        if (exists.status === 'committing') return sendError(res, `This batch is already being imported (${exists.progress}/${exists.total_rows} rows)`, 409);
        return sendError(res, `This batch was already ${exists.status}`, 409);
      }
    }

    const batch = (await prisma.surveyImportBatch.findUnique({ where: { id: req.params.id }, select: { id: true, total_rows: true, progress: true } }))!;
    if (batch.total_rows - batch.progress <= SYNC_COMMIT_MAX_ROWS) {
      const result = await commitBatch(batch.id);
      if (!result) return sendError(res, 'This batch is already being imported', 409);
      return sendSuccess(res, result, `Imported ${result.created_farmers} new and ${result.linked_farmers} existing farmers`);
    }
    commitBatch(batch.id).catch(async (error) => {
      await prisma.surveyImportBatch.update({ where: { id: batch.id }, data: { status: 'failed' } }).catch(() => undefined);
      logger.error(`Background import ${batch.id} failed: ${error?.message}`);
    });
    return res.status(202).json({
      success: true,
      message: `Importing ${batch.total_rows} rows in the background — this page shows the progress`,
      data: { batch_id: batch.id, status: 'committing', progress: batch.progress, total_rows: batch.total_rows },
    });
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

/** Filters from the query, limited to the caller's territory for VBAs. */
async function scopedSurveyWhere(req: AuthenticatedRequest, q: Record<string, string>): Promise<Prisma.FarmSurveyWhereInput> {
  const scope = await surveyScope(req);
  const where = surveyWhere(q);
  return scope ? { AND: [where, scope] } : where;
}

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
    const where = await scopedSurveyWhere(req, q);
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
    const where = await scopedSurveyWhere(req, req.query as Record<string, string>);
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
    const rows = await prisma.farmSurvey.findMany({ where: await scopedSurveyWhere(req, req.query as Record<string, string>), orderBy: [{ district: 'asc' }, { owner_name: 'asc' }], take: 20000 });
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
    const scope = await surveyScope(req);
    const survey = await prisma.farmSurvey.findFirst({
      where: scope ? { AND: [{ id: req.params.id }, scope] } : { id: req.params.id },
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
