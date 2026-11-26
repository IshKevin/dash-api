import { Router, Response } from 'express';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { sendSuccess, sendError, sendNotFound } from '../utils/responses';
import { AuthenticatedRequest } from '../types/auth';
import { canAccessFarmer, OUTSIDE_TERRITORY } from '../utils/agentScope';
import { createNotification } from '../utils/notificationService';
import { generateQRToken } from '../utils/accessKey';

/**
 * Farmer membership card (Avocado Society of Rwanda).
 *
 * Each farmer has a member number (ASR-000123) and a card valid for one year.
 * The QR code on the card opens a public verification page
 * (<FRONTEND_URL>/verify/<token>) that shows only what is needed to check
 * the card is genuine — never the phone number or national ID.
 */
const router = Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_DAYS = 30;

export const memberCode = (n: number) => `ASR-${String(n).padStart(6, '0')}`;

const frontendBase = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
export const verifyUrl = (token: string) => `${frontendBase()}/verify/${token}`;

const addYear = (d: Date) => {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + 1);
  return x;
};

type MembershipStatus = 'active' | 'expiring' | 'expired' | 'suspended';

function statusOf(userStatus: string, until: Date | null): MembershipStatus {
  if (userStatus !== 'active') return 'suspended';
  if (!until || until.getTime() < Date.now()) return 'expired';
  if (until.getTime() - Date.now() < EXPIRING_DAYS * DAY_MS) return 'expiring';
  return 'active';
}

const userCardSelect = {
  id: true, full_name: true, role: true, status: true, qr_code_token: true, created_at: true,
  farmer_profile: {
    select: {
      id: true, member_no: true, membership_valid_from: true, membership_valid_until: true, verification_status: true,
      image: true, gender: true, district: true, sector: true, province: true, farm_district: true, farm_sector: true, farm_province: true,
      avocado_type: true, tree_count: true, farm_size: true, upi_number: true,
    },
  },
  farms: { where: { archived_at: null }, select: { tree_count: true, farm_size: true, varieties: true } },
} as const;

/**
 * Make sure the farmer has a card: a membership period (one year from today
 * if never issued) and a QR token. Returns the up-to-date user.
 */
async function ensureCard(userId: string) {
  let user = await prisma.user.findUnique({ where: { id: userId }, select: userCardSelect });
  if (!user || user.role !== 'farmer') return null;

  if (!user.farmer_profile) {
    await prisma.farmerProfile.create({ data: { user_id: userId } });
  }
  const fp = user.farmer_profile ?? (await prisma.farmerProfile.findUniqueOrThrow({ where: { user_id: userId } }));
  const writes: Promise<unknown>[] = [];
  if (!fp.membership_valid_from || !fp.membership_valid_until) {
    const from = new Date();
    writes.push(prisma.farmerProfile.update({ where: { user_id: userId }, data: { membership_valid_from: from, membership_valid_until: addYear(from) } }));
  }
  if (!user.qr_code_token) {
    writes.push(prisma.user.update({ where: { id: userId }, data: { qr_code_token: generateQRToken() } }));
  }
  if (writes.length) {
    await Promise.all(writes);
    user = await prisma.user.findUnique({ where: { id: userId }, select: userCardSelect });
  }
  return user!;
}

/** Card payload for the card page and print view. */
async function cardFor(user: NonNullable<Awaited<ReturnType<typeof ensureCard>>>) {
  const fp = user.farmer_profile!;
  const farms = user.farms;
  const trees = farms.length ? farms.reduce((s, f) => s + (f.tree_count || 0), 0) : fp.tree_count || 0;
  const hectares = farms.length ? farms.reduce((s, f) => s + (f.farm_size || 0), 0) : fp.farm_size || 0;
  const varieties = [...new Set([...farms.flatMap((f) => f.varieties || []), ...(fp.avocado_type ? [fp.avocado_type] : [])].filter(Boolean))];
  const url = verifyUrl(user.qr_code_token!);
  const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: 'Q', margin: 1, width: 360, color: { dark: '#0b3d2e', light: '#ffffff' } });
  return {
    user_id: user.id,
    member_no: fp.member_no,
    member_code: memberCode(fp.member_no),
    full_name: user.full_name,
    photo: fp.image,
    province: fp.farm_province || fp.province,
    district: fp.farm_district || fp.district,
    sector: fp.farm_sector || fp.sector,
    farms: farms.length,
    trees,
    hectares: Math.round(hectares * 100) / 100,
    varieties,
    land_title: fp.upi_number,
    profile_verified: fp.verification_status === 'verified',
    member_since: user.created_at,
    valid_from: fp.membership_valid_from,
    valid_until: fp.membership_valid_until,
    status: statusOf(user.status, fp.membership_valid_until),
    verify_url: url,
    qr_code: qr,
  };
}

/**
 * @route GET /api/membership/me
 * @desc  The farmer's own membership card (issued on first view if missing)
 * @access Farmer
 */
router.get('/me', authenticate, authorize('farmer'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await ensureCard(req.user!.id);
  if (!user) return sendNotFound(res, 'Farmer not found');
  return sendSuccess(res, await cardFor(user), 'Membership card retrieved');
}));

/**
 * @route GET /api/membership/:userId/card
 * @desc  A farmer's card, for printing by staff
 * @access Admin, Agent (farmers in their area)
 */
router.get('/:userId/card', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!(await canAccessFarmer(req, req.params.userId))) return sendError(res, OUTSIDE_TERRITORY, 403);
  const user = await ensureCard(req.params.userId);
  if (!user) return sendNotFound(res, 'Farmer not found');
  return sendSuccess(res, await cardFor(user), 'Membership card retrieved');
}));

/**
 * @route POST /api/membership/:userId/renew
 * @desc  Extend membership by one year (from today if already expired)
 * @access Admin, Agent (farmers in their area)
 */
router.post('/:userId/renew', authenticate, authorize('admin', 'agent'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!(await canAccessFarmer(req, req.params.userId))) return sendError(res, OUTSIDE_TERRITORY, 403);
  const user = await ensureCard(req.params.userId);
  if (!user) return sendNotFound(res, 'Farmer not found');
  const fp = user.farmer_profile!;
  const now = new Date();
  const expired = !fp.membership_valid_until || fp.membership_valid_until < now;
  const from = expired ? now : fp.membership_valid_from!;
  const until = addYear(expired ? now : fp.membership_valid_until!);
  await prisma.farmerProfile.update({ where: { user_id: user.id }, data: { membership_valid_from: from, membership_valid_until: until } });
  await createNotification(
    user.id, 'success', 'Membership renewed',
    `Your Avocado Society of Rwanda membership is now valid until ${until.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
    undefined, 'system'
  );
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: userCardSelect });
  return sendSuccess(res, await cardFor(updated), 'Membership renewed');
}));

/** Public, minimal view of a card — what a buyer or official needs to trust it. */
export async function publicCardByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return null;
  const user = await prisma.user.findUnique({ where: { qr_code_token: token }, select: userCardSelect });
  if (!user || user.role !== 'farmer' || !user.farmer_profile) return null;
  const fp = user.farmer_profile;
  const status = statusOf(user.status, fp.membership_valid_until);
  return {
    valid: status === 'active' || status === 'expiring',
    status,
    member_code: memberCode(fp.member_no),
    full_name: user.full_name,
    photo: fp.image,
    district: fp.farm_district || fp.district,
    sector: fp.farm_sector || fp.sector,
    profile_verified: fp.verification_status === 'verified',
    valid_until: fp.membership_valid_until,
    member_since: user.created_at,
    user_id: user.id,
  };
}

/**
 * @route GET /api/membership/verify/:token
 * @desc  Public card verification (the QR on the card points here via the web app)
 * @access Public
 */
router.get('/verify/:token', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const card = await publicCardByToken(req.params.token);
  if (!card) return sendNotFound(res, 'This card is not recognised. It may be fake or replaced by a new card.');
  await prisma.qRActivity.create({ data: { user_id: card.user_id, action: 'verified', ip_address: req.ip } }).catch(() => undefined);
  const { user_id: _id, ...publicCard } = card;
  return sendSuccess(res, publicCard, 'Card verified');
}));

export default router;
