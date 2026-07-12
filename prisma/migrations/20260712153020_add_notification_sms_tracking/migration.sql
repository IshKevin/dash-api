-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "sms_error" TEXT,
ADD COLUMN     "sms_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sms_sent_at" TIMESTAMP(3);
