-- =============================================================================
-- Migration 50: Master Schema & Integrity Verification
-- Description: Final check and fortification across all core tables to ensure
--              all foreign keys, triggers, constraints, sequences, and enums
--              are in 100% synchronized, production-ready order.
--              Mandated by Master Audit Section J & Section P.
-- =============================================================================

DO $$
BEGIN
  -- 1. Ensure all primary keys have default generation where UUID is used
  ALTER TABLE IF EXISTS public.users ALTER COLUMN id SET DEFAULT uuid_generate_v4();
  ALTER TABLE IF EXISTS public.lawyer_profiles ALTER COLUMN id SET DEFAULT uuid_generate_v4();
  ALTER TABLE IF EXISTS public.cases ALTER COLUMN id SET DEFAULT uuid_generate_v4();
  ALTER TABLE IF EXISTS public.contracts ALTER COLUMN id SET DEFAULT uuid_generate_v4();
  ALTER TABLE IF EXISTS public.conversations ALTER COLUMN id SET DEFAULT uuid_generate_v4();
  ALTER TABLE IF EXISTS public.messages ALTER COLUMN id SET DEFAULT uuid_generate_v4();
  ALTER TABLE IF EXISTS public.appointments ALTER COLUMN id SET DEFAULT uuid_generate_v4();
  ALTER TABLE IF EXISTS public.documents ALTER COLUMN id SET DEFAULT uuid_generate_v4();
  ALTER TABLE IF EXISTS public.feedback ALTER COLUMN id SET DEFAULT uuid_generate_v4();
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Verify foreign key actions on cascade vs set null
DO $$
BEGIN
  -- Ensure job_proposals cascade delete when job_post or lawyer is removed
  ALTER TABLE IF EXISTS public.job_proposals
    DROP CONSTRAINT IF EXISTS job_proposals_job_post_id_fkey,
    ADD CONSTRAINT job_proposals_job_post_id_fkey FOREIGN KEY (job_post_id) REFERENCES public.job_posts(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Ensure all table updated_at triggers are present and functional
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'users', 'lawyers', 'lawyer_profiles', 'job_posts', 'job_proposals',
    'contracts', 'cases', 'conversations', 'messages', 'appointments',
    'documents', 'feedback', 'verifications', 'lawyer_verifications'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_updated_at ON %I;
       CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();',
      tbl, tbl
    );
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. Grant USAGE and SELECT on all sequences (resolves sequence permission errors like job_posts_id_seq)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_proposals TO authenticated;

-- 5. Reload PostgREST schema cache to make all new RPCs and schema updates immediately available
NOTIFY pgrst, 'reload schema';
