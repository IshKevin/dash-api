-- CreateEnum
CREATE TYPE "MarketPriceType" AS ENUM ('farm_gate', 'wholesale', 'retail', 'export');

-- CreateEnum
CREATE TYPE "ProduceGrade" AS ENUM ('export', 'grade_a', 'grade_b', 'processing', 'reject');

-- CreateEnum
CREATE TYPE "HarvestLotStatus" AS ENUM ('recorded', 'verified', 'sold', 'delivered', 'rejected');

-- CreateTable
CREATE TABLE "MarketPrice" (
    "id" TEXT NOT NULL,
    "commodity" TEXT NOT NULL DEFAULT 'avocado',
    "variety" TEXT NOT NULL DEFAULT 'Hass',
    "grade" "ProduceGrade" NOT NULL DEFAULT 'grade_a',
    "price_type" "MarketPriceType" NOT NULL DEFAULT 'farm_gate',
    "price_per_kg" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "province" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "market_name" TEXT,
    "source" TEXT,
    "price_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "recorded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarvestLot" (
    "id" TEXT NOT NULL,
    "lot_code" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "variety" TEXT NOT NULL DEFAULT 'Hass',
    "harvest_date" TIMESTAMP(3) NOT NULL,
    "quantity_kg" DOUBLE PRECISION NOT NULL,
    "crates" INTEGER,
    "grade" "ProduceGrade" NOT NULL DEFAULT 'grade_a',
    "dry_matter_pct" DOUBLE PRECISION,
    "maturity_passed" BOOLEAN,
    "status" "HarvestLotStatus" NOT NULL DEFAULT 'recorded',
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "buyer_name" TEXT,
    "buyer_contact" TEXT,
    "price_per_kg" DOUBLE PRECISION,
    "total_value" DOUBLE PRECISION,
    "sold_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HarvestLot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketPrice_commodity_variety_price_type_price_date_idx" ON "MarketPrice"("commodity", "variety", "price_type", "price_date");

-- CreateIndex
CREATE INDEX "MarketPrice_district_price_date_idx" ON "MarketPrice"("district", "price_date");

-- CreateIndex
CREATE INDEX "MarketPrice_price_date_idx" ON "MarketPrice"("price_date");

-- CreateIndex
CREATE UNIQUE INDEX "HarvestLot_lot_code_key" ON "HarvestLot"("lot_code");

-- CreateIndex
CREATE INDEX "HarvestLot_farmer_id_status_idx" ON "HarvestLot"("farmer_id", "status");

-- CreateIndex
CREATE INDEX "HarvestLot_farm_id_idx" ON "HarvestLot"("farm_id");

-- CreateIndex
CREATE INDEX "HarvestLot_status_harvest_date_idx" ON "HarvestLot"("status", "harvest_date");

-- AddForeignKey
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvestLot" ADD CONSTRAINT "HarvestLot_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvestLot" ADD CONSTRAINT "HarvestLot_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvestLot" ADD CONSTRAINT "HarvestLot_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
