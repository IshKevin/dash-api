-- CreateEnum
CREATE TYPE "FarmerVerificationStatus" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "DiseaseSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "DiseaseCaseStatus" AS ENUM ('active', 'treated', 'resolved', 'monitoring');

-- CreateEnum
CREATE TYPE "OutbreakStatus" AS ENUM ('active', 'contained', 'resolved', 'monitoring');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('draft', 'submitted', 'approved', 'ordered', 'partially_received', 'fully_received', 'cancelled');

-- CreateEnum
CREATE TYPE "TrainingContentType" AS ENUM ('article', 'video', 'guide', 'checklist', 'faq');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- AlterTable
ALTER TABLE "Farm" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "FarmerProfile" ADD COLUMN     "verification_status" "FarmerVerificationStatus" NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "Province" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Province_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "province_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "District_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cell" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Village" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cell_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Village_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreeRecord" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "record_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_trees" INTEGER NOT NULL DEFAULT 0,
    "age_0_2" INTEGER NOT NULL DEFAULT 0,
    "age_3_5" INTEGER NOT NULL DEFAULT 0,
    "age_6_10" INTEGER NOT NULL DEFAULT 0,
    "age_above_10" INTEGER NOT NULL DEFAULT 0,
    "healthy_count" INTEGER NOT NULL DEFAULT 0,
    "diseased_count" INTEGER NOT NULL DEFAULT 0,
    "dead_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "recorded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreeDisease" (
    "id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "disease_name" TEXT NOT NULL,
    "affected_count" INTEGER NOT NULL DEFAULT 0,
    "severity" "DiseaseSeverity" NOT NULL DEFAULT 'low',
    "detected_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "treated" BOOLEAN NOT NULL DEFAULT false,
    "treatment_notes" TEXT,
    "notes" TEXT,
    "reported_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreeDisease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiseaseRegistry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "symptoms" TEXT,
    "prevention" TEXT,
    "treatment" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiseaseRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiseaseCase" (
    "id" TEXT NOT NULL,
    "case_number" TEXT NOT NULL,
    "disease_name" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "severity" "DiseaseSeverity" NOT NULL DEFAULT 'low',
    "status" "DiseaseCaseStatus" NOT NULL DEFAULT 'active',
    "affected_trees" INTEGER NOT NULL DEFAULT 0,
    "detected_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_date" TIMESTAMP(3),
    "symptoms" TEXT,
    "treatment" TEXT,
    "notes" TEXT,
    "outbreak_id" TEXT,
    "reported_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiseaseCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiseaseOutbreak" (
    "id" TEXT NOT NULL,
    "outbreak_number" TEXT NOT NULL,
    "disease_name" TEXT NOT NULL,
    "severity" "DiseaseSeverity" NOT NULL DEFAULT 'medium',
    "status" "OutbreakStatus" NOT NULL DEFAULT 'active',
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),
    "province" TEXT,
    "district" TEXT,
    "affected_farms" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "response_plan" TEXT,
    "reported_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiseaseOutbreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HarvestForecast" (
    "id" TEXT NOT NULL,
    "forecast_number" TEXT NOT NULL,
    "farm_id" TEXT,
    "province" TEXT,
    "district" TEXT,
    "forecast_year" INTEGER NOT NULL,
    "forecast_season" TEXT,
    "predicted_kg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence_pct" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "actual_kg" DOUBLE PRECISION,
    "variance_pct" DOUBLE PRECISION,
    "basis" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HarvestForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'draft',
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_date" TIMESTAMP(3),
    "received_date" TIMESTAMP(3),
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by" TEXT,
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_id" TEXT,
    "quantity_ordered" DOUBLE PRECISION NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "total_price" DOUBLE PRECISION NOT NULL,
    "quantity_received" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "received_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptItem" (
    "id" TEXT NOT NULL,
    "goods_receipt_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_id" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingContent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "content_type" "TrainingContentType" NOT NULL DEFAULT 'article',
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "author_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAccess" (
    "id" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,
    "user_id" TEXT,
    "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "data_type" TEXT NOT NULL DEFAULT 'string',
    "is_editable" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cart_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmVisit" (
    "id" TEXT NOT NULL,
    "visit_number" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'scheduled',
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "purpose" TEXT,
    "findings" TEXT,
    "recommendations" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FarmVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QRActivity" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "scanned_by" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QRActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierEvaluation" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "evaluator_id" TEXT NOT NULL,
    "overall_score" DOUBLE PRECISION NOT NULL,
    "quality_score" DOUBLE PRECISION,
    "delivery_score" DOUBLE PRECISION,
    "price_score" DOUBLE PRECISION,
    "service_score" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Province_name_key" ON "Province"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Province_code_key" ON "Province"("code");

-- CreateIndex
CREATE UNIQUE INDEX "District_name_province_id_key" ON "District"("name", "province_id");

-- CreateIndex
CREATE UNIQUE INDEX "Sector_name_district_id_key" ON "Sector"("name", "district_id");

-- CreateIndex
CREATE UNIQUE INDEX "Cell_name_sector_id_key" ON "Cell"("name", "sector_id");

-- CreateIndex
CREATE UNIQUE INDEX "Village_name_cell_id_key" ON "Village"("name", "cell_id");

-- CreateIndex
CREATE INDEX "TreeRecord_farm_id_idx" ON "TreeRecord"("farm_id");

-- CreateIndex
CREATE INDEX "TreeDisease_farm_id_idx" ON "TreeDisease"("farm_id");

-- CreateIndex
CREATE UNIQUE INDEX "DiseaseRegistry_name_key" ON "DiseaseRegistry"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DiseaseCase_case_number_key" ON "DiseaseCase"("case_number");

-- CreateIndex
CREATE INDEX "DiseaseCase_farm_id_idx" ON "DiseaseCase"("farm_id");

-- CreateIndex
CREATE INDEX "DiseaseCase_status_idx" ON "DiseaseCase"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DiseaseOutbreak_outbreak_number_key" ON "DiseaseOutbreak"("outbreak_number");

-- CreateIndex
CREATE INDEX "DiseaseOutbreak_status_idx" ON "DiseaseOutbreak"("status");

-- CreateIndex
CREATE UNIQUE INDEX "HarvestForecast_forecast_number_key" ON "HarvestForecast"("forecast_number");

-- CreateIndex
CREATE INDEX "HarvestForecast_farm_id_idx" ON "HarvestForecast"("farm_id");

-- CreateIndex
CREATE INDEX "HarvestForecast_forecast_year_idx" ON "HarvestForecast"("forecast_year");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_po_number_key" ON "PurchaseOrder"("po_number");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplier_id_idx" ON "PurchaseOrder"("supplier_id");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchase_order_id_idx" ON "PurchaseOrderItem"("purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_receipt_number_key" ON "GoodsReceipt"("receipt_number");

-- CreateIndex
CREATE INDEX "GoodsReceipt_purchase_order_id_idx" ON "GoodsReceipt"("purchase_order_id");

-- CreateIndex
CREATE INDEX "GoodsReceiptItem_goods_receipt_id_idx" ON "GoodsReceiptItem"("goods_receipt_id");

-- CreateIndex
CREATE INDEX "TrainingContent_status_idx" ON "TrainingContent"("status");

-- CreateIndex
CREATE INDEX "TrainingContent_content_type_idx" ON "TrainingContent"("content_type");

-- CreateIndex
CREATE INDEX "ContentAccess_content_id_idx" ON "ContentAccess"("content_id");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE INDEX "SystemSetting_category_idx" ON "SystemSetting"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_user_id_key" ON "Cart"("user_id");

-- CreateIndex
CREATE INDEX "CartItem_cart_id_idx" ON "CartItem"("cart_id");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cart_id_product_id_key" ON "CartItem"("cart_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "FarmVisit_visit_number_key" ON "FarmVisit"("visit_number");

-- CreateIndex
CREATE INDEX "FarmVisit_farm_id_idx" ON "FarmVisit"("farm_id");

-- CreateIndex
CREATE INDEX "FarmVisit_agent_id_idx" ON "FarmVisit"("agent_id");

-- CreateIndex
CREATE INDEX "QRActivity_user_id_idx" ON "QRActivity"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_user_id_idx" ON "PasswordResetToken"("user_id");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_is_used_idx" ON "PasswordResetToken"("token", "is_used");

-- CreateIndex
CREATE INDEX "SupplierEvaluation_supplier_id_idx" ON "SupplierEvaluation"("supplier_id");

-- AddForeignKey
ALTER TABLE "District" ADD CONSTRAINT "District_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "Province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sector" ADD CONSTRAINT "Sector_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cell" ADD CONSTRAINT "Cell_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Village" ADD CONSTRAINT "Village_cell_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "Cell"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreeRecord" ADD CONSTRAINT "TreeRecord_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreeRecord" ADD CONSTRAINT "TreeRecord_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreeDisease" ADD CONSTRAINT "TreeDisease_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreeDisease" ADD CONSTRAINT "TreeDisease_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiseaseCase" ADD CONSTRAINT "DiseaseCase_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiseaseCase" ADD CONSTRAINT "DiseaseCase_outbreak_id_fkey" FOREIGN KEY ("outbreak_id") REFERENCES "DiseaseOutbreak"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiseaseCase" ADD CONSTRAINT "DiseaseCase_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiseaseOutbreak" ADD CONSTRAINT "DiseaseOutbreak_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvestForecast" ADD CONSTRAINT "HarvestForecast_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HarvestForecast" ADD CONSTRAINT "HarvestForecast_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingContent" ADD CONSTRAINT "TrainingContent_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAccess" ADD CONSTRAINT "ContentAccess_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "TrainingContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAccess" ADD CONSTRAINT "ContentAccess_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmVisit" ADD CONSTRAINT "FarmVisit_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmVisit" ADD CONSTRAINT "FarmVisit_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRActivity" ADD CONSTRAINT "QRActivity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierEvaluation" ADD CONSTRAINT "SupplierEvaluation_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierEvaluation" ADD CONSTRAINT "SupplierEvaluation_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
