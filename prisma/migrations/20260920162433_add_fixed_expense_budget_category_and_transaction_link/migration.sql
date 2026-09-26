/*
  Warnings:

  - You are about to drop the column `category` on the `fixed_expenses` table. All the data in the column will be lost.
  - Added the required column `budget_category` to the `fixed_expenses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `fixed_expenses` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "fixed_expense_due_date_category_idx";

-- DropIndex
DROP INDEX "fixed_expenses_user_id_key";

-- AlterTable
ALTER TABLE "fixed_expenses" DROP COLUMN "category",
ADD COLUMN     "budget_category" "BudgetCategory" NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "fixed_expense_id" INTEGER;

-- CreateIndex
CREATE INDEX "fixed_expense_user_due_date_idx" ON "fixed_expenses"("user_id", "due_date");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_fixed_expense_id_fkey" FOREIGN KEY ("fixed_expense_id") REFERENCES "fixed_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
