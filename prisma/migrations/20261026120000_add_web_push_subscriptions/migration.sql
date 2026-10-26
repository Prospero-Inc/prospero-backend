-- Web Push notifications (standard VAPID, `web-push` npm package — no
-- Firebase). Adds the Push channel, per-user browser subscriptions, and the
-- per-type opt-out for push on GmailReviewPending.

-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'Push';

-- AlterTable
ALTER TABLE "notification_preferences" ADD COLUMN     "gmail_review_push_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS (no policies) — production is Supabase, which exposes every
-- public table through PostgREST. The app's pooler role has BYPASSRLS, so
-- this only closes the anon/authenticated API. See
-- 20261025000000_enable_rls_remaining_tables.
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
