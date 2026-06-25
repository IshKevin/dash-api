-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'agent', 'farmer', 'shop_manager');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('seeds', 'fertilizers', 'tools', 'irrigation', 'harvesting', 'containers', 'pest-management', 'protection');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('available', 'out_of_stock', 'discontinued');

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('kg', 'g', 'lb', 'oz', 'ton', 'liter', 'ml', 'gallon', 'piece', 'dozen', 'box', 'bag', 'bottle', 'can', 'packet');

-- CreateEnum
CREATE TYPE "SupplierCategory" AS ENUM ('seeds_supplier', 'fertilizer_supplier', 'equipment_supplier', 'produce_buyer', 'input_distributor', 'logistics_provider', 'financial_services', 'other');

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('active', 'inactive', 'pending_approval', 'suspended');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'mobile_money', 'bank_transfer', 'credit_card', 'debit_card', 'check');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('payment', 'refund', 'adjustment', 'fee', 'commission');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'completed', 'failed', 'cancelled', 'processing');

-- CreateEnum
CREATE TYPE "FarmStatus" AS ENUM ('preparing', 'planted', 'growing', 'producing', 'harvesting', 'dormant');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('harvest', 'planting', 'maintenance', 'consultation', 'pest_control', 'other');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('pending', 'approved', 'rejected', 'assigned', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ServicePriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('info', 'success', 'warning', 'error', 'order', 'system');

-- CreateEnum
CREATE TYPE "RelatedEntityType" AS ENUM ('order', 'service_request', 'product', 'system');

-- CreateEnum
CREATE TYPE "StockHistoryReason" AS ENUM ('restock', 'sale', 'adjustment', 'damage', 'return', 'other');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('inspection', 'audit', 'assessment', 'survey', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ReportPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('Male', 'Female', 'Other');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('Single', 'Married', 'Divorced', 'Widowed');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('Primary', 'Secondary', 'University', 'None');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'farmer',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "profile" JSONB,
    "qr_code_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unit" "ProductUnit" NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'available',
    "harvest_date" TIMESTAMP(3),
    "expiry_date" TIMESTAMP(3),
    "sku" TEXT,
    "brand" TEXT,
    "images" TEXT[],
    "specifications" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SupplierCategory" NOT NULL,
    "contact_person" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "website" TEXT,
    "address" JSONB NOT NULL,
    "business_license" TEXT,
    "tax_id" TEXT,
    "bank_details" JSONB,
    "status" "SupplierStatus" NOT NULL DEFAULT 'pending_approval',
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "products_supplied" TEXT[],
    "services_offered" TEXT[],
    "delivery_areas" TEXT[],
    "payment_terms" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "shop_id" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'active',
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "total_spent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_order_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shipping_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "shipping_address" JSONB NOT NULL,
    "billing_address" JSONB,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_delivery_date" TIMESTAMP(3),
    "delivered_date" TIMESTAMP(3),
    "notes" TEXT,
    "tracking_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "total_price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "transaction_number" TEXT NOT NULL,
    "order_id" TEXT,
    "service_request_id" TEXT,
    "payer_id" TEXT NOT NULL,
    "payee_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
    "payment_method" "PaymentMethod" NOT NULL,
    "reference_number" TEXT,
    "description" TEXT,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "net_amount" DOUBLE PRECISION NOT NULL,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shop_number" SERIAL NOT NULL,
    "shopName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "ownerPhone" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Farm" (
    "id" TEXT NOT NULL,
    "farmName" TEXT NOT NULL,
    "farmerName" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "location" JSONB NOT NULL,
    "crop_type" TEXT NOT NULL DEFAULT 'avocado',
    "farm_size" DOUBLE PRECISION NOT NULL,
    "tree_count" INTEGER NOT NULL,
    "varieties" TEXT[],
    "planting_date" TIMESTAMP(3) NOT NULL,
    "expected_harvest" TIMESTAMP(3),
    "status" "FarmStatus" NOT NULL DEFAULT 'planted',
    "organic_certified" BOOLEAN NOT NULL DEFAULT false,
    "irrigation_system" TEXT,
    "soil_type" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Farm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "service_type" "ServiceType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "request_number" TEXT NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'pending',
    "priority" "ServicePriority" NOT NULL DEFAULT 'medium',
    "requested_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduled_date" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "rejected_by" TEXT,
    "completed_by" TEXT,
    "rejection_reason" TEXT,
    "location" JSONB NOT NULL,
    "cost_estimate" DOUBLE PRECISION,
    "final_cost" DOUBLE PRECISION,
    "notes" TEXT,
    "start_notes" TEXT,
    "completion_notes" TEXT,
    "harvest_details" JSONB,
    "pest_management_details" JSONB,
    "farmer_info" JSONB,
    "attachments" TEXT[],
    "feedback" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessKey" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_key" TEXT NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "related_entity_id" TEXT,
    "related_entity_type" "RelatedEntityType",
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Log" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockHistory" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "shop_id" TEXT,
    "previous_quantity" INTEGER NOT NULL,
    "new_quantity" INTEGER NOT NULL,
    "change_amount" INTEGER NOT NULL,
    "reason" "StockHistoryReason" NOT NULL,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "report_type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "priority" "ReportPriority" NOT NULL DEFAULT 'medium',
    "agent_id" TEXT NOT NULL,
    "farmer_id" TEXT,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "completed_date" TIMESTAMP(3),
    "location" JSONB NOT NULL,
    "attachments" TEXT[],
    "findings" TEXT,
    "recommendations" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "province" TEXT,
    "territory" JSONB,
    "district" TEXT,
    "sector" TEXT,
    "cell" TEXT,
    "village" TEXT,
    "specialization" TEXT,
    "experience" TEXT,
    "certification" TEXT,
    "statistics" JSONB,
    "farmersAssisted" INTEGER NOT NULL DEFAULT 0,
    "totalTransactions" INTEGER NOT NULL DEFAULT 0,
    "performance" TEXT,
    "profileImage" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmerProfile" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "age" INTEGER,
    "id_number" TEXT,
    "gender" "Gender",
    "marital_status" "MaritalStatus",
    "education_level" "EducationLevel",
    "province" TEXT,
    "district" TEXT,
    "sector" TEXT,
    "cell" TEXT,
    "village" TEXT,
    "farm_age" INTEGER,
    "planted" TEXT,
    "avocado_type" TEXT,
    "mixed_percentage" DOUBLE PRECISION,
    "farm_size" DOUBLE PRECISION,
    "tree_count" INTEGER NOT NULL DEFAULT 0,
    "upi_number" TEXT,
    "farm_province" TEXT,
    "farm_district" TEXT,
    "farm_sector" TEXT,
    "farm_cell" TEXT,
    "farm_village" TEXT,
    "assistance" TEXT[],
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FarmerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_qr_code_token_key" ON "User"("qr_code_token");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_created_at_idx" ON "User"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_category_status_idx" ON "Product"("category", "status");

-- CreateIndex
CREATE INDEX "Product_supplier_id_status_idx" ON "Product"("supplier_id", "status");

-- CreateIndex
CREATE INDEX "Product_quantity_status_idx" ON "Product"("quantity", "status");

-- CreateIndex
CREATE INDEX "Product_created_at_idx" ON "Product"("created_at");

-- CreateIndex
CREATE INDEX "Supplier_category_status_idx" ON "Supplier"("category", "status");

-- CreateIndex
CREATE INDEX "Supplier_rating_idx" ON "Supplier"("rating");

-- CreateIndex
CREATE INDEX "Supplier_created_at_idx" ON "Supplier"("created_at");

-- CreateIndex
CREATE INDEX "Customer_shop_id_status_idx" ON "Customer"("shop_id", "status");

-- CreateIndex
CREATE INDEX "Customer_total_spent_idx" ON "Customer"("total_spent");

-- CreateIndex
CREATE INDEX "Customer_created_at_idx" ON "Customer"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Order_order_number_key" ON "Order"("order_number");

-- CreateIndex
CREATE INDEX "Order_customer_id_status_idx" ON "Order"("customer_id", "status");

-- CreateIndex
CREATE INDEX "Order_status_payment_status_idx" ON "Order"("status", "payment_status");

-- CreateIndex
CREATE INDEX "Order_order_date_idx" ON "Order"("order_date");

-- CreateIndex
CREATE INDEX "Order_created_at_idx" ON "Order"("created_at");

-- CreateIndex
CREATE INDEX "OrderItem_order_id_idx" ON "OrderItem"("order_id");

-- CreateIndex
CREATE INDEX "OrderItem_product_id_idx" ON "OrderItem"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transaction_number_key" ON "Transaction"("transaction_number");

-- CreateIndex
CREATE INDEX "Transaction_payer_id_status_idx" ON "Transaction"("payer_id", "status");

-- CreateIndex
CREATE INDEX "Transaction_payee_id_status_idx" ON "Transaction"("payee_id", "status");

-- CreateIndex
CREATE INDEX "Transaction_type_status_idx" ON "Transaction"("type", "status");

-- CreateIndex
CREATE INDEX "Transaction_created_at_idx" ON "Transaction"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shop_number_key" ON "Shop"("shop_number");

-- CreateIndex
CREATE INDEX "Shop_created_by_idx" ON "Shop"("created_by");

-- CreateIndex
CREATE INDEX "Farm_farmer_id_status_idx" ON "Farm"("farmer_id", "status");

-- CreateIndex
CREATE INDEX "Farm_crop_type_status_idx" ON "Farm"("crop_type", "status");

-- CreateIndex
CREATE INDEX "Farm_organic_certified_idx" ON "Farm"("organic_certified");

-- CreateIndex
CREATE INDEX "Farm_expected_harvest_idx" ON "Farm"("expected_harvest");

-- CreateIndex
CREATE INDEX "Farm_created_at_idx" ON "Farm"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_request_number_key" ON "ServiceRequest"("request_number");

-- CreateIndex
CREATE INDEX "ServiceRequest_farmer_id_status_idx" ON "ServiceRequest"("farmer_id", "status");

-- CreateIndex
CREATE INDEX "ServiceRequest_agent_id_status_idx" ON "ServiceRequest"("agent_id", "status");

-- CreateIndex
CREATE INDEX "ServiceRequest_service_type_status_idx" ON "ServiceRequest"("service_type", "status");

-- CreateIndex
CREATE INDEX "ServiceRequest_created_at_idx" ON "ServiceRequest"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "AccessKey_access_key_key" ON "AccessKey"("access_key");

-- CreateIndex
CREATE INDEX "AccessKey_user_id_idx" ON "AccessKey"("user_id");

-- CreateIndex
CREATE INDEX "AccessKey_access_key_is_used_expires_at_idx" ON "AccessKey"("access_key", "is_used", "expires_at");

-- CreateIndex
CREATE INDEX "Notification_recipient_id_is_read_idx" ON "Notification"("recipient_id", "is_read");

-- CreateIndex
CREATE INDEX "Notification_created_at_idx" ON "Notification"("created_at");

-- CreateIndex
CREATE INDEX "Log_level_idx" ON "Log"("level");

-- CreateIndex
CREATE INDEX "Log_timestamp_idx" ON "Log"("timestamp");

-- CreateIndex
CREATE INDEX "StockHistory_product_id_idx" ON "StockHistory"("product_id");

-- CreateIndex
CREATE INDEX "StockHistory_created_at_idx" ON "StockHistory"("created_at");

-- CreateIndex
CREATE INDEX "Report_agent_id_status_idx" ON "Report"("agent_id", "status");

-- CreateIndex
CREATE INDEX "Report_farmer_id_status_idx" ON "Report"("farmer_id", "status");

-- CreateIndex
CREATE INDEX "Report_report_type_priority_idx" ON "Report"("report_type", "priority");

-- CreateIndex
CREATE INDEX "Report_scheduled_date_idx" ON "Report"("scheduled_date");

-- CreateIndex
CREATE INDEX "Report_created_at_idx" ON "Report"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_user_id_key" ON "AgentProfile"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_agentId_key" ON "AgentProfile"("agentId");

-- CreateIndex
CREATE INDEX "AgentProfile_agentId_idx" ON "AgentProfile"("agentId");

-- CreateIndex
CREATE INDEX "AgentProfile_province_idx" ON "AgentProfile"("province");

-- CreateIndex
CREATE UNIQUE INDEX "FarmerProfile_user_id_key" ON "FarmerProfile"("user_id");

-- CreateIndex
CREATE INDEX "FarmerProfile_province_idx" ON "FarmerProfile"("province");

-- CreateIndex
CREATE INDEX "FarmerProfile_district_idx" ON "FarmerProfile"("district");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Farm" ADD CONSTRAINT "Farm_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessKey" ADD CONSTRAINT "AccessKey_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmerProfile" ADD CONSTRAINT "FarmerProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
