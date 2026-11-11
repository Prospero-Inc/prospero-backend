-- iPhone Shortcuts "Transaction" automation (feat/wallet-shortcut).
-- Expand-only: a new enum value, a nullable column and three new tables, so
-- the previous image keeps working if the deploy rolls back.

-- AlterEnum
ALTER TYPE "MovementSource" ADD VALUE 'Shortcut';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "suggested_category" "BudgetCategory";

-- CreateTable
CREATE TABLE "shortcut_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'shortcut:transactions',
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shortcut_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_cards" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "default_category" "BudgetCategory",
    "financial_institution_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_rules" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "merchant_key" TEXT NOT NULL,
    "category" "BudgetCategory" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shortcut_tokens_token_hash_key" ON "shortcut_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "shortcut_tokens_user_id_idx" ON "shortcut_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_cards_user_id_name_key" ON "wallet_cards"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_rules_user_id_merchant_key_key" ON "merchant_rules"("user_id", "merchant_key");

-- AddForeignKey
ALTER TABLE "shortcut_tokens" ADD CONSTRAINT "shortcut_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_cards" ADD CONSTRAINT "wallet_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_cards" ADD CONSTRAINT "wallet_cards_financial_institution_id_fkey" FOREIGN KEY ("financial_institution_id") REFERENCES "financial_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_rules" ADD CONSTRAINT "merchant_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Supabase exposes every public table through PostgREST: enable RLS (no
-- policies; the app pooler role has BYPASSRLS), see
-- 20261025000000_enable_rls_remaining_tables.
ALTER TABLE "shortcut_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallet_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "merchant_rules" ENABLE ROW LEVEL SECURITY;
