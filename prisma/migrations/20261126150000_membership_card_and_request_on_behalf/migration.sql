-- AlterTable
ALTER TABLE "FarmerProfile" ADD COLUMN     "member_no" SERIAL NOT NULL,
ADD COLUMN     "membership_valid_from" TIMESTAMP(3),
ADD COLUMN     "membership_valid_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "farm_id" TEXT,
ADD COLUMN     "requested_by" TEXT;

-- CreateIndex
CREATE INDEX "ServiceRequest_requested_by_idx" ON "ServiceRequest"("requested_by");

-- CreateIndex
CREATE INDEX "ServiceRequest_farm_id_idx" ON "ServiceRequest"("farm_id");

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: member numbers in order of registration (oldest member = 1)…
UPDATE "FarmerProfile" fp
   SET "member_no" = r.n
  FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS n FROM "FarmerProfile") r
 WHERE fp."id" = r."id";
SELECT setval(pg_get_serial_sequence('"FarmerProfile"', 'member_no'), GREATEST((SELECT COALESCE(MAX("member_no"), 0) FROM "FarmerProfile"), 1), (SELECT COUNT(*) > 0 FROM "FarmerProfile"));

-- …and existing members get a card valid for one year from today, so nobody
-- shows as expired just because the card feature was introduced.
UPDATE "FarmerProfile"
   SET "membership_valid_from" = CURRENT_TIMESTAMP,
       "membership_valid_until" = CURRENT_TIMESTAMP + INTERVAL '1 year'
 WHERE "membership_valid_from" IS NULL;

-- Unique only after renumbering (updating row by row would collide).
CREATE UNIQUE INDEX "FarmerProfile_member_no_key" ON "FarmerProfile"("member_no");
