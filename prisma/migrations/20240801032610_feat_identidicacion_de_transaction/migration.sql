/*
  Warnings:

  - Added the required column `type` to the `transactions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('FixedExpense', 'VariableExpense', 'Savings');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "type" "TransactionType" NOT NULL;
