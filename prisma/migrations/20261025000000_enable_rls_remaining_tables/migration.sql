-- Enable RLS (no policies) on the public tables Supabase's Security Advisor
-- still flags as exposed through its auto-generated PostgREST API: the two
-- created by 20261011103000_add_notifications, which didn't enable it, and
-- Prisma's own migration ledger. Same rationale as
-- 20260929000000_enable_row_level_security: the app and `prisma migrate`
-- connect as the `postgres.<ref>` pooler role, which has BYPASSRLS, so this
-- only closes the anon/authenticated API.
--
-- Every future migration that creates a table must enable RLS on it too.
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
