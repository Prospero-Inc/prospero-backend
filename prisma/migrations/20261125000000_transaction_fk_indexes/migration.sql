-- plan-rendimiento B2/B12: index the transaction foreign keys the app reads
-- or that ON DELETE SET NULL has to scan, and drop two indexes no query uses
-- (every transaction read filters by user_id first, covered by
-- transaction_user_date_idx; username/email already have unique indexes).
-- Index-only: no new tables, so no new RLS statements.

-- DropIndex
DROP INDEX "transaction_date_category_idx";

-- DropIndex
DROP INDEX "user_search_idx";

-- CreateIndex
CREATE INDEX "transactions_fixed_expense_id_date_idx" ON "transactions"("fixed_expense_id", "date");

-- CreateIndex
CREATE INDEX "transactions_institution_id_idx" ON "transactions"("institution_id");
