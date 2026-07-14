-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('profile_card', 'contract', 'ipm_form', 'notarized_upload', 'other');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('generated', 'pending_notarization', 'notarized', 'rejected');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'generated',
    "service_request_id" TEXT,
    "file_url" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploaded_by" TEXT,
    "rejection_reason" TEXT,
    "signature_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signature" (
    "id" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "signer_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "image_key" TEXT NOT NULL,
    "ip_address" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_signature_id_key" ON "Document"("signature_id");

-- CreateIndex
CREATE INDEX "Document_owner_id_type_idx" ON "Document"("owner_id", "type");

-- CreateIndex
CREATE INDEX "Document_service_request_id_idx" ON "Document"("service_request_id");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Signature_reference_id_key" ON "Signature"("reference_id");

-- CreateIndex
CREATE INDEX "Signature_signer_id_idx" ON "Signature"("signer_id");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_signature_id_fkey" FOREIGN KEY ("signature_id") REFERENCES "Signature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_signer_id_fkey" FOREIGN KEY ("signer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
