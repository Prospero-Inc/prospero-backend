/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Distribution` table. All the data in the column will be lost.
  - You are about to drop the column `fixedExpenses` on the `Distribution` table. All the data in the column will be lost.
  - You are about to drop the column `salaryId` on the `Distribution` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Distribution` table. All the data in the column will be lost.
  - You are about to drop the column `variableExpenses` on the `Distribution` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `FixedExpense` table. All the data in the column will be lost.
  - You are about to drop the column `dueDate` on the `FixedExpense` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `FixedExpense` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `FixedExpense` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Salary` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Salary` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Salary` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `roleId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[salary_id]` on the table `Distribution` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[user_id]` on the table `FixedExpense` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[user_id]` on the table `Salary` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[user_id]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `fixed_expenses` to the `Distribution` table without a default value. This is not possible if the table is not empty.
  - Added the required column `salary_id` to the `Distribution` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Distribution` table without a default value. This is not possible if the table is not empty.
  - Added the required column `variable_expenses` to the `Distribution` table without a default value. This is not possible if the table is not empty.
  - Added the required column `due_date` to the `FixedExpense` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `FixedExpense` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `FixedExpense` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Salary` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `Salary` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `role_id` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Distribution" DROP CONSTRAINT "Distribution_salaryId_fkey";

-- DropForeignKey
ALTER TABLE "FixedExpense" DROP CONSTRAINT "FixedExpense_userId_fkey";

-- DropForeignKey
ALTER TABLE "Salary" DROP CONSTRAINT "Salary_userId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_userId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_roleId_fkey";

-- DropIndex
DROP INDEX "Distribution_salaryId_key";

-- DropIndex
DROP INDEX "Salary_userId_key";

-- AlterTable
ALTER TABLE "Distribution" DROP COLUMN "createdAt",
DROP COLUMN "fixedExpenses",
DROP COLUMN "salaryId",
DROP COLUMN "updatedAt",
DROP COLUMN "variableExpenses",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fixed_expenses" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "salary_id" INTEGER NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "variable_expenses" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "FixedExpense" DROP COLUMN "createdAt",
DROP COLUMN "dueDate",
DROP COLUMN "updatedAt",
DROP COLUMN "userId",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "due_date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "user_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Salary" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
DROP COLUMN "userId",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "user_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
DROP COLUMN "userId",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "user_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "createdAt",
DROP COLUMN "roleId",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "role_id" INTEGER NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Distribution_salary_id_key" ON "Distribution"("salary_id");

-- CreateIndex
CREATE UNIQUE INDEX "FixedExpense_user_id_key" ON "FixedExpense"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Salary_user_id_key" ON "Salary"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_user_id_key" ON "Transaction"("user_id");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Salary" ADD CONSTRAINT "Salary_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_salary_id_fkey" FOREIGN KEY ("salary_id") REFERENCES "Salary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
