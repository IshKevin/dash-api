/**
 * Activating imported farmers and completing their profiles.
 *
 * Farmers bulk-imported from the ASR spreadsheets have an account but no login
 * yet (credentials_claimed = false). Staff send them an invitation SMS; the
 * farmer opens /activate, receives a one-time code on their phone and sets a
 * password (see auth.ts /verify-phone). Once signed in, the farmer sees which
 * profile details are still missing (GET /me) and fills them in.
 */
import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError, sendPaginatedResponse } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { farmerScope, canServeFarmer, OUTSIDE_TERRITORY } from '../utils/agentScope';
import { toRwandaPhone } from '../utils/phone';
import { canonicalDistrict } from '../services/rwandaGeo';
import { smsService } from '../services/smsService';
import logger from '../config/logger';

const router = Router();

const PLACEHOLDER_EMAIL = /@(survey-import|farmer-import)\.local$/;
const hasRealEmail = (email: string) => !PLACEHOLDER_EMAIL.test(email);

/** Farmers the caller may see, narrowed by the list filters. */
async function farmerWhere(req: AuthenticatedRequest, q: Record<string, string | undefined>): Promise<Prisma.UserWhereInput> {
  const and: Prisma.UserWhereInput[] = [{ role: 'farmer' }];
  const scope = await farmerScope(req);
  if (scope) and.push(scope);
  if (q.status === 'pending') and.push({ credentials_claimed: false });
  if (q.status === 'activated') and.push({ credentials_claimed: true });
  if (q.invited === 'true') and.push({ activation_invited_at: { not: null } });
  if (q.invited === 'false') and.push({ activation_invited_at: null });
  if (q.has_phone === 'true') and.push({ phone: { startsWith: '+2507' } });
  if (q.has_phone === 'false') and.push({ OR: [{ phone: null }, { NOT: { phone: { startsWith: '+2507' } } }] });
  if (q.batch_id) and.push({ profile: { path: ['batch_id'], equals: q.batch_id } });
  if (q.district) {
    and.push({ OR: [{ farmer_profile: { farm_district: q.district } }, { farmer_profile: { district: q.district } }] });
  }
  if (q.search) {
    const s = q.search.trim();
    and.push({ OR: [{ full_name: { contains: s, mode: 'insensitive' } }, { phone: { contains: s.replace(/\s/g, '') } }, { farmer_profile: { id_number: { contains: s } } }] });
  }
  return { AND: and };
}

/**
 * @route GET /api/activation/farmers
 * @desc  Farmers with their activation state.
 *        Filters: status=pending|activated, invited=true|false, has_phone=true|false,
 *        batch_id (import batch), district, search; page, limit
 * @access Admin, Agent (own territory)
 */
router.get(
  '/farmers',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = req.query as Record<string, string>;
    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25));
    const where = await farmerWhere(req, q);
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ credentials_claimed: 'asc' }, { full_name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, full_name: true, phone: true, email: true, status: true, credentials_claimed: true, activation_invited_at: true, created_at: true, profile: true,
          farmer_profile: { select: { id_number: true, farm_district: true, farm_sector: true, district: true, member_no: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    const rows = items.map((u) => ({
      id: u.id,
      full_name: u.full_name,
      phone: u.phone,
      email: hasRealEmail(u.email) ? u.email : null,
      status: u.status,
      activated: u.credentials_claimed,
      invited_at: u.activation_invited_at,
      can_activate: !u.credentials_claimed && Boolean(u.phone?.startsWith('+2507')),
      national_id: u.farmer_profile?.id_number ?? null,
      district: u.farmer_profile?.farm_district || u.farmer_profile?.district || null,
      sector: u.farmer_profile?.farm_sector ?? null,
      member_no: u.farmer_profile?.member_no ?? null,
      source: (u.profile as any)?.source ?? 'registered',
      created_at: u.created_at,
    }));
    return sendPaginatedResponse(res, rows, total, page, limit, 'Farmers retrieved');
  })
);

/**
 * @route GET /api/activation/summary
 * @desc  Activation counters for the farmers the caller can see (same filters as /farmers, minus status)
 * @access Admin, Agent
 */
router.get(
  '/summary',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status: _s, invited: _i, has_phone: _h, ...rest } = req.query as Record<string, string>;
    const base = await farmerWhere(req, rest);
    const count = (extra: Prisma.UserWhereInput) => prisma.user.count({ where: { AND: [base, extra] } });
    const [total, activated, pendingWithPhone, pendingNoPhone, invited] = await Promise.all([
      count({}),
      count({ credentials_claimed: true }),
      count({ credentials_claimed: false, phone: { startsWith: '+2507' } }),
      count({ credentials_claimed: false, OR: [{ phone: null }, { NOT: { phone: { startsWith: '+2507' } } }] }),
      count({ credentials_claimed: false, activation_invited_at: { not: null } }),
    ]);
    return sendSuccess(res, {
      total,
      activated,
      pending: total - activated,
      pending_with_phone: pendingWithPhone,
      pending_without_phone: pendingNoPhone,
      invited_not_activated: invited,
      sms_configured: smsService.isConfigured(),
      invite_job: inviteJob ? { ...inviteJob } : null,
    }, 'Activation summary');
  })
);

// ── Staff fix missing details ────────────────────────────────────────────────

const farmerDetailSelect = {
  id: true, full_name: true, phone: true, email: true, credentials_claimed: true, activation_invited_at: true,
  farmer_profile: {
    select: {
      id_number: true, gender: true, age: true, province: true, district: true, sector: true, cell: true, village: true,
      farm_province: true, farm_district: true, farm_sector: true, farm_cell: true, farm_village: true,
    },
  },
} satisfies Prisma.UserSelect;

/**
 * @route GET /api/activation/farmers/:id
 * @desc  One farmer's account + profile fields that staff can complete
 * @access Admin, Agent (own territory)
 */
router.get(
  '/farmers/:id',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!(await canServeFarmer(req, req.params.id))) return sendError(res, OUTSIDE_TERRITORY, 403);
    const u = await prisma.user.findFirst({ where: { id: req.params.id, role: 'farmer' }, select: farmerDetailSelect });
    if (!u) return sendError(res, 'Farmer not found', 404);
    return sendSuccess(res, { ...u, email: hasRealEmail(u.email) ? u.email : null }, 'Farmer retrieved');
  })
);

/**
 * @route PATCH /api/activation/farmers/:id
 * @desc  Staff complete a farmer's missing details so they can activate:
 *        { full_name?, phone?, national_id?, gender?, age?, province?, district?, sector?, cell?, village?,
 *          farm_district?, farm_sector?, farm_cell?, farm_village? }
 *        A phone or national ID may belong to only one account. Not allowed
 *        once the farmer has activated (they edit their own profile then),
 *        except adding a missing value.
 * @access Admin, Agent (own territory)
 */
router.patch(
  '/farmers/:id',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!(await canServeFarmer(req, req.params.id))) return sendError(res, OUTSIDE_TERRITORY, 403);
    const user = await prisma.user.findFirst({ where: { id: req.params.id, role: 'farmer' }, select: farmerDetailSelect });
    if (!user) return sendError(res, 'Farmer not found', 404);
    const b = req.body || {};
    const userData: Prisma.UserUpdateInput = {};
    const profile: Record<string, any> = {};
    const current: Record<string, any> = { ...(user.farmer_profile ?? {}), phone: user.phone, full_name: user.full_name };
    // After activation the farmer owns their data: staff may only fill gaps.
    const locked = (field: string) => user.credentials_claimed && current[field] !== null && current[field] !== undefined && current[field] !== '';

    if (b.full_name !== undefined) {
      const name = String(b.full_name).replace(/\s+/g, ' ').trim();
      if (name.length < 2) return sendError(res, 'Enter the farmer\'s full name', 400);
      if (locked('full_name') && name !== user.full_name) return sendError(res, 'This farmer has activated their account — they change their name themselves', 409);
      userData.full_name = name;
    }
    if (b.phone !== undefined) {
      const phone = toRwandaPhone(b.phone);
      if (!phone) return sendError(res, 'Enter a Rwandan mobile number, e.g. 0788 123 456', 400);
      if (locked('phone') && phone !== user.phone) return sendError(res, 'This farmer has activated their account — they change their phone themselves', 409);
      const owner = await prisma.user.findFirst({ where: { phone, id: { not: user.id } }, select: { id: true } });
      if (owner) return sendError(res, 'This phone number already belongs to another account. Each farmer needs their own number to receive the activation code.', 409);
      userData.phone = phone;
    }
    if (b.national_id !== undefined && b.national_id !== null && b.national_id !== '') {
      const nid = String(b.national_id).replace(/\s/g, '');
      if (!/^\d{16}$/.test(nid)) return sendError(res, 'The national ID has 16 digits', 400);
      if (locked('id_number') && nid !== current.id_number) return sendError(res, 'This farmer has activated their account — the national ID can only be changed by an admin', 409);
      const owner = await prisma.farmerProfile.findFirst({ where: { id_number: nid, user_id: { not: user.id } }, select: { id: true } });
      if (owner) return sendError(res, 'This national ID is already registered to another farmer', 409);
      profile.id_number = nid;
    }
    if (b.gender !== undefined && b.gender !== '') {
      if (!['Male', 'Female', 'Other'].includes(b.gender)) return sendError(res, 'gender must be Male, Female or Other', 400);
      profile.gender = b.gender;
    }
    if (b.age !== undefined && b.age !== '' && b.age !== null) {
      const age = Number(b.age);
      if (!Number.isInteger(age) || age < 12 || age > 110) return sendError(res, 'age must be a whole number between 12 and 110', 400);
      profile.age = age;
    }
    for (const prefix of ['', 'farm_'] as const) {
      if (b[`${prefix}district`] !== undefined && b[`${prefix}district`] !== '') {
        const d = canonicalDistrict(b[`${prefix}district`]);
        if (!d) return sendError(res, `${prefix}district must be one of Rwanda's 30 districts`, 400);
        profile[`${prefix}district`] = d.name;
        profile[`${prefix}province`] = d.province;
      }
      for (const lvl of ['sector', 'cell', 'village']) {
        const v = b[`${prefix}${lvl}`];
        if (v !== undefined) profile[`${prefix}${lvl}`] = v === null || v === '' ? null : String(v).trim().slice(0, 100);
      }
    }
    for (const k of Object.keys(profile)) {
      if (k !== 'id_number' && locked(k) && profile[k] !== current[k]) delete profile[k]; // keep the farmer's own answers
    }
    if (!Object.keys(userData).length && !Object.keys(profile).length) return sendError(res, 'Nothing to update', 400);

    await prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length) await tx.user.update({ where: { id: user.id }, data: userData });
      if (Object.keys(profile).length) {
        await tx.farmerProfile.upsert({ where: { user_id: user.id }, update: profile, create: { user_id: user.id, ...profile } });
      }
    });
    logger.info(`Farmer ${user.id} details updated by ${req.user!.role} ${req.user!.id}: ${[...Object.keys(userData), ...Object.keys(profile)].join(', ')}`);
    const updated = await prisma.user.findUnique({ where: { id: user.id }, select: farmerDetailSelect });
    return sendSuccess(res, { ...updated!, email: hasRealEmail(updated!.email) ? updated!.email : null }, 'Farmer details saved');
  })
);

// ── Invitations ──────────────────────────────────────────────────────────────

interface InviteJob {
  started_at: string;
  started_by: string;
  total: number;
  sent: number;
  failed: number;
  done: boolean;
  last_error?: string;
}
let inviteJob: InviteJob | null = null;

const inviteMessage = (name: string, link: string) => {
  const first = name.split(' ').find((p) => p.length > 1) ?? '';
  return `Muraho ${first}! Avocado Society of Rwanda yakwandikishije muri sisiteme yayo. Fungura ${link}, wandike nimero ya telefone yawe uhabwe kode yo gukora konti. / You are registered with ASR: open ${link} to activate your account.`;
};

async function runInvites(users: { id: string; full_name: string; phone: string }[], job: InviteJob) {
  const link = `${(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '')}/activate`;
  const CONCURRENCY = 5;
  let next = 0;
  const worker = async () => {
    while (next < users.length) {
      const u = users[next++];
      const r = await smsService.send(u.phone, inviteMessage(u.full_name, link));
      if (r.sent) {
        job.sent++;
        await prisma.user.update({ where: { id: u.id }, data: { activation_invited_at: new Date() } }).catch(() => undefined);
      } else {
        job.failed++;
        job.last_error = r.error;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  job.done = true;
  logger.info(`Activation invites: ${job.sent} sent, ${job.failed} failed`);
}

/**
 * @route POST /api/activation/invites
 * @desc  SMS an activation invitation to farmers who have not activated yet.
 *        Body: { farmer_ids?: string[], batch_id?, district?, resend?: boolean = false, dry_run?: boolean }
 *        Without farmer_ids every matching not-yet-activated farmer (with a phone)
 *        is invited; already-invited farmers are skipped unless resend=true.
 *        dry_run returns how many would receive an SMS without sending.
 * @access Admin, Agent (own territory)
 */
router.post(
  '/invites',
  authenticate,
  authorize('admin', 'agent'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = req.body || {};
    if (inviteJob && !inviteJob.done) return sendError(res, `Invitations are still being sent (${inviteJob.sent + inviteJob.failed}/${inviteJob.total})`, 409);
    const and: Prisma.UserWhereInput[] = [await farmerWhere(req, { batch_id: b.batch_id, district: b.district }), { credentials_claimed: false, status: 'active', phone: { startsWith: '+2507' } }];
    if (Array.isArray(b.farmer_ids)) {
      if (b.farmer_ids.length === 0 || b.farmer_ids.length > 10000) return sendError(res, 'farmer_ids must list 1–10000 farmers', 400);
      and.push({ id: { in: b.farmer_ids.map(String) } });
    }
    if (b.resend !== true) and.push({ activation_invited_at: null });
    const users = await prisma.user.findMany({ where: { AND: and }, select: { id: true, full_name: true, phone: true }, orderBy: { created_at: 'asc' } });

    if (b.dry_run === true || users.length === 0) {
      return sendSuccess(res, { recipients: users.length, sms_configured: smsService.isConfigured(), sent: false }, users.length ? `${users.length} farmers would receive an invitation` : 'No farmers to invite');
    }
    if (!smsService.isConfigured()) {
      return sendError(res, 'SMS is not configured (AFRICASTALKING_USERNAME / AFRICASTALKING_API_KEY). Farmers can still activate themselves at /activate.', 503);
    }
    inviteJob = { started_at: new Date().toISOString(), started_by: req.user!.id, total: users.length, sent: 0, failed: 0, done: false };
    const job = inviteJob;
    runInvites(users as { id: string; full_name: string; phone: string }[], job).catch((e) => {
      job.done = true;
      job.last_error = e?.message;
    });
    return res.status(202).json({ success: true, message: `Sending ${users.length} invitations`, data: { recipients: users.length, job } });
  })
);

/**
 * @route GET /api/activation/invites/status
 * @access Admin, Agent
 */
router.get('/invites/status', authenticate, authorize('admin', 'agent'), (_req, res) => {
  sendSuccess(res, inviteJob, inviteJob ? 'Invitation job' : 'No invitations sent since the server started');
});

// ── Profile completeness (farmer) ────────────────────────────────────────────

type Item = { key: string; label: string; done: boolean; section: 'account' | 'personal' | 'farm' | 'land'; farm_id?: string };

export async function profileCompleteness(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true, phone: true,
      farmer_profile: true,
      farms: { where: { archived_at: null }, orderBy: { created_at: 'asc' } },
    },
  });
  if (!user) return null;
  const p = user.farmer_profile;
  const farm = user.farms[0];
  const loc = (farm?.location as any) || {};
  const filled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '';
  const items: Item[] = [
    { key: 'phone', label: 'Mobile phone number', done: Boolean(user.phone?.startsWith('+2507')), section: 'account' },
    { key: 'email', label: 'Email address (optional, for receipts and documents)', done: hasRealEmail(user.email), section: 'account' },
    { key: 'national_id', label: 'National ID number', done: /^\d{16}$/.test(p?.id_number ?? ''), section: 'personal' },
    { key: 'gender', label: 'Gender', done: filled(p?.gender), section: 'personal' },
    { key: 'age', label: 'Age', done: filled(p?.age), section: 'personal' },
    { key: 'home_location', label: 'Where you live (district, sector, cell, village)', done: [p?.district, p?.sector, p?.cell, p?.village].every(filled), section: 'personal' },
    { key: 'farm', label: 'Your avocado farm', done: Boolean(farm), section: 'farm' },
  ];
  if (farm) {
    items.push(
      { key: 'farm_location', label: 'Farm location (district, sector, cell, village)', done: [loc.district, loc.sector, loc.cell, loc.village].every(filled), section: 'farm', farm_id: farm.id },
      { key: 'farm_size', label: 'Farm size', done: farm.farm_size > 0, section: 'farm', farm_id: farm.id },
      { key: 'tree_count', label: 'Number of avocado trees', done: farm.tree_count > 0, section: 'farm', farm_id: farm.id },
      { key: 'varieties', label: 'Avocado varieties (Hass, Fuerte …)', done: farm.varieties.length > 0, section: 'farm', farm_id: farm.id },
      { key: 'upi', label: 'Land title number (UPI)', done: filled(farm.upi), section: 'land', farm_id: farm.id },
      { key: 'gps', label: 'Farm location on the map', done: farm.latitude !== null, section: 'land', farm_id: farm.id },
      { key: 'boundary', label: 'Farm boundary drawn on the map', done: Boolean(farm.parcel_boundary), section: 'land', farm_id: farm.id },
    );
  }
  // Email is optional: it is listed but does not count against completeness.
  const counted = items.filter((i) => i.key !== 'email');
  const done = counted.filter((i) => i.done).length;
  return {
    percent: Math.round((done / counted.length) * 100),
    complete: done === counted.length,
    missing: items.filter((i) => !i.done),
    items,
    farm_id: farm?.id ?? null,
  };
}

/**
 * @route GET /api/activation/me
 * @desc  The signed-in farmer's profile completeness: what is still missing.
 * @access Farmer
 */
router.get(
  '/me',
  authenticate,
  authorize('farmer'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await profileCompleteness(req.user!.id);
    if (!result) return sendError(res, 'User not found', 404);
    return sendSuccess(res, result, 'Profile completeness');
  })
);

export default router;
