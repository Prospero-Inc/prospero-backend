/*
  Warnings:

  - Added the required column `month` to the `salaries` table without a default value. This is not possible if the table is not empty.
  - Added the required column `year` to the `salaries` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Mes" AS ENUM ('Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre');

-- AlterTable
ALTER TABLE "salaries" ADD COLUMN     "month" "Mes" NOT NULL,
ADD COLUMN     "year" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "distribution_idx" ON "distributions"("fixed_expenses", "variable_expenses", "savings");

-- CreateIndex
CREATE INDEX "fixed_expense_due_date_category_idx" ON "fixed_expenses"("due_date", "category");

-- CreateIndex
CREATE INDEX "salary_month_year_idx" ON "salaries"("month", "year");

-- CreateIndex
CREATE INDEX "transaction_date_category_idx" ON "transactions"("date", "category");
