/*
  Warnings:

  - You are about to drop the column `device_token` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `reset_password_token` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `role_id` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `roles` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[api_key]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_role_id_fkey";

-- DropIndex
DROP INDEX "users_reset_password_token_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "device_token",
DROP COLUMN "reset_password_token",
DROP COLUMN "role_id",
ADD COLUMN     "2fa_secret" TEXT,
ADD COLUMN     "api_key" TEXT,
ADD COLUMN     "enable_2fa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "last_name" TEXT;

-- DropTable
DROP TABLE "roles";

-- CreateIndex
CREATE UNIQUE INDEX "users_api_key_key" ON "users"("api_key");
