-- AlterEnum
ALTER TYPE "ProductCategory" ADD VALUE 'produce';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceType" ADD VALUE 'harvesting_plan';
ALTER TYPE "ServiceType" ADD VALUE 'ipm_routine';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "address_details" JSONB,
ADD COLUMN     "company" TEXT,
ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "last_name" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "preferences" JSONB,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "type" TEXT DEFAULT 'individual';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "cost" DOUBLE PRECISION,
ADD COLUMN     "min_stock" INTEGER DEFAULT 10,
ADD COLUMN     "source_type" TEXT DEFAULT 'manual',
ADD COLUMN     "variety" TEXT;

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "harvesting_plan_details" JSONB,
ADD COLUMN     "ipm_routine_details" JSONB,
ADD COLUMN     "visit_details" JSONB;
