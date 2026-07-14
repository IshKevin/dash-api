-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "due_date" TIMESTAMP(3),
ADD COLUMN     "escalated_at" TIMESTAMP(3),
ADD COLUMN     "is_escalated" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ServiceRequest_is_escalated_due_date_idx" ON "ServiceRequest"("is_escalated", "due_date");
