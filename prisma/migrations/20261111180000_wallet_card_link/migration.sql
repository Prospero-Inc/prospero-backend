-- iPhone Shortcuts, second step: which Wallet card paid each Shortcut
-- transaction, and whether an auto-registered card was already configured.
-- Expand-only (nullable column, FK with SET NULL, index); no new tables, so no
-- new RLS statements.

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "wallet_card_id" INTEGER;

-- AlterTable
ALTER TABLE "wallet_cards" ADD COLUMN     "configured_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "transactions_wallet_card_id_idx" ON "transactions"("wallet_card_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_card_id_fkey" FOREIGN KEY ("wallet_card_id") REFERENCES "wallet_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

