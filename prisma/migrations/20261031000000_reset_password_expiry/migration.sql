-- Password-reset links now expire (60 min) and the column holds the token's
-- SHA-256 instead of the raw value. Links issued before this migration were
-- stored raw and never expire: drop them, users just request a new one.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "reset_password_expires_at" TIMESTAMP(3);

UPDATE "users" SET "reset_password_token" = NULL WHERE "reset_password_token" IS NOT NULL;
