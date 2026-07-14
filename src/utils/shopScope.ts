import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from '../types/auth';

// Resolves the shop a shop_manager manages, for scoping queries/writes to
// their own shop. Returns null for any other role (or if unassigned).
export async function getManagedShopId(req: AuthenticatedRequest): Promise<string | null> {
  if (req.user?.role !== 'shop_manager') return null;
  const shop = await prisma.shop.findUnique({ where: { manager_id: req.user.id }, select: { id: true } });
  return shop?.id ?? null;
}
