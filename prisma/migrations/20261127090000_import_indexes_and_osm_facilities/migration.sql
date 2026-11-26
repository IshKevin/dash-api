-- Farmer import looks farmers up by national ID and checks its own survey rows;
-- without these indexes every row scanned the whole (growing) table.
CREATE INDEX "FarmerProfile_id_number_idx" ON "FarmerProfile"("id_number");
CREATE INDEX "FarmSurvey_batch_id_row_number_idx" ON "FarmSurvey"("batch_id", "row_number");

-- Facilities imported from OpenStreetMap
ALTER TABLE "Facility" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN "external_id" TEXT;
CREATE UNIQUE INDEX "Facility_external_id_key" ON "Facility"("external_id");
