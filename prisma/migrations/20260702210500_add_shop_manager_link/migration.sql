-- AlterTable
ALTER TABLE "Shop" ADD COLUMN "manager_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Shop_manager_id_key" ON "Shop"("manager_id");

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
