-- AlterEnum
ALTER TYPE "SurveyImportStatus" ADD VALUE 'committing' BEFORE 'committed';

-- AlterTable
ALTER TABLE "SurveyImportBatch" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'survey',
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sheets" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activation_invited_at" TIMESTAMP(3);

-- Phone numbers identify farmers at activation and login.
CREATE INDEX "User_phone_idx" ON "User"("phone");

-- Phones were stored as typed (0788 123 456, 788123456 …) while activation and
-- login look them up as +2507XXXXXXXX. Normalise every Rwandan mobile number.
UPDATE "User"
   SET "phone" = '+250' || RIGHT(REGEXP_REPLACE("phone", '\D', '', 'g'), 9)
 WHERE "phone" IS NOT NULL
   AND REGEXP_REPLACE("phone", '\D', '', 'g') ~ '^(0{0,2}2507|07|7)[0-9]{8}$'
   AND "phone" !~ '^\+2507[0-9]{8}$';
