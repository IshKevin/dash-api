import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from '../types/auth';
import { sendError } from './responses';

type Db = Prisma.TransactionClient | typeof prisma;

// Resolves the shop a shop_manager manages, for scoping queries/writes to
// their own shop. Returns null for any other role (or if unassigned).
//
// Shop ↔ Product link: every Shop has a "shop supplier" row (Supplier.id ===
// Shop.id, is_shop_supplier = true), so a shop's products are the Products
// whose supplier_id equals the shop's id. See ensureShopSupplier().
export async function getManagedShopId(req: AuthenticatedRequest): Promise<string | null> {
  if (req.user?.role !== 'shop_manager') return null;
  const shop = await prisma.shop.findUnique({ where: { manager_id: req.user.id }, select: { id: true } });
  return shop?.id ?? null;
}

/**
 * For shop managers: resolves their shop id, or sends 403 and returns undefined
 * when no shop is assigned. For other roles returns null (= unrestricted).
 */
export async function requireManagedShop(req: AuthenticatedRequest, res: Response): Promise<string | null | undefined> {
  if (req.user?.role !== 'shop_manager') return null;
  const shopId = await getManagedShopId(req);
  if (!shopId) {
    sendError(res, 'No shop is assigned to your account', 403);
    return undefined;
  }
  return shopId;
}

interface ShopLike {
  id: string;
  shop_number?: number;
  shopName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  province: string;
  district: string;
}

export function shopSupplierData(shop: ShopLike) {
  return {
    name: shop.shopName,
    category: 'input_distributor' as const,
    contact_person: shop.ownerName,
    email: shop.ownerEmail.toLowerCase(),
    phone: shop.ownerPhone,
    address: { province: shop.province, city: shop.district, country: 'Rwanda' },
    status: 'active' as const,
    delivery_areas: [shop.district].filter(Boolean),
    is_shop_supplier: true,
  };
}

/** Creates (or refreshes) the Supplier row that backs a shop — same id as the shop. */
export async function ensureShopSupplier(db: Db, shop: ShopLike) {
  const data = shopSupplierData(shop);
  return db.supplier.upsert({
    where: { id: shop.id },
    create: {
      id: shop.id,
      ...data,
      products_supplied: [],
      services_offered: [],
      notes: shop.shop_number !== undefined ? `Supplier record backing shop #${shop.shop_number}` : 'Supplier record backing a shop',
    },
    update: {
      name: data.name,
      contact_person: data.contact_person,
      email: data.email,
      phone: data.phone,
      address: data.address,
      is_shop_supplier: true,
    },
  });
}
