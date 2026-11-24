-- CreateEnum
CREATE TYPE "SurveyImportStatus" AS ENUM ('previewed', 'committed', 'failed');

-- AlterTable
ALTER TABLE "Farm" ADD COLUMN     "land_source" TEXT,
ADD COLUMN     "land_tenure" TEXT,
ADD COLUMN     "land_use" TEXT,
ADD COLUMN     "land_verified_at" TIMESTAMP(3),
ADD COLUMN     "parcel_area_sqm" DOUBLE PRECISION,
ADD COLUMN     "parcel_boundary" JSONB,
ADD COLUMN     "upi" TEXT;

-- CreateTable
CREATE TABLE "SurveyImportBatch" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" "SurveyImportStatus" NOT NULL DEFAULT 'previewed',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "rows" JSONB NOT NULL,
    "result" JSONB,
    "created_by" TEXT NOT NULL,
    "committed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmSurvey" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT,
    "row_number" INTEGER,
    "farmer_id" TEXT,
    "farm_id" TEXT,
    "survey_province" TEXT,
    "survey_district" TEXT,
    "enumerator_name" TEXT,
    "enumerator_contact" TEXT,
    "interview_date" TIMESTAMP(3),
    "consent" BOOLEAN,
    "province" TEXT,
    "district" TEXT,
    "sector" TEXT,
    "cell" TEXT,
    "village" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "respondent_name" TEXT,
    "respondent_contact" TEXT,
    "respondent_is_owner" BOOLEAN,
    "respondent_role" TEXT,
    "respondent_position" TEXT,
    "owner_name" TEXT,
    "farmer_contact" TEXT,
    "sex" TEXT,
    "has_disability" BOOLEAN,
    "date_of_birth" TIMESTAMP(3),
    "farmer_age" INTEGER,
    "national_id" TEXT,
    "land_owner" TEXT,
    "farm_zoning" TEXT,
    "tree_arrangement" TEXT,
    "farm_area" DOUBLE PRECISION,
    "seedling_sources" TEXT[],
    "varieties" TEXT[],
    "physical_tree_count" INTEGER,
    "hass_trees" INTEGER,
    "fuerte_trees" INTEGER,
    "planting_date" TIMESTAMP(3),
    "ever_harvested" BOOLEAN,
    "avocados_per_tree" DOUBLE PRECISION,
    "fruits_per_tree_per_year" DOUBLE PRECISION,
    "total_tons" DOUBLE PRECISION,
    "price_per_avocado" DOUBLE PRECISION,
    "uses_fertilizer" BOOLEAN,
    "fertilizer_types" TEXT[],
    "uses_pesticides" BOOLEAN,
    "pesticide_types" TEXT[],
    "input_access" TEXT[],
    "selling_channels" TEXT[],
    "selling_site" TEXT,
    "main_market_outlet" TEXT,
    "production_info_access" TEXT[],
    "market_info_access" TEXT[],
    "uses_credit" BOOLEAN,
    "credit_access" TEXT[],
    "aggregation_effectiveness" TEXT,
    "challenges" TEXT,
    "raw" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FarmSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SurveyImportBatch_created_at_idx" ON "SurveyImportBatch"("created_at");

-- CreateIndex
CREATE INDEX "FarmSurvey_district_idx" ON "FarmSurvey"("district");

-- CreateIndex
CREATE INDEX "FarmSurvey_national_id_idx" ON "FarmSurvey"("national_id");

-- CreateIndex
CREATE INDEX "FarmSurvey_farmer_id_idx" ON "FarmSurvey"("farmer_id");

-- CreateIndex
CREATE INDEX "FarmSurvey_interview_date_idx" ON "FarmSurvey"("interview_date");

-- CreateIndex
CREATE INDEX "Farm_upi_idx" ON "Farm"("upi");

-- AddForeignKey
ALTER TABLE "SurveyImportBatch" ADD CONSTRAINT "SurveyImportBatch_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmSurvey" ADD CONSTRAINT "FarmSurvey_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "SurveyImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmSurvey" ADD CONSTRAINT "FarmSurvey_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmSurvey" ADD CONSTRAINT "FarmSurvey_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
