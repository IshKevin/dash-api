-- Agent (VBA) ID card: a short staff number, like FarmerProfile.member_no.
ALTER TABLE "AgentProfile" ADD COLUMN "staff_no" SERIAL NOT NULL;

-- Backfill in order of creation (first agent = 1).
UPDATE "AgentProfile" ap
   SET "staff_no" = r.n
  FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS n FROM "AgentProfile") r
 WHERE ap."id" = r."id";
SELECT setval(pg_get_serial_sequence('"AgentProfile"', 'staff_no'), GREATEST((SELECT COALESCE(MAX("staff_no"), 0) FROM "AgentProfile"), 1), (SELECT COUNT(*) > 0 FROM "AgentProfile"));

-- Unique only after renumbering (updating row by row would collide).
CREATE UNIQUE INDEX "AgentProfile_staff_no_key" ON "AgentProfile"("staff_no");
