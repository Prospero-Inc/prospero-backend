/*
  Warnings:

  - You are about to drop the column `month` on the `salaries` table. All the data in the column will be lost.
  - You are about to drop the column `year` on the `salaries` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the `distributions` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `date` to the `salaries` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `category` on the `transactions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('Biweekly', 'Monthly');

-- CreateEnum
CREATE TYPE "BudgetCategory" AS ENUM ('Necesidad', 'Deseo', 'Ahorro');

-- CreateEnum
CREATE TYPE "PeriodOverride" AS ENUM ('Previous', 'Current');

-- CreateEnum
CREATE TYPE "IncomeType" AS ENUM ('Payroll', 'Extra');

-- DropForeignKey
ALTER TABLE "distributions" DROP CONSTRAINT "distributions_salary_id_fkey";

-- DropIndex
DROP INDEX "salary_month_year_idx";

-- AlterTable
ALTER TABLE "salaries" DROP COLUMN "month",
DROP COLUMN "year",
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "type" "IncomeType" NOT NULL DEFAULT 'Payroll';

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "type",
ADD COLUMN     "period_override" "PeriodOverride",
DROP COLUMN "category",
ADD COLUMN     "category" "BudgetCategory" NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "needs_percent" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ADD COLUMN     "pay_frequency" "PayFrequency" NOT NULL DEFAULT 'Biweekly',
ADD COLUMN     "savings_percent" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
ADD COLUMN     "wants_percent" DOUBLE PRECISION NOT NULL DEFAULT 0.3;

-- DropTable
DROP TABLE "distributions";

-- DropEnum
DROP TYPE "Mes";

-- DropEnum
DROP TYPE "TransactionType";

-- CreateIndex
CREATE INDEX "salary_user_date_idx" ON "salaries"("user_id", "date");

-- CreateIndex
CREATE INDEX "transaction_date_category_idx" ON "transactions"("date", "category");
