-- CreateEnum
CREATE TYPE "PendingFarmerStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "can_sell" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PendingFarmer" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "PendingFarmerStatus" NOT NULL DEFAULT 'pending',
    "created_by" TEXT NOT NULL,
    "approved_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingFarmer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingFarmer_email_key" ON "PendingFarmer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PendingFarmer_approved_user_id_key" ON "PendingFarmer"("approved_user_id");

-- CreateIndex
CREATE INDEX "PendingFarmer_status_idx" ON "PendingFarmer"("status");

-- CreateIndex
CREATE INDEX "PendingFarmer_created_by_idx" ON "PendingFarmer"("created_by");

-- AddForeignKey
ALTER TABLE "PendingFarmer" ADD CONSTRAINT "PendingFarmer_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingFarmer" ADD CONSTRAINT "PendingFarmer_approved_user_id_fkey" FOREIGN KEY ("approved_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
