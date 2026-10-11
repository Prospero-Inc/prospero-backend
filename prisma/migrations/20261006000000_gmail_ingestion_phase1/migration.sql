-- CreateEnum
CREATE TYPE "MovementSource" AS ENUM ('Manual', 'Gmail');

-- CreateEnum
CREATE TYPE "TransactionReviewStatus" AS ENUM ('Detected', 'PendingReview', 'Confirmed');

-- CreateEnum
CREATE TYPE "IncomeReviewStatus" AS ENUM ('Detected', 'PendingReview', 'Classified');

-- CreateEnum
CREATE TYPE "IncomeCategory" AS ENUM ('Payroll', 'Extra', 'Transfer', 'Reimbursement', 'Deposit', 'Other');

-- CreateEnum
CREATE TYPE "ProcessedEmailResult" AS ENUM ('Created', 'Ignored', 'Failed', 'NeedsReview');

-- CreateEnum
CREATE TYPE "GmailConnectionStatus" AS ENUM ('Connected', 'Disconnected', 'Expired', 'Revoked');

-- AlterTable
ALTER TABLE "transactions"
  ALTER COLUMN "category" DROP NOT NULL,
  ADD COLUMN     "source" "MovementSource" NOT NULL DEFAULT 'Manual',
  ADD COLUMN     "review_status" "TransactionReviewStatus" NOT NULL DEFAULT 'Confirmed',
  ADD COLUMN     "institution_id" INTEGER,
  ADD COLUMN     "gmail_message_id" TEXT;

-- AlterTable
ALTER TABLE "salaries"
  ADD COLUMN     "source" "MovementSource" NOT NULL DEFAULT 'Manual',
  ADD COLUMN     "status" "IncomeReviewStatus" NOT NULL DEFAULT 'Classified',
  ADD COLUMN     "income_category" "IncomeCategory",
  ADD COLUMN     "institution_id" INTEGER,
  ADD COLUMN     "gmail_message_id" TEXT;

-- CreateTable
CREATE TABLE "financial_institutions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_senders" (
    "id" SERIAL NOT NULL,
    "institution_id" INTEGER NOT NULL,
    "email_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_senders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmail_connections" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "encrypted_access_token" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "last_history_id" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "status" "GmailConnectionStatus" NOT NULL DEFAULT 'Connected',
    "auto_detect_enabled" BOOLEAN NOT NULL DEFAULT true,
    "notify_income_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmail_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_emails" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "gmail_message_id" TEXT NOT NULL,
    "sender_email" TEXT,
    "result" "ProcessedEmailResult" NOT NULL,
    "reason" TEXT,
    "parser_version" TEXT,
    "related_transaction_id" INTEGER,
    "related_salary_id" INTEGER,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_institutions_user_id_idx" ON "financial_institutions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "institution_senders_institution_id_email_address_key" ON "institution_senders"("institution_id", "email_address");

-- CreateIndex
CREATE UNIQUE INDEX "gmail_connections_user_id_key" ON "gmail_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "processed_emails_user_id_gmail_message_id_key" ON "processed_emails"("user_id", "gmail_message_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "financial_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salaries" ADD CONSTRAINT "salaries_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "financial_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_institutions" ADD CONSTRAINT "financial_institutions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_senders" ADD CONSTRAINT "institution_senders_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "financial_institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gmail_connections" ADD CONSTRAINT "gmail_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_emails" ADD CONSTRAINT "processed_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_emails" ADD CONSTRAINT "processed_emails_related_transaction_id_fkey" FOREIGN KEY ("related_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_emails" ADD CONSTRAINT "processed_emails_related_salary_id_fkey" FOREIGN KEY ("related_salary_id") REFERENCES "salaries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EnableRowLevelSecurity
-- Mirrors 20260929000000_enable_row_level_security: closes Supabase's
-- auto-generated PostgREST API to these new tables too. The app connects via
-- the BYPASSRLS pooler role, so this does not affect the NestJS/Prisma backend.
ALTER TABLE "financial_institutions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "institution_senders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gmail_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "processed_emails" ENABLE ROW LEVEL SECURITY;
