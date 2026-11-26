-- plan-rendimiento B7: one payment per fixed expense occurrence, so two
-- concurrent "mark as paid" clicks can't both insert (pay() maps P2002 to 409).
-- Partial index: Prisma can't express it in schema.prisma, so a future
-- `migrate dev` will propose dropping it — delete that line from the diff.
-- Verified in prod before shipping: no (fixed_expense_id, date) duplicates.
CREATE UNIQUE INDEX "transactions_fixed_expense_id_date_key" ON "transactions"("fixed_expense_id", "date") WHERE "fixed_expense_id" IS NOT NULL;
