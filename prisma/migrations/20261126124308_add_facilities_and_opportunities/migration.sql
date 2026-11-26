-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('market', 'collection_center', 'cold_storage', 'packhouse', 'processing_plant', 'airport', 'nursery', 'demo_farm', 'input_supplier', 'sacco_bank', 'government_office', 'other');

-- CreateEnum
CREATE TYPE "OpportunityType" AS ENUM ('buyer_demand', 'export_contract', 'grant_funding', 'loan_credit', 'input_subsidy', 'training', 'certification', 'job', 'tender', 'other');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('open', 'closed');

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FacilityType" NOT NULL,
    "description" TEXT,
    "province" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "sector" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "opening_hours" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "OpportunityType" NOT NULL,
    "description" TEXT NOT NULL,
    "organization" TEXT,
    "province" TEXT,
    "district" TEXT,
    "quantity_kg" DOUBLE PRECISION,
    "price_per_kg" DOUBLE PRECISION,
    "min_grade" "ProduceGrade",
    "deadline" TIMESTAMP(3),
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "link" TEXT,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'open',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityInterest" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "message" TEXT,
    "quantity_kg" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Facility_type_active_idx" ON "Facility"("type", "active");

-- CreateIndex
CREATE INDEX "Facility_district_idx" ON "Facility"("district");

-- CreateIndex
CREATE INDEX "Opportunity_status_deadline_idx" ON "Opportunity"("status", "deadline");

-- CreateIndex
CREATE INDEX "Opportunity_district_idx" ON "Opportunity"("district");

-- CreateIndex
CREATE INDEX "OpportunityInterest_farmer_id_idx" ON "OpportunityInterest"("farmer_id");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityInterest_opportunity_id_farmer_id_key" ON "OpportunityInterest"("opportunity_id", "farmer_id");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityInterest" ADD CONSTRAINT "OpportunityInterest_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityInterest" ADD CONSTRAINT "OpportunityInterest_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
