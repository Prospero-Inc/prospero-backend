-- Fase 3 of docs/plan-remediacion.md.
--
-- D3 "expand" step: integer-cents twins of every Float money column,
-- nullable for now. The app double-writes them from this release on
-- (PrismaService middleware); MoneyIntegrityScheduler backfills rows the
-- previous container writes during the deploy window. Reads switch to
-- cents in a later release, and the Float columns are dropped after that.

-- AlterTable
ALTER TABLE "fixed_expenses" ADD COLUMN     "amount_cents" INTEGER;

-- AlterTable
ALTER TABLE "processed_emails" ADD COLUMN     "parsed_amount_cents" INTEGER;

-- AlterTable
ALTER TABLE "salaries" ADD COLUMN     "amount_cents" INTEGER;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "amount_cents" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "2fa_last_used_step" INTEGER;

-- CreateTable
CREATE TABLE "scheduler_locks" (
    "name" TEXT NOT NULL,
    "locked_until" TIMESTAMP(3) NOT NULL,
    "locked_by" TEXT NOT NULL,

    CONSTRAINT "scheduler_locks_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "transaction_user_date_idx" ON "transactions"("user_id", "date");


-- Every new table must have RLS on (Supabase exposes `public` through
-- PostgREST; the app's role has BYPASSRLS). See CLAUDE.md.
ALTER TABLE "scheduler_locks" ENABLE ROW LEVEL SECURITY;

-- Backfill: same rounding as toCents() (half away from zero on the
-- decimal value, not on the binary float).
UPDATE "transactions" SET "amount_cents" = ROUND("amount"::numeric * 100)::integer WHERE "amount_cents" IS NULL;
UPDATE "salaries" SET "amount_cents" = ROUND("amount"::numeric * 100)::integer WHERE "amount_cents" IS NULL;
UPDATE "fixed_expenses" SET "amount_cents" = ROUND("amount"::numeric * 100)::integer WHERE "amount_cents" IS NULL;
UPDATE "processed_emails" SET "parsed_amount_cents" = ROUND("parsed_amount"::numeric * 100)::integer WHERE "parsed_amount" IS NOT NULL AND "parsed_amount_cents" IS NULL;
