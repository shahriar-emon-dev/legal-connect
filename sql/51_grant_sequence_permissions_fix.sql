-- =============================================================================
-- Migration 51: Fix Sequence Permissions for Serial IDs (Job Posts & Proposals)
-- Description: Resolves "permission denied for sequence job_posts_id_seq" when
--              authenticated users (Clients/Lawyers) insert rows into job_posts,
--              job_proposals, or any other SERIAL/BIGSERIAL backed tables.
-- =============================================================================

-- 1. Explicitly grant USAGE and SELECT on all existing sequences in public schema
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;

-- 2. Specifically grant ALL on known SERIAL sequences to ensure zero permission errors
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'job_posts_id_seq') THEN
    GRANT ALL ON SEQUENCE public.job_posts_id_seq TO authenticated, anon, service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'job_proposals_id_seq') THEN
    GRANT ALL ON SEQUENCE public.job_proposals_id_seq TO authenticated, anon, service_role;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Set default privileges so any future sequences created automatically get permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anon, service_role;

-- 4. Verify table INSERT grants for authenticated users on job_posts and job_proposals
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.job_proposals TO authenticated;

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
