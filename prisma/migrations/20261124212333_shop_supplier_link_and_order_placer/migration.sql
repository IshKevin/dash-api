-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "placed_by" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "shop_id" TEXT;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "is_shop_supplier" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "PurchaseOrder_shop_id_idx" ON "PurchaseOrder"("shop_id");

-- CreateIndex
CREATE INDEX "Supplier_is_shop_supplier_idx" ON "Supplier"("is_shop_supplier");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_placed_by_fkey" FOREIGN KEY ("placed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Backfill: every Shop gets a linked "shop supplier" row with the SAME id ───
-- Shop-scoped products use Product.supplier_id = Shop.id, which must satisfy the
-- Product -> Supplier FK. Flag any pre-existing row that already shares a shop id.
UPDATE "Supplier" SET "is_shop_supplier" = true
WHERE "id" IN (SELECT "id" FROM "Shop");

INSERT INTO "Supplier" (
  "id", "name", "category", "contact_person", "email", "phone", "address",
  "status", "rating", "total_orders", "products_supplied", "services_offered",
  "delivery_areas", "notes", "is_shop_supplier", "created_at", "updated_at"
)
SELECT
  s."id", s."shopName", 'input_distributor'::"SupplierCategory", s."ownerName",
  lower(s."ownerEmail"), s."ownerPhone",
  jsonb_build_object('province', s."province", 'city', s."district", 'country', 'Rwanda'),
  'active'::"SupplierStatus", 0, 0, ARRAY[]::TEXT[], ARRAY[]::TEXT[],
  ARRAY[s."district"]::TEXT[], 'Supplier record backing shop #' || s."shop_number",
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Shop" s
WHERE NOT EXISTS (SELECT 1 FROM "Supplier" x WHERE x."id" = s."id");

-- ─── Backfill: attribute existing purchase orders to the creator's shop ───
UPDATE "PurchaseOrder" po SET "shop_id" = s."id"
FROM "Shop" s
WHERE po."shop_id" IS NULL AND po."created_by" IS NOT NULL AND s."manager_id" = po."created_by";
