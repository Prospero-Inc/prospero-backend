-- Enable RLS with no policies on every public table. Closes Supabase's
-- auto-generated PostgREST API (anon/authenticated roles) to these tables.
-- The app connects via the `postgres.<ref>` pooler role, which has
-- BYPASSRLS, so this does not affect the NestJS/Prisma backend.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fixed_expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "salaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
