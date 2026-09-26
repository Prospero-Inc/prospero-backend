-- AlterTable
ALTER TABLE "salaries" ADD COLUMN     "budget_category" "BudgetCategory",
ADD COLUMN     "distribute_automatically" BOOLEAN NOT NULL DEFAULT false;
