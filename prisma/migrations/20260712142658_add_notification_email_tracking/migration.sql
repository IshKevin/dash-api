-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "email_error" TEXT,
ADD COLUMN     "email_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email_sent_at" TIMESTAMP(3);
